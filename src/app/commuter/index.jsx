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
	const radiusKm = useStore(s => s.radiusKm)
	const setRadiusKm = useStore(s => s.setRadiusKm)
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
	const selected = useMemo(
		() => vehicles.find(v => v.id === selectedVehicleId),
		[vehicles, selectedVehicleId]
	)
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

	// The vehicles the map and the list agree on. The distance chip is applied
	// here, on the phone: the server never learns where the commuter is from a
	// filter any more than from a listing. A stale vehicle is judged by its last
	// known position — that is the honest answer to "is it within 3 km".
	const shownVehicles = useMemo(() => {
		if (!located || radiusKm == null) return vehicles
		const limit = radiusKm * 1000
		return vehicles.filter(v => (distanceM(myLocation, v.position) ?? Infinity) <= limit)
	}, [vehicles, located, radiusKm, myLocation])

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
		() => (destination ? `${destination.name}|${vehicleFilter}|${radiusKm}|${shownVehicles.map(v => v.id).join(',')}` : 'none'),
		[destination, vehicleFilter, radiusKm, shownVehicles]
	)

	// Stable identity: memoised pins and cards compare onSelect/onPress by
	// reference, so an inline arrow here would defeat them every poll.
	const openVehicle = useCallback(vehicle => {
		selectVehicle(vehicle.id)
		router.push(`/commuter/vehicle/${vehicle.id}`)
	}, [selectVehicle, router])

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
				controls={crosshair}
				controlsBottom={350}
			/>

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

			<Sheet
				peekHeight={330}
				head={
					<View className="gap-3 pb-3">
						<View className="gap-[3px]">
							<Txt variant="headingM">
								{awaitingFirstReply
									? copy.common.loading
									: destination
										? copy.search.resultsTitle(shownVehicles.length, destination.name)
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

						<View className="flex-row flex-wrap gap-2">
							{copy.mapHome.filters.map(f => (
								<Chip
									key={f.key}
									label={f.label}
									active={vehicleFilter === f.key}
									onPress={() => setVehicleFilter(f.key)}
								/>
							))}
						</View>

						{/* Distance. Its own row, because it answers a different
						    question from the type chips — not WHAT is out there
						    but what can actually reach me. Until the location
						    toggle is on there is nothing to measure from, so the
						    row is a single chip that turns it on; "within 3 km"
						    of nowhere is not a filter.

						    Three chips, no "any": a fourth wrapped the row onto a
						    second line on a 360dp screen. Tapping the active chip
						    again clears the limit — nothing selected IS "any". */}
						<View className="flex-row flex-wrap gap-2">
							{located ? (
								[1, 3, 5].map(km => (
									<Chip
										key={km}
										label={copy.mapHome.radius.km(km)}
										active={radiusKm === km}
										onPress={() => setRadiusKm(radiusKm === km ? null : km)}
									/>
								))
							) : (
								<Chip label={copy.mapHome.radius.nearMe} active={false} onPress={enableMyLocation} />
							)}
						</View>
					</View>
				}
			>
				{allStale && (
					<View className="mb-3 flex-row items-center gap-3 rounded-lg bg-capacity-stale-bg p-3">
						<MaterialIcons name="signal-wifi-statusbar-null" size={20} color={theme.capacity.stale.fg} />
						<View className="min-w-0 flex-1">
							<Txt variant="bodyMStrong" className="text-capacity-stale-fg">{copy.vehicle.staleTitle}</Txt>
							<Txt variant="caption" className="text-fg-secondary">{copy.vehicle.staleBody}</Txt>
						</View>
					</View>
				)}

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
			</Sheet>
		</View>
	)
}
