import { useEffect, useMemo, useRef, useState } from 'react'
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { MaterialIcons } from '@expo/vector-icons'
import { Map } from '@/components/Map'
import { Sheet } from '@/components/ui/Sheet'
import { Txt } from '@/components/ui/Txt'
import { EmptyState } from '@/components/EmptyState'
import { VehicleSheetHead, VehicleSheetBody, DriverSheet } from '@/components/VehicleSheet'
import { fetchVehicle } from '@/services/api'
import { useStore } from '@/services/store'
import { elevation, PING_INTERVAL_MS, STALE_AFTER_MS } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'
import { useCopy } from '@/constants/copy'


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

	/**
	 * How much of the screen the sheet keeps at rest, in dp.
	 *
	 * 500 came from a 410-on-844 Figma frame, but on this phone it left the map
	 * 304dp — and the camera frames the route into the WHOLE map, so the jeepney
	 * and the destination pin were routinely drawn in the part the sheet covers.
	 * The screen opened on an empty-looking strip of road. Shorter, plus the
	 * sheet handed to the map as padding below, is the pair that fixes it: the
	 * same pair the driver's trip screen took.
	 *
	 * What has to survive at rest is the identity, where the jeepney is now, and
	 * the one switch on the screen. The photo and the driver row are reference
	 * material and are allowed to sit under the fold.
	 */
	const PEEK = 340
	/** Collapsed: a grabber and a chevron, so the map can have the screen. */
	const MINI = 92
	const [driverOpen, setDriverOpen] = useState(false)
	const [sheetPos, setSheetPos] = useState('peek')
	/**
	 * The last poll landed too long ago to keep calling this live.
	 *
	 * `stale` is computed when a payload is PARSED, so it only ever refreshes
	 * while polls succeed. Walk into a dead spot and every poll from then on
	 * rejects silently: the pin stops, and the screen goes on presenting a
	 * frozen position as current — indefinitely, with a LIVE-looking card and a
	 * street name that has not been true for ten minutes.
	 */
	const [offline, setOffline] = useState(false)
	const lastOkRef = useRef(0)

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
			lastOkRef.current = Date.now()
			setOffline(false)
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
					// for a blip to pass. ONE pending retry at a time: the 8 s poll
					// also calls load(), and every failing tick would otherwise
					// start another 2 s chain alongside the ones already running.
					if (drawnRoute === null && !retry) {
						retry = setTimeout(() => {
							retry = null
							load()
						}, 2000)
					}

					// A screen that IS drawn has the opposite problem: nothing on it
					// changes when the polls stop, so say so once the last good
					// answer is as old as a stale ping. Same threshold the cards use,
					// so "live" means the same thing on both screens.
					if (lastOkRef.current && Date.now() - lastOkRef.current > STALE_AFTER_MS) setOffline(true)
				})
				.finally(() => !cancelled && setLoading(false))

		let retry = null
		// Opened from a card the store already holds, that card IS a good answer;
		// without this the age is measured from zero and the banner shows at once.
		if (seed && !lastOkRef.current) lastOkRef.current = Date.now()
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


	/**
	 * Live, or only claiming to be. Either the last ping the SERVER knows about
	 * is old, or our own last successful poll is — a commuter cannot tell those
	 * apart and neither matters to them: what is on screen is no longer current.
	 */
	const degraded = !!vehicle?.stale || offline

	const destinationPin = useMemo(() => {
		if (!vehicle) return null
		const at = vehicle.destinationPosition ?? vehicle.route?.waypoints?.[vehicle.route.waypoints.length - 1]
		return at ? { ...at, label: vehicle.destination } : null
		// Keyed on the trip, not the vehicle object — a poll rebuilds the object
		// every 8 s but the destination only changes with the trip.
	}, [vehicle?.tripId, vehicle?.destination])

	// Frame route + destination ONCE per trip. Recomputing per poll would yank
	// the camera back every 8 s and fight anyone panning around the route.
	// Keyed on the waypoints ARRAY, not the route id. Opened from the card Map
	// Home already holds, the vehicle arrives knowing its route's id but not its
	// line; keyed on the id, this memo settled on [destination] before the
	// geometry landed and never looked again, so the route drew under a camera
	// that had never framed it. The load effect carries the same array forward
	// once fetched, so this does not churn on every poll either.
	// Before the polyline lands there is exactly one point here — the
	// destination — and Map treats a lone point as a place to zoom to. So
	// opening any vehicle flew the camera to the far end of the corridor at
	// street zoom, with the jeepney itself kilometres off screen, and only
	// pulled back once the geometry arrived. The jeepney and where it is going
	// are the two points worth framing until the road itself is known.
	const fitTo = useMemo(
		() =>
			(vehicle?.route?.waypoints?.length
				? [...vehicle.route.waypoints, destinationPin]
				: [vehicle?.position, destinationPin]
			).filter(Boolean),
		[vehicle?.route?.waypoints, vehicle?.position, destinationPin]
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
					// Guarded like the map's own back button below: by deep link, or
					// after a stack reset, there is nothing to pop, and this was the
					// only control on the screen.
					action={
						<Pressable
							onPress={() => (router.canGoBack() ? router.back() : router.replace('/commuter'))}
							className="mt-2 rounded-lg bg-brand px-6 py-3 active:opacity-80"
						>
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
				// The waypoint count is part of the key: the card the screen opens
				// from knows the route's id but not its line, and the one frame that
				// matters is the one after the line arrives.
				fitKey={`${vehicle.route?.id ?? vehicle.tripId}|${vehicle.route?.waypoints?.length ?? 0}`}
				myLocation={myLocation}
				// Follow tracks the glide, so the camera reads as committed to a
				// moving vehicle rather than jumping once per ping.
				follow={following}
				followKey={`v:${vehicle.id}`}
				centerOn={vehicle.position}
				// A finger beats the camera. Following re-aimed the map every 400ms,
				// so a commuter who dragged up the road to see whether the jeepney
				// had passed their street had the drag undone before they let go,
				// and there was no way to look around without first finding the
				// control. Map only reports real gestures, so the follow's own
				// camera moves cannot switch it off.
				onUserPan={() => setFollowing(false)}
				// Clear of the sheet's resting height, so the control is never
				// hidden behind it.
				controlsBottom={PEEK + 16}
				// The sheet, as map padding: the camera's idea of centre becomes the
				// centre of what can actually be seen, and the route is framed into
				// the visible strip instead of behind the sheet. It also lifts the
				// Google attribution clear, which a sheet this deep was covering.
				// Only the collapsed height, so the Google logo sits at the bottom
				// left of the map rather than halfway up it; the fit is told about
				// the rest of the sheet separately.
				bottomInset={MINI}
				fitBottomExtra={PEEK - MINI}
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
						{/* A jeepney, not a second crosshair: beside the my-location
						    control the two gps glyphs were the same ring and dot, so
						    nothing said which button aimed at the vehicle and which
						    aimed at you. State stays in the fill, never in colour alone
						    — the glyph itself names the target. */}
						<MaterialIcons
							name="directions-bus"
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
			{/* The identity block is the sheet's HEAD, not the first thing in the
			    scroll view — only the head drags the sheet open. Head and body are
			    the same components the map home raises in place, so the deep link
			    and the tap show one jeepney one way. */}
			<Sheet
				peekHeight={PEEK}
				miniHeight={MINI}
				position={sheetPos}
				onPositionChange={setSheetPos}
				head={
					<VehicleSheetHead
						vehicle={vehicle}
						degraded={degraded}
						onOpenDriver={() => setDriverOpen(true)}
					/>
				}
			>
				<ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-10">
					<VehicleSheetBody vehicle={vehicle} degraded={degraded} />
				</ScrollView>
			</Sheet>

			{/* Everything a commuter checks once rather than watches: who is
			    driving, how long they have run this route, and what the vehicle
			    actually is. Kept off the main sheet so the opt-in switch stays
			    reachable without a drag. */}
			<DriverSheet vehicle={vehicle} visible={driverOpen} onClose={() => setDriverOpen(false)} />
		</View>
	)
}
