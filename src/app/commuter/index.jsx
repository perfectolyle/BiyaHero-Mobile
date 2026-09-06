import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { distanceM } from '@/services/geo'
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { MaterialIcons } from '@expo/vector-icons'
import { Map } from '@/components/Map'
import { SearchBar } from '@/components/SearchBar'
import { VehicleCard } from '@/components/VehicleCard'
import { EmptyState } from '@/components/EmptyState'
import { Sheet } from '@/components/ui/Sheet'
import { VehicleSheetHead, VehicleSheetBody, DriverSheet } from '@/components/VehicleSheet'
import { Txt } from '@/components/ui/Txt'
import { Chip } from '@/components/ui/Chip'
import { fetchRoute } from '@/services/api'
import { useStore } from '@/services/store'
import { elevation } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'
import { useCopy } from '@/constants/copy'

/**
 * 04/05 · Map Home, plus 07 (destination set), 09 (all stale) and 10 (no match).
 *
 * Opens with no questions asked: no account, no location permission. The user
 * drags the map to their area, and searching FILTERS this view rather than
 * navigating away from it.
 */
/**
 * How much of the screen the sheet keeps at rest, in dp. Also handed to the map
 * as padding, so the camera frames into the part that is visible and Google's
 * attribution is not buried under the sheet.
 */
const PEEK = 330

/**
 * The collapsed stop: a grabber, a chevron and nothing else, so the map can
 * have almost the whole screen. Not zero — a sheet that can vanish is a sheet
 * the commuter has to know a gesture to get back.
 */
const MINI = 92

/**
 * The sheet rests taller with a jeepney open than it does over the list.
 *
 * The detail has four things to show and the last two — the street it is on
 * right now, and the switch that shows the driver where you are waiting — are
 * the reason the screen exists. At the list's 330 they sat under the fold with
 * nothing saying they were there.
 *
 * 470 is what a 16:9 photo costs once those two are above the fold. It is a
 * tall sheet; the map is a drag away at the collapsed stop. The map padding
 * does NOT follow this, so opening a vehicle raises the sheet over a map that
 * stays exactly where it was.
 */
const DETAIL_PEEK = 470

