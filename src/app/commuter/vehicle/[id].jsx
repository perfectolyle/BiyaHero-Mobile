import { useEffect, useMemo, useRef, useState } from 'react'
import { View, ScrollView, Pressable, ActivityIndicator, Image, Modal } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { MaterialIcons } from '@expo/vector-icons'
import { Map } from '@/components/Map'
import { Sheet } from '@/components/ui/Sheet'
import { Txt } from '@/components/ui/Txt'
import { Toggle } from '@/components/ui/Toggle'
import { VehicleGlyph } from '@/components/VehicleGlyph'
import { CapacityBadge } from '@/components/CapacityBadge'
import { EmptyState } from '@/components/EmptyState'
import { fetchVehicle } from '@/services/api'
import { useStore } from '@/services/store'
import { distanceM } from '@/services/geo'
import { elevation, VEHICLE_LABELS, PING_INTERVAL_MS } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'
import { useCopy } from '@/constants/copy'

const DetailRow = ({ tint, children, title, subtitle }) => (
	<View className="flex-row items-center gap-[14px] pb-4 pt-1">
		<View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: tint }}>
			{children}
		</View>
		<View className="min-w-0 flex-1 gap-[2px]">
			<Txt variant="headingS">{title}</Txt>
			<Txt variant="caption" className="text-fg-secondary">{subtitle}</Txt>
		</View>
	</View>
)

/**
 * 08 · Vehicle Detail, and 09 · Weak Signal when the ping has gone stale.
 *
 * No ETA by design — a minutes figure would be invented. Distance-to-you shows
 * only when the commuter has opted into the map crosshair, computed on-device.
 *
 * This is also the one screen that can send a commuter position anywhere: the
 * "Nakatutok sa iyo" switch, off until tapped, scoped to this driver and this
 * trip alone. It stays on after this screen closes — WatchingBanner on the map
 * home is where it can be seen, and switched off, from then on.
 */
