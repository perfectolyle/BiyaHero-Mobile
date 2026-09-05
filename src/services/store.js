import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import * as api from './api'
import { subscribe, disconnectRealtime, onRealtimeState } from './realtime'
import { PING_INTERVAL_MS, STALE_AFTER_MS } from '@/theme/tokens'
import { Vibration } from 'react-native'
import { distanceM, placeLabel, NEAR_M, NEAR_RESET_M } from './geo'
import { watcherId } from './watchers'
import { getCopy } from '@/constants/copy'

const KEYS = { role: 'biyahero.role', token: 'biyahero.token', driver: 'biyahero.driver', searches: 'biyahero.searches' }
const MAX_RECENT = 3

let pollTimer = null
/** The simulator's one-frame-per-tick channel; real drivers still send vehicle.moved. */
let fleetBatchSocket = null
/** Unsubscribe for the socket up/down listener that sets the poll cadence. */
let socketState = null

/**
 * How often to re-read the listing while the socket is UP.
 *
 * Positions arrive on the socket; the poll then only carries MEMBERSHIP — a
 * jeepney that started or ended a trip is not a move, so it arrives on no
 * channel. That changes every few minutes, not every eight seconds, and each
 * poll was 22 KB and a fresh array identity for every pin on the map.
 */
const RECONCILE_INTERVAL_MS = 60_000
let broadcastWatcher = null
let broadcastGuard = null
let myLocationWatcher = null
let watchPingTimer = null
let fleetSocket = null
let movedBuffer = new Map()
let movedFlush = null
// Bumped by every start and every stop, so an opt-in still travelling when the
// commuter backs out can tell that it has been overtaken.
let watchGeneration = 0
// When the server last confirmed the commuter is visible, and for how long that
// confirmation is good for. The banner is a claim about the SERVER's state, so
// it has to expire when that state does rather than when a request happens to
// fail — a phone that lost signal is exactly when it would otherwise keep
// insisting a driver can see them.
let watchAckAt = 0
let watchExpiresMs = 0
let watchGpsGuard = null
// Vehicles already announced, so two jeepneys in range do not buzz forever.
let alertedIds = new Set()
let toastTimer = null
let lastStreetLookup = 0
// Only the newest /active-vehicles reply may write to the store.
let refreshSeq = 0

/**
 * The broadcast watcher itself: streams the driver's fix to the server every
 * ping interval and mirrors it into the store for the driver's own map.
 */
const startBroadcastWatcher = (tripId, get, set) => {
	// Distance is accumulated here because only this watcher sees every fix.
	// It was never sent at all, so every kilometre figure a real driver saw —
	// this trip, today's total, their history, their profile — was 0.
	let travelledKm = get().trip?.distance_km ?? 0
	let lastFix = null
	let lastPingAt = 0

	return Location.watchPositionAsync(
		{ accuracy: Location.Accuracy.High, timeInterval: FIX_INTERVAL_MS, distanceInterval: 5 },
		async loc => {
			if (!loc?.coords) return
			const { latitude, longitude } = loc.coords
			const here = { latitude, longitude }

			// Every fix moves the driver's own pin, so their map is smooth.
			set({ broadcastPosition: here })

			// Everything below still runs on the ping cadence. Distance is the
			// reason: the 15 m jitter floor assumes eight seconds of travel
			// between samples, and comparing 1 Hz fixes against it would reject
			// every real hop at city speeds and count the trip as zero km.
			if (Date.now() - lastPingAt < PING_INTERVAL_MS) return
			lastPingAt = Date.now()

			// GPS jitter while parked would otherwise inflate the total, so a
			// hop under 15 m does not count as distance travelled.
			const hop = distanceM(lastFix, here)
			if (hop !== null && hop >= 15) travelledKm += hop / 1000
			lastFix = here

			set({ trip: { ...get().trip, distance_km: Number(travelledKm.toFixed(2)) } })

			let street
			if (Date.now() - lastStreetLookup > STREET_LOOKUP_INTERVAL_MS) {
				lastStreetLookup = Date.now()
				try {
					const [place] = await Location.reverseGeocodeAsync({ latitude, longitude })
					street = placeLabel(place) ?? undefined
				} catch {
					// A failed lookup just means the card keeps the previous street.
				}
			}

			api.pingTrip(tripId, { latitude, longitude, street, distanceKm: Number(travelledKm.toFixed(2)) }).catch(() => {})
		}
	)
}