export default function MapHome() {
	const copy = useCopy()
	const { theme, statusBar } = useTheme()
	const router = useRouter()
	const insets = useSafeAreaInsets()

	const vehicles = useStore(s => s.vehicles)
	const destination = useStore(s => s.destination)
	const vehicleFilter = useStore(s => s.vehicleFilter)
	const corridorRadiusM = useStore(s => s.corridorRadiusM)
	const searchedPosition = useStore(s => s.destinationPosition)
	const vehiclesFor = useStore(s => s.vehiclesFor)
	const error = useStore(s => s.error)
	const hasReplied = useStore(s => s.hasReplied)
	const loading = useStore(s => s.loading)
	const destinationResolved = useStore(s => s.destinationResolved)
	const selectedVehicleId = useStore(s => s.selectedVehicleId)
	const setVehicleFilter = useStore(s => s.setVehicleFilter)
	const clearDestination = useStore(s => s.clearDestination)
	const selectVehicle = useStore(s => s.selectVehicle)
	const startPolling = useStore(s => s.startPolling)
	const stopPolling = useStore(s => s.stopPolling)
	const myLocation = useStore(s => s.myLocation)
	const myLocationOn = useStore(s => s.myLocationOn)
	const toggleMyLocation = useStore(s => s.toggleMyLocation)
	const enableMyLocation = useStore(s => s.enableMyLocation)
	// The very first request has not answered yet, which is not the same as
	// "nobody is driving". Announcing an empty fleet before the reply lands is
	// the first thing a judge sees on a cold start, and every time the venue
	// wifi hiccups.
	// "First" means first: the store records the first reply for this
	// destination, and only until then is silence loading. Keyed on `loading`,
	// every 8 s poll blinked an honestly empty fleet back to a spinner.
	const awaitingFirstReply = !hasReplied && !error

	const [locateNonce, setLocateNonce] = useState(0)
	// Where the sheet is resting. The map is padded by it, so collapsing the
	// sheet genuinely gives the map the screen rather than just covering less.
	const [sheetPos, setSheetPos] = useState('peek')
	const [driverOpen, setDriverOpen] = useState(false)
	// Camera committed to the selected jeepney. Off by default: the commuter
	// asked to see ONE vehicle, not to have the map taken away from them.
	const [following, setFollowing] = useState(false)

	const onCrosshair = async () => {
		if (myLocationOn) {
			// Already on: first re-tap recentres; turning it off is done from the
			// same button via long-press semantics being overkill — recentre wins.
			setLocateNonce(n => n + 1)
			return
		}
		const ok = await enableMyLocation()
		if (ok) setLocateNonce(n => n + 1)
	}

	useFocusEffect(
		useCallback(() => {
			startPolling()
			return () => stopPolling()
		}, [])
	)

	const allStale = vehicles.length > 0 && vehicles.every(v => v.stale)
	// The selected jeepney is only as live as the last answer about it: either
	// the server's ping is old, or ours stopped arriving. A commuter cannot tell
	// those apart and does not need to — both mean what is on screen is a memory.
	const degradedFleet = !!error && vehicles.length > 0
	// The type chip filters on the server, so with one on the number below is
	// about the filter, not about the road.
	const filtering = vehicleFilter !== 'all'
	const selected = useMemo(
		() => vehicles.find(v => v.id === selectedVehicleId),
		[vehicles, selectedVehicleId]
	)
	const degraded = !!selected?.stale || degradedFleet
	const sheetPeek = selected ? DETAIL_PEEK : PEEK
	// The listing carries route IDS, not geometry — twenty-one polylines were
	// 262 KB of JSON every eight seconds to draw at most one line. The corridor
	// for the vehicle actually tapped is fetched once and kept, so re-selecting
	// it costs nothing.
	const [selectedRoute, setSelectedRoute] = useState(null)
	const routeCache = useRef({})
	const routeId = selected?.route?.id ?? null

	useEffect(() => {
		if (!routeId) return setSelectedRoute(null)

		// Set before the request, not only after it: leaving the last vehicle's
		// corridor on screen while the next one loads draws a line the selected
		// jeepney does not run — and if the fetch fails, forever.
		setSelectedRoute(routeCache.current[routeId] ?? null)
		if (routeCache.current[routeId]) return

		let cancelled = false
		fetchRoute(routeId)
			.then(r => {
				const points = (r?.waypoints ?? []).map(w => ({ latitude: Number(w.lat), longitude: Number(w.lng) }))
				routeCache.current[routeId] = points
				if (!cancelled) setSelectedRoute(points)
			})
			// No line beats a wrong one; the vehicle pin still shows where it is.
			.catch(() => !cancelled && setSelectedRoute(null))

		return () => {
			cancelled = true
		}
	}, [routeId])

	// The place the map should name: the selected vehicle's destination first,
	// otherwise the destination being searched for. Both are public places.
	// Route-end fallback matches the detail screen — a route line without a
	// head is exactly the floating squiggle the pin exists to prevent.
	const destinationPin = useMemo(() => {
		if (selected) {
			const at = selected.destinationPosition ?? selectedRoute?.[selectedRoute.length - 1]
			if (at) return { ...at, label: selected.destination }
		}
		if (destination?.lat != null) {
			return { latitude: Number(destination.lat), longitude: Number(destination.lng), label: destination.name }
		}
		// A typed place we do not list: the server located it for us.
		if (destination && searchedPosition) {
			return { ...searchedPosition, label: destination.name }
		}
		return null
	}, [selected, selectedRoute, destination, searchedPosition])

	// Whether "near me" means anything right now. Off, or on but with the fix
	// still in flight (the watcher can die after a seed fix, so myLocation alone
	// is not proof), and the server's order stands.
	const located = myLocationOn && !!myLocation

	// Everything the server sent. The distance chips that used to cut this down
	// are gone: the list is already ordered by who reaches this commuter first,
	// which answers the same question without hiding rides — and a filter that
	// empties the list looks exactly like a corridor with nothing running.
	const shownVehicles = vehicles

	const fitTo = useMemo(
		() =>
			destination
				? [...shownVehicles.map(v => v.position), destinationPin].filter(Boolean)
				: null,
		[destination, shownVehicles, destinationPin]
	)

	// Straight from the server, so the promise on screen matches the filter
	// that actually produced the list.
	const corridorRadiusText = corridorRadiusM
		? corridorRadiusM < 1000
			? `${corridorRadiusM} m`
			: `${(corridorRadiusM / 1000).toFixed(1)} km`
		: '1.5 km'

	// Frame once per SET of matches — not per poll, and not just per search.
	// The filtered list arrives a beat after the destination does (the old
	// citywide fleet is still in state), and the filter chips narrow it again;
	// keying on the ids re-frames for those and stays put while they only move.
	const fitKey = useMemo(
		() => (destination ? `${destination.name}|${vehicleFilter}|${shownVehicles.map(v => v.id).join(',')}` : 'none'),
		[destination, vehicleFilter, shownVehicles]
	)

	// Stable identity: memoised pins and cards compare onSelect/onPress by
	// reference, so an inline arrow here would defeat them every poll.
	//
	// Tapping a jeepney used to push a second screen that mounted a second map,
	// refetched the corridor and re-framed the camera — the map visibly tore
	// down and rebuilt around a vehicle the commuter was already looking at.
	// The detail is the same sheet over the same map now: it rises, the map
	// underneath does not move, and closing it lowers the sheet back to the
	// list. The route line and the destination pin were already drawn here for
	// the selected vehicle, so there was never much on that screen worth a
	// second MapView.
	const openVehicle = useCallback(vehicle => {
		selectVehicle(vehicle.id)
		setSheetPos('peek')
		setFollowing(false)
	}, [selectVehicle])

	const closeVehicle = useCallback(() => {
		selectVehicle(null)
		setDriverOpen(false)
		setFollowing(false)
	}, [selectVehicle])

	// With the blue dot on, the list answers "which ride reaches me first" —
	// live vehicles nearest-first, stale ones after (their "position" is only
	// where they were last seen). Distances are ranked in 100 m buckets with an
	// id tie-break so GPS jitter and 8 s hops don't shuffle cards under the
	// user's finger. Off, the server's order stands.
	//
	// A destination no longer switches this off. The server has already kept
	// only the rides that pass the place, ordered by how close their route runs
	// to it — but two jeepneys that both pass Baclaran are not the same answer
	// when one is 300 m from the commuter and the other is in Alabang. Which
	// reaches ME first is still the question; the destination only narrows who
	// is eligible.
	const listVehicles = useMemo(() => {
		if (!located) return shownVehicles
		const rank = v => Math.round((distanceM(myLocation, v.position) ?? Infinity) / 100)
		return [...shownVehicles].sort((a, b) => (a.stale - b.stale) || (rank(a) - rank(b)) || (a.id - b.id))
	}, [shownVehicles, located, myLocation])

	// Crosshair: the ONLY way the app ever asks for a commuter location. It
	// rides in the map's own control column so it and the layer button share a
	// right edge and an even gap, the way a map app stacks its buttons.
	// Only while a jeepney is selected, and directly above the crosshair so the
	// two "where should the camera look" controls sit together.
	const followControl = selected ? (
		<Pressable
			onPress={() => setFollowing(f => !f)}
			accessibilityRole="switch"
			accessibilityState={{ checked: following }}
			accessibilityLabel={copy.vehicle.centerOnVehicle}
			// Colours inline rather than through a conditional className: a template
			// literal is resolved at runtime and the two branches did not switch
			// reliably, leaving the control reading ON from a cold start.
			style={[
				elevation.float,
				{
					backgroundColor: following ? theme.brand.default : theme.surface.default,
					borderColor: following ? theme.brand.default : theme.border.subtle
				}
			]}
			className="h-14 w-14 items-center justify-center rounded-full border-[1.5px] active:opacity-80"
		>
			{/* A jeepney, not a second crosshair. Beside the my-location control
			    the two gps glyphs were indistinguishable — both a ring with a dot —
			    so nothing on the map said which button aimed at the vehicle and
			    which aimed at you. The vehicle button shows the thing it follows. */}
			<MaterialIcons
				name="directions-bus"
				size={24}
				color={following ? theme.text.onBrand : theme.icon.secondary}
			/>
		</Pressable>
	) : null

	const crosshair = (
		<Pressable
			onPress={onCrosshair}
			onLongPress={toggleMyLocation}
			accessibilityRole="button"
			accessibilityLabel={copy.mapHome.myLocation}
			accessibilityState={{ selected: myLocationOn }}
			style={elevation.float}
			className="h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-line-subtle bg-surface active:opacity-80"
		>
			<MaterialIcons name={myLocationOn ? 'my-location' : 'location-searching'} size={24} color={myLocationOn ? '#1A73E8' : theme.icon.secondary} />
		</Pressable>
	)

	return (
		<View className="flex-1 bg-surface-canvas">
			<StatusBar style={statusBar} />
			<Map
				rememberRegion
				vehicles={shownVehicles}
				selectedId={selectedVehicleId}
				onSelect={openVehicle}
				onMapPress={() => selectVehicle(null)}
				fitKey={fitKey}
				route={selectedRoute}
				routeTarget={selected?.destinationPosition ?? null}
				routeAnchor={selectedVehicleId}
				destinationPin={destinationPin}
				fitTo={fitTo}
				myLocation={myLocation}
				locateNonce={locateNonce}
				// Following the glide rather than the raw fix is what makes the camera
				// read as committed to a moving jeepney instead of hopping once per
				// ping. A finger beats it: a real gesture releases the follow, so the
				// map never fights a drag.
				follow={!!selected && following}
				followKey={selected ? `v:${selected.id}` : null}
				centerOn={selected?.position ?? null}
				onUserPan={() => setFollowing(false)}
				controls={
					<>
						{followControl}
						{crosshair}
					</>
				}
				controlsBottom={sheetPeek + 20}
				// The sheet, as map padding. Without it Google's own attribution sits
				// under the sheet in every state — the sheet cannot go below its peek
				// — which is a Maps terms violation as well as a thing the commuter
				// never sees; and a searched destination was framed into a box whose
				// lower third the sheet covered.
				// Only the collapsed height, so the Google logo sits at the bottom
				// left of the map instead of floating a third of the way up it. The
				// fit is told about the rest of the sheet separately.
				bottomInset={MINI}
				fitBottomExtra={sheetPeek - MINI}
			/>

			{selected ? (
				<Pressable
					onPress={closeVehicle}
					accessibilityRole="button"
					accessibilityLabel={copy.common.back}
					style={{ top: insets.top + 6, ...elevation.float }}
					className="absolute left-6 h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-line-subtle bg-surface active:opacity-80"
				>
					<MaterialIcons name="arrow-back" size={22} color={theme.icon.primary} />
				</Pressable>
			) : (
			<View style={{ top: insets.top + 6 }} className="absolute left-6 right-6 flex-row items-center gap-2">
				<View className="flex-1">
					<SearchBar
						value={destination?.name}
						onPress={() => router.push('/commuter/search')}
						onClear={clearDestination}
					/>
				</View>
				<Pressable
					onPress={() => router.push('/settings')}
					accessibilityRole="button"
					accessibilityLabel={copy.settings.title}
					style={elevation.float}
					className="h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-line-subtle bg-surface active:opacity-80"
				>
					<MaterialIcons name="settings" size={22} color={theme.icon.secondary} />
				</Pressable>
			</View>
			)}

			<Sheet
				peekHeight={sheetPeek}
				miniHeight={MINI}
				position={sheetPos}
				onPositionChange={setSheetPos}
				head={
					selected ? (
						<VehicleSheetHead
							vehicle={selected}
							degraded={degraded}
							onOpenDriver={() => setDriverOpen(true)}
						/>
					) : (
					<View className="gap-3 pb-3">
						<View className="gap-[3px]">
							<Txt variant="headingM">
								{awaitingFirstReply
									? copy.common.loading
									: destination
										? copy.search.resultsTitle(shownVehicles.length, destination.name)
										: filtering
											? copy.mapHome.filteredCount(shownVehicles.length)
											: copy.mapHome.activeCount(shownVehicles.length)}
							</Txt>
							<Txt variant="caption" className="text-fg-secondary">
								{destination
								? copy.search.resultsSubtitle(destination.name, corridorRadiusText)
								: myLocationOn
									? copy.mapHome.updateNoteLocated
									: copy.mapHome.updateNote}
							</Txt>
						</View>

						{/* One row that scrolls, not two that wrap. Five chips wrapped to
						    a second line and took 46dp out of the peek, which is what
						    cut the first vehicle card in half — through its capacity
						    badge, the one thing a commuter reads before deciding to run
						    for it. The sheet's own pan gives up on a horizontal drag
						    (failOffsetX), so this scrolls without fighting it. */}
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={false}
							contentContainerClassName="gap-2 pr-6"
						>
							{copy.mapHome.filters.map(f => (
								<Chip
									key={f.key}
									label={f.label}
									active={vehicleFilter === f.key}
									onPress={() => setVehicleFilter(f.key)}
								/>
							))}
						</ScrollView>

					</View>
					)
				}
			>
				{selected ? (
					<ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
						<VehicleSheetBody vehicle={selected} degraded={degraded} />
					</ScrollView>
				) : (
				<>
				{/* The empty state already tells a commuter the request failed. With
				    cards on screen nothing did: every poll could reject for ten
				    minutes while the header still said twelve are active now and
				    every card kept its LIVE pill and its street name. The banner is
				    the one place that can say the list has stopped moving. */}
				{error && vehicles.length > 0 ? (
					<View className="mb-3 flex-row items-center gap-3 rounded-lg bg-capacity-stale-bg p-3">
						<MaterialIcons name="wifi-off" size={20} color={theme.capacity.stale.fg} />
						<View className="min-w-0 flex-1">
							<Txt variant="bodyMStrong" className="text-capacity-stale-fg">{copy.search.offlineTitle}</Txt>
							<Txt variant="caption" className="text-fg-secondary">{copy.search.offlineBody}</Txt>
						</View>
					</View>
				) : allStale ? (
					<View className="mb-3 flex-row items-center gap-3 rounded-lg bg-capacity-stale-bg p-3">
						<MaterialIcons name="signal-wifi-statusbar-null" size={20} color={theme.capacity.stale.fg} />
						<View className="min-w-0 flex-1">
							<Txt variant="bodyMStrong" className="text-capacity-stale-fg">{copy.vehicle.staleTitle}</Txt>
							<Txt variant="caption" className="text-fg-secondary">{copy.vehicle.staleBody}</Txt>
						</View>
					</View>
				) : null}

				<ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-[10px] pb-8">
					{awaitingFirstReply ? (
						<View className="items-center py-10">
							<ActivityIndicator color={theme.brand.hover} />
						</View>
					) : vehicles.length === 0 ? (
						<EmptyState
							// Three different silences, and only one of them is "nobody is
							// driving": the request may have failed, or the place may not
							// exist. Saying the wrong one sends the user hunting for a
							// jeepney that was never the problem.
							icon={error ? 'wifi-off' : destination ? 'search-off' : 'directions-bus'}
							title={
								error
									? copy.search.offlineTitle
									: destination && !destinationResolved
										? copy.search.unknownPlaceTitle(destination.name)
										: destination
											? copy.search.emptyTitle(destination.name)
											: copy.search.noneActiveTitle
							}
							body={
								error
									? copy.search.offlineBody
									: destination && !destinationResolved
										? copy.search.unknownPlaceBody
										: destination
											? copy.search.emptyBody
											: copy.search.noneActiveBody
							}
						/>
					) : (
						listVehicles.map((v, i) => (
							<VehicleCard
								key={v.id}
								vehicle={v}
								onPress={openVehicle}
								// Never on a stale card — "closest" must not assert live
								// proximity from a minutes-old last-seen position.
								nearest={i === 0 && located && !!v.position && !v.stale}
								passesNote={
									// Only once the list itself has caught up with the
									// destination — otherwise the previous search's
									// distances would be printed under the new name.
									destination && vehiclesFor === destination.name && v.passesWithinM != null
										? copy.vehicle.passesWithin(v.passesWithinM, destination.name)
										: null
								}
							/>
						))
					)}
				</ScrollView>
				</>
				)}
			</Sheet>

			<DriverSheet vehicle={selected} visible={driverOpen} onClose={() => setDriverOpen(false)} />
		</View>
	)
}
