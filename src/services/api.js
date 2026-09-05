import axios from 'axios'
import Constants from 'expo-constants'
import { STALE_AFTER_MS } from '@/theme/tokens'

export const client = axios.create({
	baseURL: Constants.expoConfig?.extra?.apiUrl,
	timeout: 10000,
	headers: { Accept: 'application/json' }
})

/** Driver token. Commuters never authenticate, so this stays null for them. */
export const setAuthToken = token => {
	if (token) client.defaults.headers.common.Authorization = `Bearer ${token}`
	else delete client.defaults.headers.common.Authorization
}

/**
 * Server shape → the shape the cards render. Freshness is derived on the client
 * too, so a card goes stale while the screen is open rather than only on refetch.
 */
const normaliseVehicle = v => {
	const pingedAt = v.last_ping_at ? new Date(v.last_ping_at).getTime() : null
	const age = pingedAt ? Date.now() - pingedAt : null
	const stale = v.is_stale || age === null || age > STALE_AFTER_MS

	return {
		id: v.id,
		tripId: v.trip_id,
		vehicle_code: v.vehicle_code,
		vehicle_type: v.vehicle_type,
		plate_number: v.plate_number,
		model: v.model,
		// The name painted along the side — a bus is known by its line.
		operator: v.operator ?? null,
		body_number: v.body_number,
		destination: v.destination,
		// Only on a destination search: how close this route runs to it.
		passesWithinM: v.passes_within_m ?? null,
		destinationPosition: v.destination_position?.lat != null
			? { latitude: Number(v.destination_position.lat), longitude: Number(v.destination_position.lng) }
			: null,
		capacity: stale ? 'unknown' : (v.capacity ?? 'unknown'),
		current_street: v.current_street,
		// What the vehicle looks like, so a commuter can match it to the road.
		photoUrl: v.photo_url ?? null,
		position: v.position?.lat != null
			? { latitude: Number(v.position.lat), longitude: Number(v.position.lng) }
			: null,
		route: {
			id: v.route?.id,
			label: v.route?.label,
			length_km: v.route?.length_km,
			waypoints: (v.route?.waypoints ?? []).map(w => ({ latitude: Number(w.lat), longitude: Number(w.lng) }))
		},
		is_verified: !!v.driver?.is_verified,
		driver_name: v.driver?.name ?? null,
		driver_years: v.driver?.years_on_route ?? 0,
		stale,
		minutesAgo: age === null ? null : Math.floor(age / 60000)
	}
}

/*
 * Commuter reads. NOTE: no lat/lng parameter exists on any of these by design —
 * none of them may know where the commuter is. The one and only place a
 * commuter position leaves the device is startWatching below, and only for the
 * single trip the commuter explicitly agreed to be visible on.
 */

export const fetchActiveVehicles = ({ destination, destCoords, vehicleType } = {}) =>
	client
		.get('/active-vehicles', {
			params: {
				...(destination ? { destination } : {}),
				// The place the commuter picked — not where they are. Without it
				// the server re-guesses the name and can land in another town.
				...(destCoords ? { dest_lat: destCoords.lat, dest_lng: destCoords.lng } : {}),
				...(vehicleType && vehicleType !== 'all' ? { vehicle_type: vehicleType } : {})
			}
		})
		.then(res => ({
			vehicles: (res.data?.data ?? []).map(normaliseVehicle),
			meta: res.data?.meta ?? {}
		}))


/**
 * Where the live socket is, if there is one.
 *
 * Asked at runtime rather than baked into the build: the key rotates and the
 * host differs between a laptop and production, and an APK already in a
 * tester's hands must not need rebuilding for either.
 */
export const fetchRealtimeConfig = () =>
	client.get('/realtime').then(res => res.data?.data ?? null)

export const fetchVehicle = (id, { geometry = true } = {}) =>
	client
		.get(`/active-vehicles/${id}`, geometry ? undefined : { params: { geometry: 0 } })
		.then(res => normaliseVehicle(res.data?.data ?? res.data))