export default function VehicleDetail() {
	const copy = useCopy()
	const { theme, statusBar } = useTheme()
	const { id } = useLocalSearchParams()
	const router = useRouter()
	const insets = useSafeAreaInsets()

	const myLocation = useStore(s => s.myLocation)
	const checkProximity = useStore(s => s.checkProximity)
	const watchingTripId = useStore(s => s.watchingTripId)
	const toggleWatchingTrip = useStore(s => s.toggleWatchingTrip)
	const stopWatchingTrip = useStore(s => s.stopWatchingTrip)
	// The card Map Home already holds for this vehicle — same normaliser, same
	// shape, everything but the route line. Opening from it means the screen
	// is on the commuter's eyes before the network is asked for anything, and
	// a first request that fails cannot present as "no connection" for a
	// vehicle they were looking at a second ago.
	const seed = useStore(s => s.vehicles.find(v => String(v.id) === String(id)))
	const [vehicle, setVehicle] = useState(seed ?? null)
	// The trip this screen actually saw, kept so a 404 can only ever withdraw
	// the consent it belongs to.
	const seenTripId = useRef(null)
	const [loading, setLoading] = useState(!seed)
	const [missing, setMissing] = useState(false)
	const [following, setFollowing] = useState(false)

	// Mirrors the Figma frame: a 410 sheet on an 844 canvas, so the map keeps
	// slightly over half the screen. The follow control rides 16dp above it.
	const PEEK = 500
	const [driverOpen, setDriverOpen] = useState(false)

	useEffect(() => {
		let cancelled = false

		// Which route we already hold the polyline for. The line is the bulk of
		// this payload — 741 points, ~26 KB, on the longest demo route — and it
		// cannot change inside a trip. Pulling it on every 8 s poll handed the map
		// a new array each time, which re-ran orientRoute over every waypoint and
		// made react-native-maps tear down and rebuild the whole Polyline four
		// times a minute. That is what made long routes lag on open. Fetch it once,
		// then carry the SAME array forward so the memo downstream stays valid.
		let drawnRoute = null

		const apply = data => {
			seenTripId.current = data.tripId
			setVehicle(prev =>
				prev?.route?.id === data.route?.id && prev.route.waypoints.length
					? { ...data, route: { ...data.route, waypoints: prev.route.waypoints } }
					: data
			)
			setMissing(false)
			// Map Home's poll is stopped while this screen has focus, so the
			// proximity buzz runs off this screen's own refresh instead.
			checkProximity([data])
		}

		const load = () =>
			fetchVehicle(id, { geometry: drawnRoute === null })
				.then(data => {
					if (cancelled) return
					if (drawnRoute === null) drawnRoute = data.route?.id ?? null
					// The driver rerouted mid-screen, so the line being held is the
					// wrong road. Pull the new one before drawing anything.
					else if (data.route?.id !== drawnRoute) {
						drawnRoute = null
						return load()
					}
					apply(data)
				})
				// A 404 means the driver ended the trip. Anything else is a network
				// problem, and reporting that as "the ride is gone" would be a lie.
				.catch(e => {
					if (cancelled) return
					if (e?.response?.status === 404) return setMissing(true)

					// The first load never landed and the screen has nothing to
					// show: ask again in two seconds, not eight. Eight is the poll
					// cadence for a screen that is already drawn; a blank one with
					// "no connection" on it should not have to wait a full cycle
					// for a blip to pass.
					if (drawnRoute === null) retry = setTimeout(load, 2000)
				})
				.finally(() => !cancelled && setLoading(false))

		let retry = null
		load()
		const timer = setInterval(load, PING_INTERVAL_MS)

		return () => {
			cancelled = true
			clearInterval(timer)
			if (retry) clearTimeout(retry)
		}
	}, [id])

	// A 404 means the driver already tapped Tapusin, so there is nobody left to
	// be seen by — but only for THIS trip. Browsing some other jeepney that has
	// just ended must not revoke the consent given to the one being waited for.
	//
	// Leaving the screen does NOT withdraw at all: a commuter waiting at a
	// corner checks the map and looks at other vehicles, and switching off on
	// every one of those would kill the feature exactly when they need it.
	// WatchingBanner at the root is what keeps that honest.
	useEffect(() => {
		if (missing && seenTripId.current) stopWatchingTrip(seenTripId.current)
	}, [missing])

	// Keyed on the URL string, not rebuilt per render. An object literal in
	// source={{ uri }} is a new identity every time, and this screen re-polls
	// every 8 s — so the Image was being handed a "new" source four times a
	// minute and reloaded the same picture each time. That was the blink.
	const photoSource = useMemo(
		() => (vehicle?.photoUrl ? { uri: vehicle.photoUrl } : null),
		[vehicle?.photoUrl]
	)

	const destinationPin = useMemo(() => {
		if (!vehicle) return null
		const at = vehicle.destinationPosition ?? vehicle.route?.waypoints?.[vehicle.route.waypoints.length - 1]
		return at ? { ...at, label: vehicle.destination } : null
		// Keyed on the trip, not the vehicle object — a poll rebuilds the object
		// every 8 s but the destination only changes with the trip.
	}, [vehicle?.tripId, vehicle?.destination])

	// Frame route + destination ONCE per trip. Recomputing per poll would yank
	// the camera back every 8 s and fight anyone panning around the route.
	const fitTo = useMemo(
		() => [...(vehicle?.route?.waypoints ?? []), destinationPin].filter(Boolean),
		[vehicle?.route?.id, destinationPin]
	)

	if (loading) {
		return (
			<View className="flex-1 items-center justify-center bg-surface-canvas">
				<ActivityIndicator color={theme.brand.hover} />
			</View>
		)
	}

	// The load failed without a 404, so the trip may be running perfectly well
	// and simply out of reach. Saying "tapos na ang biyahe" here would send a
	// commuter away from a jeepney that is still coming.
	if (missing || !vehicle) {
		return (
			<View className="flex-1 justify-center bg-surface-canvas px-6">
				<EmptyState
					icon={missing ? 'directions-off' : 'cloud-off'}
					title={missing ? copy.vehicle.tripEndedTitle : copy.search.offlineTitle}
					body={missing ? copy.vehicle.tripEndedBody : copy.search.offlineBody}
					action={
						<Pressable onPress={() => router.back()} className="mt-2 rounded-lg bg-brand px-6 py-3 active:opacity-80">
							<Txt variant="bodyMStrong" className="text-fg-on-brand">{copy.common.back}</Txt>
						</Pressable>
					}
				/>
			</View>
		)
	}

	return (
		<View className="flex-1 bg-surface-canvas">
			<StatusBar style={statusBar} />
			<Map
				vehicles={[vehicle]}
				selectedId={vehicle.id}
				route={vehicle.route?.waypoints}
				routeTarget={vehicle.destinationPosition ?? null}
				routeAnchor={vehicle.id}
				destinationPin={destinationPin}
				fitTo={fitTo}
				fitKey={vehicle.route?.id ?? vehicle.tripId}
				myLocation={myLocation}
				// Follow tracks the glide, so the camera reads as committed to a
				// moving vehicle rather than jumping once per ping.
				follow={following}
				followKey={`v:${vehicle.id}`}
				centerOn={vehicle.position}
				// Clear of the sheet's resting height, so the control is never
				// hidden behind it.
				controlsBottom={PEEK + 16}
				controls={
					<Pressable
						onPress={() => setFollowing(f => !f)}
						accessibilityRole="switch"
						accessibilityState={{ checked: following }}
						accessibilityLabel={copy.vehicle.centerOnVehicle}
						// Colours inline rather than through a conditional className: a
						// template literal is resolved at runtime and the two branches did
						// not switch reliably, leaving the control reading ON from a cold
						// start. Dynamic colour goes through style everywhere else here.
						style={[
							elevation.float,
							{
								backgroundColor: following ? theme.brand.default : theme.surface.default,
								borderColor: following ? theme.brand.default : theme.border.subtle
							}
						]}
						className="h-14 w-14 items-center justify-center rounded-full border-[1.5px] active:opacity-80"
					>
						{/* Filled AND a different glyph: the design system says a state
						    must never be carried by colour alone. */}
						<MaterialIcons
							name={following ? 'gps-fixed' : 'gps-not-fixed'}
							size={24}
							color={following ? theme.text.onBrand : theme.icon.secondary}
						/>
					</Pressable>
				}
			/>

			<Pressable
				// Arriving by deep link leaves no history, and back then dispatches a
				// GO_BACK no navigator handles. Fall through to the map instead.
				onPress={() => (router.canGoBack() ? router.back() : router.replace('/commuter'))}
				accessibilityRole="button"
				accessibilityLabel={copy.common.back}
				style={{ top: insets.top + 6, ...elevation.float }}
				className="absolute left-6 h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-line-subtle bg-surface active:opacity-80"
			>
				<MaterialIcons name="arrow-back" size={22} color={theme.icon.primary} />
			</Pressable>

			{/* The identity block is the sheet's HEAD, not the first thing in the
			    scroll view. Only the head drags the sheet open, and with the
			    grabber alone as the target the rest of this sheet — the opt-in
			    switch at the bottom included — could not be reached at all. */}
			<Sheet
				// Tall enough that the opt-in switch is on screen at rest. It is
				// the only thing on this sheet a commuter can act on, and behind
				// a drag it may as well not exist. Raised from 470 when the
				// vehicle photo was added: the photo pushed the switch off the
				// peek, which is exactly the failure this number exists to stop.
				peekHeight={PEEK}
				head={
					/* The whole row opens the driver sheet. The 40-tall pill it replaces sat
					   under the 48 touch floor and shared the destination's row, squeezing
					   it; as a TRAILING disclosure the chevron centres against the block,
					   which is the idiom for "this row opens something". */
					<Pressable
						onPress={() => vehicle.driver_name && setDriverOpen(true)}
						accessibilityRole={vehicle.driver_name ? 'button' : undefined}
						accessibilityLabel={vehicle.driver_name ? copy.vehicle.viewDriver : undefined}
						className="flex-row items-center gap-3 pb-3 pt-1 active:opacity-70"
					>
						<View
							className="h-12 w-12 items-center justify-center rounded-md border-2 bg-surface-sunken"
							style={{ borderColor: vehicle.stale ? theme.border.strong : theme.route[1] }}
						>
							<VehicleGlyph
								type={vehicle.vehicle_type}
								color={vehicle.stale ? theme.icon.muted : theme.icon.primary}
							/>
						</View>
						<View className="min-w-0 flex-1 gap-[2px]">
							<Txt variant="headingL" numberOfLines={1}>{vehicle.destination}</Txt>
							<View className="flex-row items-center gap-2">
								{/* The plate gives way, never the badge: on a narrow phone a
								    long plate would otherwise push the capacity off the row.
								    The vehicle TYPE is the glyph on the left — the word cost 69dp
								    and was rendering against a ramp step named bodyS, which is not on the
								    type ramp, so it fell back to the platform font. */}
								{/* A bus is known by the name painted along its side — nobody
								    reads a plate on a moving Victory Liner, and "Hino RK1J
								    2017" means nothing to a passenger. Jeepneys are
								    owner-operated and carry no company, so they keep the
								    plate. Whichever is NOT shown is in the driver sheet. */}
								{vehicle.operator ? (
									<Txt variant="bodyMStrong" numberOfLines={1} className="shrink text-fg">
										{vehicle.operator}
									</Txt>
								) : (
									<Txt variant="monoData" numberOfLines={1} className="shrink text-fg-secondary">
										{vehicle.plate_number}
									</Txt>
								)}
								{/* Capacity, not a VERIFIED badge. Every driver on the platform is
								    verified — it is the login itself — so the badge said nothing
								    while occupying the one spot a commuter reads before deciding
								    whether to run for this jeepney. */}
								<CapacityBadge state={vehicle.capacity} />
							</View>
						</View>
						{!!vehicle.driver_name && (
							<View className="flex-row items-center gap-[6px]">
								<View className="h-8 w-8 items-center justify-center rounded-full bg-surface-sunken">
									<Txt variant="labelS" className="text-fg-secondary">{vehicle.driver_name.charAt(0)}</Txt>
								</View>
								<MaterialIcons name="chevron-right" size={20} color={theme.icon.muted} />
							</View>
						)}
					</Pressable>
				}
			>
				<ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
					{/* What is actually coming down the road. A plate identifies a
					    jeepney only once it is close enough to read; paint and
					    shape are what a commuter matches from a corner.

					    A fixed 16:9 box, not a fixed height: h-40 was a 2.16:1
					    letterbox on this phone and nearly square on a narrow one, so
					    one photo cropped differently per device. Ratio first, cover
					    crop second, means a driver's upload of any shape lands as the
					    same frame everywhere. 2:1 rather than 16:9 because the sheet
					    cannot afford the extra 22dp — the opt-in switch below is the
					    only control on this screen and has to stay above the fold. */}
					{!!photoSource && (
						<Image
							source={photoSource}
							style={{ aspectRatio: 16 / 9 }}
							className="mb-4 w-full rounded-lg bg-surface-sunken"
							resizeMode="cover"
							accessibilityLabel={copy.vehicle.photoAlt(vehicle.destination)}
						/>
					)}

					{vehicle.stale && (
						<View className="mt-4 flex-row items-start gap-3 rounded-lg bg-capacity-stale-bg p-4">
							<MaterialIcons name="signal-wifi-statusbar-null" size={18} color={theme.capacity.stale.fg} />
							<View className="min-w-0 flex-1">
								<Txt variant="bodyMStrong" className="text-capacity-stale-fg">{copy.vehicle.staleTitle}</Txt>
								<Txt variant="caption" className="text-fg-secondary">{copy.vehicle.staleBody}</Txt>
							</View>
						</View>
					)}

					<View>
						{/* The LIVE fact leads. "Buendia -> Baclaran" reads the same on
						    every poll; where the jeepney is right now is what a commuter
						    at a corner is actually reading for, and it was sitting in
						    12px caption on the second line under a static route name. */}
						<DetailRow
							tint={theme.brand.subtle}
							title={
								vehicle.current_street
									? (vehicle.stale
										? copy.vehicle.lastOnStreet(vehicle.current_street)
										: copy.vehicle.onStreet(vehicle.current_street))
									: (vehicle.route?.label ?? vehicle.destination)
							}
							subtitle={[
								vehicle.current_street ? (vehicle.route?.label ?? vehicle.destination) : null,
								vehicle.route?.length_km ? copy.vehicle.routeLength(vehicle.route.length_km) : null,
								myLocation && vehicle.position ? copy.vehicle.away(distanceM(myLocation, vehicle.position)) : null
							].filter(Boolean).join(' · ')}
						>
							<MaterialIcons name="place" size={20} color={theme.brand.hover} />
						</DetailRow>

					</View>

					<View className="mt-4 flex-row items-center gap-[14px] rounded-lg bg-surface-sunken p-[14px]">
						<View className="h-11 w-11 items-center justify-center rounded-full bg-brand-subtle">
							<MaterialIcons name="person-pin-circle" size={22} color={theme.brand.hover} />
						</View>
						<View className="min-w-0 flex-1 gap-[2px]">
							<Txt variant="bodyMStrong">{copy.vehicle.watchTitle}</Txt>
							<Txt variant="caption" className="text-fg-secondary">{copy.vehicle.watchBody}</Txt>
						</View>
						<Toggle
							value={watchingTripId === vehicle.tripId}
							onValueChange={() => toggleWatchingTrip(vehicle.tripId, { destination: vehicle.destination, plate: vehicle.plate_number })}
							accessibilityLabel={copy.vehicle.watchTitle}
						/>
					</View>
				</ScrollView>
			</Sheet>

			{/* Everything a commuter checks once rather than watches: who is
			    driving, how long they have run this route, and what the vehicle
			    actually is. Kept off the main sheet so the opt-in switch stays
			    reachable without a drag. */}
			<Modal
				visible={driverOpen}
				transparent
				animationType="slide"
				onRequestClose={() => setDriverOpen(false)}
			>
				<Pressable className="flex-1 justify-end bg-black/40" onPress={() => setDriverOpen(false)}>
					{/* Swallows taps so pressing the card itself does not dismiss. */}
					<Pressable
						onPress={() => {}}
						style={{ paddingBottom: insets.bottom + 24 }}
						className="gap-5 rounded-t-2xl bg-surface px-6 pt-5"
					>
						<View className="flex-row items-center justify-between">
							<Txt variant="headingS">{copy.vehicle.driverSheetTitle}</Txt>
							<Pressable
								onPress={() => setDriverOpen(false)}
								accessibilityRole="button"
								accessibilityLabel={copy.common.close}
								className="h-10 w-10 items-center justify-center rounded-full bg-surface-sunken active:opacity-70"
							>
								<MaterialIcons name="close" size={20} color={theme.icon.secondary} />
							</Pressable>
						</View>

						<View className="flex-row items-center gap-[14px]">
							<View className="h-14 w-14 items-center justify-center rounded-full bg-surface-sunken">
								<Txt variant="headingS" className="text-fg-secondary">
									{vehicle.driver_name?.charAt(0)}
								</Txt>
							</View>
							<View className="min-w-0 flex-1 gap-[2px]">
								<Txt variant="headingS" numberOfLines={1}>{vehicle.driver_name}</Txt>
								<Txt variant="caption" className="text-fg-secondary">
									{vehicle.is_verified
										? copy.vehicle.verifiedDriver(vehicle.driver_years)
										: copy.vehicle.unverifiedDriver(vehicle.driver_years)}
								</Txt>
							</View>
						</View>

						<View className="gap-3 rounded-lg bg-surface-sunken p-4">
							{[
								[copy.vehicle.typeLabel, VEHICLE_LABELS[vehicle.vehicle_type] ?? vehicle.vehicle_type],
								...(vehicle.operator ? [[copy.vehicle.operatorLabel, vehicle.operator]] : []),
								[copy.vehicle.plateLabel, vehicle.plate_number],
								// The model is the other half of "what am I looking for":
								// paint and shape from the photo, make and year from here.
								[copy.vehicle.modelLabel, vehicle.model || copy.vehicle.unknownModel],
								// Painted far larger than the plate, and what terminals and
								// dispatchers actually call a unit by.
								...(vehicle.body_number ? [[copy.vehicle.bodyLabel, vehicle.body_number]] : [])
							].map(([label, value]) => (
								<View key={label} className="flex-row items-center justify-between gap-4">
									<Txt variant="caption" className="text-fg-secondary">{label}</Txt>
									<Txt variant="bodyMStrong" numberOfLines={1} className="shrink text-right">{value}</Txt>
								</View>
							))}
						</View>
					</Pressable>
				</Pressable>
			</Modal>
		</View>
	)
}