/**
 * One GPS fix, cached-first. High accuracy, never Balanced — the network
 * provider hangs forever on some devices (this MediaTek included).
 */
const currentFix = async () => {
	try {
		// maxAge matters: an unbounded cached fix from another city hours ago is
		// exactly the wrong-corridor bug this position exists to prevent.
		const seed = await Location.getLastKnownPositionAsync({ maxAge: 60_000 })
		if (seed?.coords) return { latitude: seed.coords.latitude, longitude: seed.coords.longitude }
		// Race a timeout: getCurrentPositionAsync can hang on a cold GPS, and a
		// spinner that never resolves is worse than the server's clear refusal.
		const fix = await Promise.race([
			Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
			new Promise(resolve => setTimeout(() => resolve(null), 12_000))
		])
		return fix?.coords ? { latitude: fix.coords.latitude, longitude: fix.coords.longitude } : null
	} catch {
		return null
	}
}

/** Reverse-geocode sparingly — it is rate-limited and the street rarely changes. */
const STREET_LOOKUP_INTERVAL_MS = 30_000

/**
 * How often a position is READ, as opposed to how often it is sent.
 *
 * The map interpolates between fixes, and interpolation is only as smooth as
 * the fixes feeding it: one every eight seconds leaves the marker hopping and
 * then sitting still, which is the blinking it was supposed to cure. Reading at
 * roughly 1 Hz gives the glide something continuous to follow. Nothing extra
 * goes over the network — the ping and the opt-in refresh keep their own
 * cadence and just read whatever the latest fix is.
 */
const FIX_INTERVAL_MS = 1000
// Long enough to swallow a whole fleet's burst into one render, short enough
// that the glide still gets a fresh target well within its own 30 Hz frame.
const MOVE_FLUSH_MS = 100