/**
 * "Nakatutok sa iyo" — the consented exception to everything above. The
 * commuter has asked THIS driver, for THIS trip, to see where they are
 * waiting. `watcher` is the device id from ./watchers, and the server keeps
 * only a hash of it so the position can be withdrawn but not attributed.
 *
 * Re-posting the same watcher refreshes the row rather than adding a second
 * one, which is how the position stays inside the server's freshness window.
 */
export const startWatching = (tripId, { watcher, latitude, longitude }) =>
	client
		.post(`/trips/${tripId}/watchers`, { watcher, lat: latitude, lng: longitude })
		.then(res => ({ expiresIn: res.data?.data?.expires_in ?? null }))

/**
 * Withdraw that consent. Swallows its failure on purpose: the caller has
 * already flipped the switch off, and a thrown error there would leave the UI
 * saying "hidden" while the row still stood. The freshness window is the
 * backstop for the request that never landed.
 */
export const stopWatching = (tripId, watcher) =>
	// axios carries a DELETE body under `data`. Passed as a plain second
	// argument it is sent as config instead, the server sees no watcher, and
	// the opt-out silently does nothing.
	client.delete(`/trips/${tripId}/watchers`, { data: { watcher } }).catch(() => {})

/**
 * Commuter type-ahead — anywhere on the map. Public and position-free: the
 * server ranks by where the fleet runs, not by where the commuter is.
 */
export const suggestPlaces = q =>
	client
		.get('/places/suggest', { params: { q } })
		.then(res =>
			(res.data?.data ?? []).map(p => ({
				name: p.name,
				subtitle: p.subtitle,
				known: !!p.known,
				lat: Number(p.lat),
				lng: Number(p.lng)
			}))
		)

/**
 * The places to draw inside the map's current viewport — Biyahero's own place
 * layer, because Google only styles the plain map type and leaves satellite
 * and terrain with a thinner, different set of labels.
 *
 * Coordinates here are the map's corners, never the device's position.
 */
export const fetchNearbyPlaces = ({ south, west, north, east }) =>
	client
		.get('/places/nearby', { params: { south, west, north, east } })
		.then(res =>
			(res.data?.data ?? []).map(p => ({
				id: p.id,
				name: p.name,
				kind: p.kind,
				rank: p.rank ?? 9,
				position: { latitude: Number(p.lat), longitude: Number(p.lng) }
			}))
		)

export const fetchDestinations = q =>
	client.get('/destinations', { params: q ? { q } : {} }).then(res => res.data?.data ?? [])

export const fetchRoute = id => client.get(`/routes/${id}`).then(res => res.data)

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** Which route serves this destination — used for the driver's pre-trip preview. */
export const fetchRouteForDestination = destination =>
	client.get('/routes/for-destination', { params: { destination } }).then(res => {
		const route = res.data?.data
		if (!route) return null

		return {
			id: route.id,
			label: route.label ?? route.name,
			length_km: Number(route.length_km ?? 0),
			waypoints: (route.waypoints ?? []).map(w => ({ latitude: Number(w.lat), longitude: Number(w.lng) }))
		}
	})

/**
 * Travel time for the DRIVER's own route preview only. This is never shown to a
 * commuter as an arrival time — that would need the commuter's position.
 */
export const fetchEta = ({ routeId, vehicleType, distanceKm }) => {
	const now = new Date()

	return client
		.post('/eta', {
			route_id: routeId,
			vehicle_type: vehicleType,
			hour_of_day: now.getHours(),
			day_of_week: DAYS[now.getDay()],
			distance_km: distanceKm
		})
		.then(res => Math.round(res.data?.predicted_travel_time_minutes ?? 0))
		.catch(() => null)
}

/* Driver writes — where the app handles a location as a matter of course. */

/**
 * Multipart, because the licence photo is a real file. The server stores it on
 * a private disk for a human reviewer and never returns it.
 */
export const registerDriver = ({ licencePhotoUri, vehiclePhotoUri, ...fields }) => {
	const form = new FormData()

	Object.entries(fields).forEach(([key, value]) => {
		if (value !== undefined && value !== null && value !== '') form.append(key, String(value))
	})

	form.append('license_photo', {
		uri: licencePhotoUri,
		name: 'licence.jpg',
		type: 'image/jpeg'
	})

	// Optional, and left out entirely when absent — an empty part fails the
	// server's `image` rule and would sink the whole registration.
	if (vehiclePhotoUri) {
		form.append('vehicle_photo', {
			uri: vehiclePhotoUri,
			name: 'vehicle.jpg',
			type: 'image/jpeg'
		})
	}

	return client
		.post('/register', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 30000 })
		.then(res => res.data?.data)
}

export const loginDriver = credentials =>
	client.post('/login', credentials).then(res => res.data?.data)

export const fetchMe = () => client.get('/me').then(res => res.data?.data)

export const logoutDriver = () => client.post('/logout').catch(() => {})

export const fetchCurrentTrip = () => client.get('/trips/current').then(res => res.data?.data)

/** Type-ahead for the driver's destination field. Driver-side only. */
/**
 * One autocomplete session: every keystroke of a search, plus the pick that
 * ends it. Google bills the pair once instead of billing each letter, and it
 * is also what lets it learn which prefix led to which choice.
 */
export const newSearchSession = () =>
	'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
		const r = (Math.random() * 16) | 0

		return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
	})

export const searchPlaces = (q, position, session) =>
	client
		.get('/places/search', {
			params: {
				q,
				...(position ? { lat: position.latitude, lng: position.longitude } : {}),
				...(session ? { session } : {})
			}
		})
		.then(res =>
			(res.data?.data ?? []).map(p => ({
				name: p.name,
				subtitle: p.subtitle,
				known: !!p.known,
				// Null unless the driver's position was sent — a distance we
				// cannot compute must not be printed as zero.
				distanceM: p.distance_m ?? null,
				// A Google prediction arrives without a point, on purpose: that
				// is what makes predictions cheap. resolvePlace turns the one
				// they pick into coordinates.
				placeId: p.place_id ?? null,
				coords: p.lat != null ? { latitude: Number(p.lat), longitude: Number(p.lng) } : null
			}))
		)

/** The point behind a prediction, fetched once the driver has chosen it. */
export const resolvePlace = (placeId, session) =>
	client
		.get('/places/resolve', { params: { place_id: placeId, session } })
		.then(res => {
			const p = res.data?.data

			return p ? { name: p.name, subtitle: p.subtitle, coords: { latitude: Number(p.lat), longitude: Number(p.lng) } } : null
		})

/** The driver's own last few routes — one tap to run the same line again. */
/**
 * What the roads make of the line the driver drew.
 *
 * A tap lands on the nearest road, and near an expressway that is the
 * expressway — one a jeepney may not use and that can only be joined at an
 * interchange. Showing the snapped line before the trip starts is the only way
 * the driver finds out while they can still move a point.
 */
export const previewRoute = points =>
	client
		.post('/routes/preview', { points: points.map(p => ({ lat: p.latitude, lng: p.longitude })) })
		.then(res => {
			const d = res.data?.data

			return d
				? {
					waypoints: (d.waypoints ?? []).map(w => ({ latitude: Number(w.lat), longitude: Number(w.lng) })),
					lengthKm: Number(d.length_km),
					drawnKm: Number(d.drawn_km),
					roadMatched: !!d.road_matched
				}
				: null
		})

export const fetchRecentRoutes = () =>
	client.get('/routes/recent').then(res =>
		(res.data?.data ?? []).map(r => ({
			id: r.id,
			label: r.label,
			length_km: Number(r.length_km ?? 0),
			destination: r.destination,
			lastUsedAt: r.last_used_at
		}))
	)

/** Routes whose corridor passes near the DRIVER — never called commuter-side. */
export const fetchNearbyRoutes = ({ latitude, longitude }) =>
	client
		.get('/routes/nearby', { params: { lat: latitude, lng: longitude } })
		.then(res => res.data?.data ?? [])

export const fetchTripSummary = () => client.get('/trips/summary').then(res => res.data?.data)