export const useStore = create((set, get) => ({
	/* ---------------------------------------------------------------- shared */
	role: null,
	hydrated: false,
	toast: null,

	showToast: message => {
		if (toastTimer) clearTimeout(toastTimer)
		set({ toast: message })
		toastTimer = setTimeout(() => set({ toast: null }), 2200)
	},

	setRole: async role => {
		// The banner lives on the commuter map. Switching away would hide the
		// only control that says somebody can see you, so the consent goes too.
		if (role !== 'commuter') get().stopWatchingTrip()

		set({ role })
		await AsyncStorage.setItem(KEYS.role, role)
	},

	/** Restore role, driver session and recent searches before the first render. */
	hydrate: async () => {
		try {
			const [role, token, searches] = await Promise.all([
				AsyncStorage.getItem(KEYS.role),
				AsyncStorage.getItem(KEYS.token),
				AsyncStorage.getItem(KEYS.searches)
			])

			if (token) {
				api.setAuthToken(token)

				// Show the cached profile immediately; the network refresh follows.
				const cached = await AsyncStorage.getItem(KEYS.driver).catch(() => null)
				if (cached) set({ driver: JSON.parse(cached) })

				// NOT awaited: the splash used to sit through two round-trips, which
				// on a weak signal meant twenty seconds staring at nothing.
				get().resumeSession()
			}

			set({
				role: role ?? null,
				recentSearches: searches ? JSON.parse(searches) : [],
				hydrated: true
			})
		} catch {
			set({ hydrated: true })
		}
	},

	/**
	 * Refresh the driver session in the background, and pick a run back up
	 * if the process died mid-trip.
	 */
	resumeSession: async () => {
		try {
			const driver = await api.fetchMe()
			set({ driver })
			await AsyncStorage.setItem(KEYS.driver, JSON.stringify(driver))

			const trip = await api.fetchCurrentTrip().catch(() => null)
			if (trip) {
				set({ trip, isBroadcasting: true })
				// Without restarting the watcher the LIVE banner would lie:
				// no pings, no dot, no watchdog.
				get()
					.beginBroadcast(trip.id)
					.catch(() => set({ isBroadcasting: false }))
			}
		} catch (e) {
			// Only a REJECTED token ends the session. A network failure must not
			// log the driver out, or every dead spot forces a re-registration.
			if (e?.response?.status === 401) {
				await AsyncStorage.multiRemove([KEYS.token, KEYS.driver])
				api.setAuthToken(null)
				set({ driver: null, trip: null })
			}
		}
	},

	/* ------------------------------------------------------------- commuter */
	// Filtering never uses a commuter position. `myLocation` exists only when
	// the commuter taps the crosshair and grants permission — strictly opt-in,
	// display-and-alert only. It reaches the server in exactly one case, below.
	myLocation: null,
	myLocationOn: false,
	/**
	 * The single trip this commuter agreed to be visible on. A second, separate
	 * consent on top of the blue dot, scoped to one driver and one run, taken
	 * back the moment it is switched off, the dot goes dark, or the trip ends.
	 */
	watchingTripId: null,
	/**
	 * Which vehicle the commuter is currently visible to, as { destination,
	 * plate }. Not the driver's name: nobody picks a jeepney out of traffic by
	 * who is driving it — they read the signboard and the plate.
	 */
	watchingVehicle: null,
	vehicles: [],
	activeCount: 0,
	loading: false,
	error: null,
	destination: null,
	/** How wide the "passes near here" corridor is, straight from the server. */
	corridorRadiusM: null,
	destinationPosition: null,
	vehiclesFor: null,
	destinationResolved: true,
	vehicleFilter: 'all',
	selectedVehicleId: null,
	recentSearches: [],

	setVehicleFilter: filter => {
		set({ vehicleFilter: filter })
		get().refresh()
	},

	setDestination: async destination => {
		set({ destination, selectedVehicleId: null })
		if (destination) await get().rememberSearch(destination)
		get().refresh()
	},

	clearDestination: () => {
		set({ destination: null, selectedVehicleId: null })
		get().refresh()
	},

	selectVehicle: selectedVehicleId => set({ selectedVehicleId }),

	/** Recent searches live on the device only — never sent to the server. */
	rememberSearch: async destination => {
		const next = [destination, ...get().recentSearches.filter(d => d.name !== destination.name)].slice(0, MAX_RECENT)
		set({ recentSearches: next })
		await AsyncStorage.setItem(KEYS.searches, JSON.stringify(next))
	},

	clearSearches: async () => {
		set({ recentSearches: [] })
		await AsyncStorage.removeItem(KEYS.searches)
		get().showToast(getCopy().settings.searchesCleared)
	},

	refresh: async () => {
		const { destination, vehicleFilter } = get()
		const seq = ++refreshSeq
		set({ loading: true })

		try {
			const { vehicles, meta } = await api.fetchActiveVehicles({
				destination: destination?.name,
				destCoords: destination?.lat != null ? { lat: destination.lat, lng: destination.lng } : undefined,
				vehicleType: vehicleFilter
			})
			// A slower earlier request must not overwrite a newer answer, or the
			// header ends up describing a list it did not produce.
			if (seq !== refreshSeq) return

			set({
				vehicles,
				activeCount: meta.count ?? vehicles.length,
				corridorRadiusM: meta.corridor_radius_m ?? null,
				// Where the server actually located the search, so a typed place
				// no destination row knows can still be pinned on the map.
				destinationPosition: meta.destination_position
					? {
							latitude: Number(meta.destination_position.lat),
							longitude: Number(meta.destination_position.lng)
						}
					: null,
				// The place this list was measured against. Naming a distance
				// after a destination it was not computed for invents a figure.
				vehiclesFor: destination?.name ?? null,
				// The server says outright when it could not locate the place; saying
				// "no rides pass there" instead would blame the fleet for a typo.
				destinationResolved: meta.resolved !== false,
				error: null
			})
			get().checkProximity()
		} catch {
			set({ error: getCopy().common.offline })
		} finally {
			set({ loading: false })
		}
	},

	/**
	 * Opt-in blue dot. The position feeds the map marker, the distance lines and
	 * the nearby vibration; nothing here talks to the server. The one thing that
	 * ever sends it anywhere is startWatchingTrip below, for the single trip the
	 * commuter switched it on for.
	 */
	enableMyLocation: async () => {
		// A second tap while the first is still resolving would leave an
		// orphaned watcher writing myLocation forever.
		if (myLocationWatcher) return true

		const servicesOn = await Location.hasServicesEnabledAsync().catch(() => false)
		if (!servicesOn) {
			get().showToast(getCopy().mapHome.locationServicesOff)
			return false
		}

		const { status } = await Location.requestForegroundPermissionsAsync()
		if (status !== 'granted') {
			get().showToast(getCopy().settings.locationOff)
			return false
		}

		set({ myLocationOn: true })
		get().showToast(getCopy().mapHome.myLocationOn)

		const apply = coords => {
			if (!coords) return
			set({ myLocation: { latitude: coords.latitude, longitude: coords.longitude } })
			get().checkProximity()
		}

		try {
			// Seed from the OS cache instantly, then demand a fresh fix — the
			// cache alone can be empty on a cold permission grant.
			// Bounded: an hours-old fix from another city would place the dot —
			// and every distance computed from it — somewhere they are not.
			const seed = await Location.getLastKnownPositionAsync({ maxAge: 60_000 })
			apply(seed?.coords)

			// High, not Balanced: on some devices (this MediaTek included) the
			// network provider never answers and Balanced hangs forever, while
			// GPS resolves fine — the driver-side watcher proved that.
			if (!seed?.coords) {
				const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
				apply(fix?.coords)
			}

			// 1 Hz so the dot glides instead of hopping every ten metres. This
			// costs battery, which is why it only ever runs while the commuter
			// has the crosshair explicitly switched on.
			myLocationWatcher = await Location.watchPositionAsync(
				// 3 m, not 1: a stationary phone jitters a few metres, and a dot
				// that drifts while its owner stands still is its own kind of
				// dishonest. Walking pace clears it in about two seconds.
				{ accuracy: Location.Accuracy.High, timeInterval: FIX_INTERVAL_MS, distanceInterval: 3 },
				loc => apply(loc?.coords)
			)
		} catch (e) {
			// Surfacing beats a silently empty map — this is why the dot exists.
			// Clear the seed fix too: a lingering myLocation with the toggle off
			// would keep distance-sorting the list to a frozen coordinate.
			get().showToast(`${getCopy().common.genericError} (${e?.message ?? 'location'})`)
			set({ myLocation: null, myLocationOn: false })
			return false
		}

		return true
	},

	disableMyLocation: () => {
		if (myLocationWatcher) {
			myLocationWatcher.remove()
			myLocationWatcher = null
		}
		alertedIds = new Set()
		// The dot going dark while a driver still sees this commuter waiting is
		// the exact broken promise this whole feature is built to avoid.
		const wasWatching = !!get().watchingTripId
		get().stopWatchingTrip()
		set({ myLocation: null, myLocationOn: false })
		// stopWatchingTrip already said the driver can no longer see them, which
		// is the more important half. Adding "itinago ang lokasyon mo" on top
		// would just overwrite it two lines later.
		if (!wasWatching) get().showToast(getCopy().mapHome.myLocationOff)
	},

	toggleMyLocation: () => (get().myLocationOn ? get().disableMyLocation() : get().enableMyLocation()),

	/**
	 * Show ONE driver where this commuter is waiting, for ONE trip. It borrows
	 * the crosshair's opt-in rather than raising a second permission prompt for
	 * a question the commuter has already answered.
	 */
	startWatchingTrip: async (tripId, vehicle = null) => {
		const generation = ++watchGeneration
		const superseded = () => generation !== watchGeneration

		if (!(await get().enableMyLocation())) return false
		if (superseded()) return false

		// enableMyLocation can report success with the fix still in flight, and
		// posting a null position would stand this commuter at 0,0 off Ghana.
		const position = get().myLocation
		if (!position) {
			get().showToast(getCopy().common.genericError)
			return false
		}

		const watcher = await watcherId()
		if (superseded()) return false

		let ack
		try {
			ack = await api.startWatching(tripId, { watcher, ...position })
		} catch {
			get().showToast(getCopy().common.genericError)
			return false
		}

		// The withdrawal landed while the opt-in was still in the air. Take the
		// row back, or the driver keeps a pin for a commuter who left the screen
		// believing they had never switched it on.
		if (superseded()) {
			api.stopWatching(tripId, watcher)
			return false
		}

		watchAckAt = Date.now()
		// The server names its own window, so a change there cannot leave the
		// banner outliving the row it describes.
		watchExpiresMs = (ack?.expiresIn ?? 150) * 1000

		set({ watchingTripId: tripId, watchingVehicle: vehicle })
		get().showToast(getCopy().vehicle.watchOn)

		if (watchPingTimer) clearInterval(watchPingTimer)
		if (watchGpsGuard) clearInterval(watchGpsGuard)

		// GPS switched off mid-wait kills the fixes silently. The driver would go
		// on seeing a pin the phone can no longer vouch for, so treat it the way
		// the commuter turning the dot off is treated.
		watchGpsGuard = setInterval(async () => {
			if (superseded()) return
			const on = await Location.hasServicesEnabledAsync().catch(() => false)
			if (!on && !superseded()) get().disableMyLocation()
		}, 20_000)
		// The server drops a row nobody has re-posted inside its freshness window,
		// so a commuter standing still at a corner would quietly disappear from
		// the driver's map having never opted out.
		watchPingTimer = setInterval(() => {
			const { watchingTripId, myLocation } = get()
			if (!watchingTripId || !myLocation) return

			// Nothing has reached the server inside its own window, so it has
			// dropped the row whatever the reason. Saying so beats a banner that
			// keeps promising visibility through a dead spot.
			if (Date.now() - watchAckAt > watchExpiresMs) return get().stopWatchingTrip(watchingTripId)

			api.startWatching(watchingTripId, { watcher, ...myLocation })
				.then(() => {
					if (superseded()) {
						// Withdrawn while this refresh was on the wire — it has just
						// re-created the row the DELETE removed. Take it back out.
						api.stopWatching(watchingTripId, watcher)
						return
					}

					watchAckAt = Date.now()
				})
				.catch(e => {
					// A rejection from a superseded refresh says nothing about the
					// consent that is live now.
					if (superseded()) return

					// The driver finished the run, so there is nobody left to be
					// seen by and the banner would be claiming otherwise.
					if ([404, 410, 422].includes(e?.response?.status)) get().stopWatchingTrip(watchingTripId)
				})
		}, PING_INTERVAL_MS)

		return true
	},

	/**
	 * Withdraw. `expectedTripId` guards the callers that are reacting to ONE
	 * trip ending — a 404 from a vehicle sheet the commuter merely browsed, or
	 * from a refresh belonging to a consent already replaced, must not revoke
	 * whichever consent happens to be live now.
	 */
	stopWatchingTrip: async (expectedTripId = null) => {
		const tripId = get().watchingTripId
		if (expectedTripId !== null && tripId !== expectedTripId) return

		// Cancels an opt-in that is still mid-flight as well as a live one.
		watchGeneration++

		// Kill the refresh first. A ping already queued behind the DELETE would
		// re-create the row the commuter just withdrew.
		if (watchPingTimer) {
			clearInterval(watchPingTimer)
			watchPingTimer = null
		}
		if (watchGpsGuard) {
			clearInterval(watchGpsGuard)
			watchGpsGuard = null
		}

		if (!tripId) return

		set({ watchingTripId: null, watchingVehicle: null })
		get().showToast(getCopy().vehicle.watchOff)

		await api.stopWatching(tripId, await watcherId())
	},

	toggleWatchingTrip: async (tripId, vehicle = null) => {
		if (get().watchingTripId === tripId) return get().stopWatchingTrip()

		// Opting into a second vehicle without withdrawing from the first would
		// leave the previous driver watching until the freshness window lapsed.
		if (get().watchingTripId) await get().stopWatchingTrip()
		await get().startWatchingTrip(tripId, vehicle)
	},

	/**
	 * Vibrate once when a LIVE vehicle comes within NEAR_M of the commuter,
	 * and not again until it has left NEAR_RESET_M — otherwise a jeepney
	 * crawling in traffic would buzz the phone continuously.
	 */
	checkProximity: (candidates = null) => {
		const { myLocation, myLocationOn, vehicles } = get()
		if (!myLocationOn || !myLocation) return

		const live = (candidates ?? vehicles).filter(v => !v.stale && v.position)
		const withDistance = live
			.map(v => ({ v, d: distanceM(myLocation, v.position) }))
			.filter(x => x.d !== null)
			.sort((a, b) => a.d - b.d)

		// Per VEHICLE, not just the nearest one: with two jeepneys in range
		// a single slot flip-flopped and buzzed on every poll.
		for (const { v, d } of withDistance) {
			if (d > NEAR_RESET_M) alertedIds.delete(v.id)
		}

		const arriving = withDistance.find(x => x.d <= NEAR_M && !alertedIds.has(x.v.id))
		if (!arriving) return

		alertedIds.add(arriving.v.id)
		Vibration.vibrate([0, 250, 120, 250])
		get().showToast(getCopy().mapHome.near(arriving.v.plate_number))
	},

	/**
	 * A pushed position, folded straight into the list.
	 *
	 * No refetch: the socket carries what changed, and the client already holds
	 * the rest. A push is also proof of life, so the card comes back from stale
	 * without waiting for the next poll to say so.
	 */
	applyVehicleMoved: payload => {
		if (payload?.id == null) return

		// One socket frame per vehicle means a 30-strong fleet lands 30 frames in
		// a single native burst. Writing the store per frame is one render each,
		// which trips React's nested-update limit outright, and re-runs the O(n)
		// proximity scan n times over. Collect the burst and apply it in ONE
		// write. Keying by id also drops all but the newest fix for a vehicle
		// that pinged twice inside the window. The glide interpolates between
		// store writes, so the motion on screen is unchanged.
		movedBuffer.set(payload.id, payload)
		if (movedFlush) return

		movedFlush = setTimeout(() => {
			movedFlush = null
			const burst = movedBuffer
			movedBuffer = new Map()
			get().applyMoveBurst(burst)
		}, MOVE_FLUSH_MS)
	},

	applyMoveBurst: burst => {
		if (!burst.size) return

		set(state => ({
			vehicles: state.vehicles.map(v => {
				const payload = burst.get(v.id)
				if (!payload) return v

				const position = payload.position?.lat != null
					? { latitude: Number(payload.position.lat), longitude: Number(payload.position.lng) }
					: null

				// Freshness comes from the ping the payload carries, not from the fact
				// that a message arrived. A capacity tap broadcasts too, and assuming it
				// meant "live" would bring a vehicle that stopped reporting hours ago
				// back onto the map as LIVE — the exact invention the stale badge is
				// there to prevent. Mirrors normaliseVehicle in api.js.
				const pingedAt = payload.last_ping_at ? new Date(payload.last_ping_at).getTime() : null
				const age = pingedAt ? Date.now() - pingedAt : null
				const stale = age === null || age > STALE_AFTER_MS

				return {
					...v,
					position: position ?? v.position,
					current_street: payload.current_street ?? v.current_street,
					// A stale vehicle reports no capacity, same as the listing.
					capacity: stale ? 'unknown' : (payload.capacity ?? v.capacity),
					stale,
					minutesAgo: age === null ? null : Math.floor(age / 60000)
				}
			})
		}))

		get().checkProximity()
	},

	/**
	 * The simulator sends the whole fleet's tick as ONE frame instead of one
	 * frame per vehicle — thirty-one broadcasts every eight seconds was most of
	 * what a tick cost the server. Each entry is exactly a vehicle.moved payload,
	 * so it goes through the same buffered path and the glide sees no difference.
	 */
	applyFleetMoved: payload => {
		for (const moved of payload?.vehicles ?? []) get().applyVehicleMoved(moved)
	},

	startPolling: () => {
		const schedule = ms => {
			if (pollTimer) clearInterval(pollTimer)
			pollTimer = setInterval(() => get().refresh(), ms)
		}

		get().refresh()

		// The socket carries positions; the poll still carries MEMBERSHIP — a
		// jeepney that started or ended a trip is not a move, so it arrives on
		// no channel. Both run, and the poll alone is enough if the socket
		// never connects.
		if (!fleetSocket) fleetSocket = subscribe('fleet', 'vehicle.moved', get().applyVehicleMoved)
		if (!fleetBatchSocket) fleetBatchSocket = subscribe('fleet', 'fleet.moved', get().applyFleetMoved)

		// The poll's cadence follows the socket. Down: every 8 s, matching the
		// driver broadcast interval, because it is then the only source of
		// movement. Up: once a minute, for membership only — every 8 s it was
		// re-downloading 22 KB the socket had already delivered and handing
		// every pin a fresh object identity to re-render against.
		if (!socketState) {
			socketState = onRealtimeState(state => schedule(state === 'up' ? RECONCILE_INTERVAL_MS : PING_INTERVAL_MS))
		} else {
			schedule(PING_INTERVAL_MS)
		}
	},

	stopPolling: () => {
		if (pollTimer) clearInterval(pollTimer)
		pollTimer = null

		if (movedFlush) clearTimeout(movedFlush)
		movedFlush = null
		movedBuffer = new Map()

		if (fleetSocket) {
			fleetSocket()
			fleetSocket = null
		}
	},

	/* --------------------------------------------------------------- driver */
	driver: null,
	trip: null,
	summary: null,
	isBroadcasting: false,
	registering: false,

	register: async payload => {
		set({ registering: true })
		try {
			const data = await api.registerDriver(payload)
			api.setAuthToken(data.token)
			await AsyncStorage.setItem(KEYS.token, data.token)
			await AsyncStorage.setItem(KEYS.driver, JSON.stringify(data.user))
			set({ driver: data.user })
			return data.user
		} finally {
			set({ registering: false })
		}
	},

	login: async credentials => {
		const data = await api.loginDriver(credentials)
		api.setAuthToken(data.token)
		await AsyncStorage.setItem(KEYS.token, data.token)
		await AsyncStorage.setItem(KEYS.driver, JSON.stringify(data.user))
		set({ driver: data.user })
		return data.user
	},

	/** Re-reads the driver, including verification_status — polled by the pending screen. */
	refreshMe: async () => {
		try {
			const driver = await api.fetchMe()
			set({ driver })
			await AsyncStorage.setItem(KEYS.driver, JSON.stringify(driver))
			return driver
		} catch {
			return null
		}
	},

	logout: async () => {
		await api.logoutDriver()
		await AsyncStorage.multiRemove([KEYS.token, KEYS.driver])
		api.setAuthToken(null)
		// Private channels were authorised with the token just thrown away.
		disconnectRealtime()
		get().stopBroadcast()
		set({ driver: null, trip: null, summary: null })
	},

	loadSummary: async () => {
		try {
			set({ summary: await api.fetchTripSummary() })
		} catch {
			set({ summary: null })
		}
	},

	/**
	 * Starting a trip is what makes the driver visible. Location capture begins
	 * here and nowhere else — this is the app's only GPS permission prompt.
	 */
	startTrip: async (destination, { routeId, destCoords, via } = {}) => {
		// The server refuses an unapproved driver too; this is the local guard so
		// we never even ask for GPS from someone who cannot broadcast yet.
		if (get().driver?.verification_status !== 'approved') {
			get().showToast(getCopy().pending.notApproved)
			return null
		}

		// GPS off means the watcher would produce nothing: a driver would look
		// "live" to themselves while never appearing to a single commuter.
		const servicesOn = await Location.hasServicesEnabledAsync().catch(() => false)
		if (!servicesOn) {
			get().showToast(getCopy().driverHome.locationServicesOff)
			return null
		}

		const { status } = await Location.requestForegroundPermissionsAsync()
		if (status !== 'granted') {
			get().showToast(getCopy().settings.locationOff)
			return null
		}

		const position = await currentFix()
		const trip = await api.startTrip(destination, { routeId, position, destCoords, via })
		set({ trip, isBroadcasting: true })
		await get().beginBroadcast(trip.id)
		return trip
	},

	/**
	 * Mid-trip destination change. The server re-resolves the route from the
	 * vehicle's live position, so the drawn line re-routes the way a
	 * navigation app would — the run itself keeps going.
	 */
	rerouteTrip: async (destination, { routeId, destCoords, via } = {}) => {
		const trip = get().trip
		if (!trip) return null

		const position = await currentFix()
		const updated = await api.rerouteTrip(trip.id, destination, { routeId, position, destCoords, via })
		set({ trip: updated })
		get().showToast(getCopy().startTrip.rerouted)
		return updated
	},

	/**
	 * A route the driver tapped on the home screen, waiting to be applied by
	 * the start screen. Same reason `rerouting` lives here: /driver/start is
	 * reached by a deep link, and params do not survive one.
	 */
	presetRoute: null,
	setPresetRoute: presetRoute => set({ presetRoute }),

	/** Route intent for /driver/start: deep links drop params, stores don't. */
	rerouting: false,
	beginReroute: () => set({ rerouting: true }),
	endReroute: () => set({ rerouting: false }),

	/** The driver's own live fix — their map draws from it, navigation-style. */
	broadcastPosition: null,

	beginBroadcast: async tripId => {
		if (broadcastWatcher) broadcastWatcher.remove()
		if (broadcastGuard) clearInterval(broadcastGuard)

		// The driver's GPS is the only thing commuters can track. If Location
		// gets switched off mid-trip the watcher just goes silent, so keep
		// telling the driver until it is back on.
		broadcastGuard = setInterval(async () => {
			const servicesOn = await Location.hasServicesEnabledAsync().catch(() => false)
			if (!servicesOn) get().showToast(getCopy().driverHome.locationServicesOff)
		}, 20_000)

		try {
			broadcastWatcher = await startBroadcastWatcher(tripId, get, set)
		} catch (e) {
			// A rejected watcher (GPS flipped off mid-start) must not leave the
			// guard toasting forever with nothing to guard.
			get().stopBroadcast()
			throw e
		}
	},

	setCapacity: async capacity => {
		const { trip } = get()
		if (!trip) return
		set({ trip: { ...trip, capacity } })
		try {
			await api.setTripCapacity(trip.id, capacity)
		} catch {
			get().showToast(getCopy().common.genericError)
		}
	},

	endTrip: async () => {
		const { trip } = get()
		get().stopBroadcast()
		if (trip) await api.endTrip(trip.id).catch(() => {})
		set({ trip: null, isBroadcasting: false })
		get().loadSummary()
	},

	stopBroadcast: () => {
		if (broadcastWatcher) {
			broadcastWatcher.remove()
			broadcastWatcher = null
		}
		if (broadcastGuard) {
			clearInterval(broadcastGuard)
			broadcastGuard = null
		}
		set({ isBroadcasting: false, broadcastPosition: null })
	}
}))