/**
 * Roads the driver says they actually take, in the order they drive them.
 * A jeepney route is defined by its roads, not its endpoints.
 */
const viaPayload = via =>
	via?.length ? { via: via.map(p => ({ lat: p.latitude, lng: p.longitude })) } : {}

export const startTrip = (destination, { routeId, position, destCoords, via } = {}) =>
	client
		.post('/trips', {
			destination,
			...viaPayload(via),
			...(routeId ? { route_id: routeId } : {}),
			// The driver's own position: route resolution starts from here, so a
			// Tarlac driver can never be handed a Metro Manila corridor.
			...(position ? { lat: position.latitude, lng: position.longitude } : {}),
			...(destCoords ? { dest_lat: destCoords.latitude, dest_lng: destCoords.longitude } : {})
		})
		.then(res => res.data?.data)

/** Mid-trip destination change — the route re-resolves from the live position. */
export const rerouteTrip = (tripId, destination, { routeId, position, destCoords, via } = {}) =>
	client
		.patch(`/trips/${tripId}/route`, {
			destination,
			...(routeId ? { route_id: routeId } : {}),
			...(position ? { lat: position.latitude, lng: position.longitude } : {}),
			...(destCoords ? { dest_lat: destCoords.latitude, dest_lng: destCoords.longitude } : {})
		})
		.then(res => res.data?.data)

export const pingTrip = (tripId, { latitude, longitude, street, distanceKm }) =>
	client.post(`/trips/${tripId}/ping`, {
		lat: latitude,
		lng: longitude,
		...(street ? { street } : {}),
		...(distanceKm != null ? { distance_km: distanceKm } : {})
	})

export const setTripCapacity = (tripId, capacity) =>
	client.patch(`/trips/${tripId}/capacity`, { capacity }).then(res => res.data?.data)

/**
 * The other half of startWatching: where the commuters who opted into THIS
 * trip are waiting. Places, not people — the server returns no identifier of
 * any kind, so two pins may or may not be the same phone and the driver has no
 * way to tell. `endTrip` deletes the rows outright.
 */
export const fetchTripWatchers = tripId =>
	client.get(`/trips/${tripId}/watchers`).then(res => {
		const d = res.data?.data ?? {}

		return {
			count: d.count ?? 0,
			// How many are standing on the road still ahead — the ones the driver
			// can actually stop for without leaving their corridor.
			onRouteCount: d.on_route_count ?? 0,
			// Null while the vehicle has no live fix, and null when nobody is on
			// the route. A distance we cannot measure must not be printed as zero.
			nearestM: d.nearest_m ?? null,
			points: (d.points ?? []).map(p => ({
				latitude: Number(p.lat),
				longitude: Number(p.lng),
				distanceM: p.distance_m ?? null,
				onRoute: !!p.on_route
			}))
		}
	})

export const endTrip = tripId => client.post(`/trips/${tripId}/end`).then(res => res.data?.data)

export const fetchTripHistory = () => client.get('/trips/history').then(res => res.data?.data ?? [])

/** NOTE: the plate is half the login credential — changing it changes the login. */
/**
 * The vehicle, and optionally a new photo of it.
 *
 * Multipart only when there IS a photo: a plain PATCH is cheaper, and sending
 * an empty file part makes the server's `image` rule reject the whole edit.
 * Laravel reads PATCH from _method because multipart bodies do not survive one.
 */
export const updateVehicle = ({ vehiclePhotoUri, ...fields }) => {
	if (!vehiclePhotoUri) return client.patch('/vehicle', fields).then(res => res.data?.data)

	const form = new FormData()
	Object.entries(fields).forEach(([key, value]) => {
		if (value !== undefined && value !== null && value !== '') form.append(key, String(value))
	})
	form.append('_method', 'PATCH')
	form.append('vehicle_photo', { uri: vehiclePhotoUri, name: 'vehicle.jpg', type: 'image/jpeg' })

	return client
		.post('/vehicle', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 30000 })
		.then(res => res.data?.data)
}
