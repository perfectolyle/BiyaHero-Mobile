/** Straight-line distance in metres between two {latitude, longitude} points. */
export const distanceM = (a, b) => {
	if (!a || !b) return null

	const R = 6371000
	const dLat = ((b.latitude - a.latitude) * Math.PI) / 180
	const dLng = ((b.longitude - a.longitude) * Math.PI) / 180
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2

	return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)))
}

/** A vehicle inside this radius counts as "malapit na". */
export const NEAR_M = 350
/** Must leave this radius before the same vehicle can alert again. */
export const NEAR_RESET_M = 600

/**
 * Nearest polyline segment to a point: index `i`, projection parameter `t`
 * (0..1 along that segment) and distance. `i + t` is a monotone measure of
 * how far along the whole line the point sits. Planar approximation — fine
 * at city scale.
 */
const nearestSegment = (p, pts) => {
	const kx = 111320 * Math.cos((p.latitude * Math.PI) / 180)
	const ky = 110574
	let best = { i: 0, t: 0, d: Infinity }

	for (let i = 0; i < pts.length - 1; i++) {
		const a = pts[i]
		const b = pts[i + 1]
		const ax = (a.longitude - p.longitude) * kx
		const ay = (a.latitude - p.latitude) * ky
		const bx = (b.longitude - p.longitude) * kx
		const by = (b.latitude - p.latitude) * ky
		const dx = bx - ax
		const dy = by - ay
		const len2 = dx * dx + dy * dy
		const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
		const d = Math.hypot(ax + t * dx, ay + t * dy)
		if (d < best.d) best = { i, t, d }
	}

	return best
}

/**
 * The navigation-style line: from the vehicle, along the corridor, ENDING at
 * the exact destination. Everything behind the vehicle is consumed, and the
 * corridor past the destination is never drawn — a reused route can run far
 * beyond (or start before) where this trip is actually going.
 *
 * Orientation compares positions ALONG the line, not the endpoints: a
 * destination can sit mid-corridor nearer the "wrong" end, and an
 * endpoint-only check then reverses the line and collapses it to nothing.
 */
/**
 * A name a person would recognise, out of what reverseGeocodeAsync returns.
 *
 * `place.name` is a Plus Code ("HMPG+JFM") whenever the OS has no street for
 * the spot, which is worse than saying nothing — so a real street or district
 * is preferred and a code is dropped entirely. Street first: these label
 * ROADS, and a driver names the road, not the barangay it sits in.
 */
const isPlusCode = value => /^[A-Z0-9]{4,8}\+[A-Z0-9]{2,4}$/i.test(value ?? '')

export const placeLabel = place =>
	[place?.street, place?.district, place?.subregion, place?.city, place?.name]
		.find(value => value && !isPlusCode(value)) ?? null

/**
 * The corridor pointed the way this run is driving, cut at the destination.
 *
 * Split out from remainingRoute because the two halves change at different
 * rates: which way round the line runs depends on the vehicle's ACTUAL fix and
 * only changes when a ping lands, while the trim behind the vehicle is redone
 * every animation frame. Deciding orientation from the target alone is not a
 * cheaper version of this — it is a different, wrong answer. A route is stored
 * once and driven both ways, and most destinations sit mid-corridor rather than
 * at an end, so without the position the line reverses onto the half the
 * vehicle is not on and collapses to a chord across the city.
 */
export const orientRoute = (position, waypoints, target = null) => {
	if (!waypoints?.length) return waypoints ?? []

	let pts = waypoints
	if (pts.length < 2) return pts

	const posSeg = position ? nearestSegment(position, pts) : null
	let tgtSeg = target ? nearestSegment(target, pts) : null

	// The vehicle must come BEFORE the destination along the drawn line.
	if (posSeg && tgtSeg && tgtSeg.i + tgtSeg.t < posSeg.i + posSeg.t) {
		pts = [...pts].reverse()
		tgtSeg = nearestSegment(target, pts)
	} else if (!posSeg && tgtSeg && tgtSeg.i + tgtSeg.t < (pts.length - 1) / 2) {
		pts = [...pts].reverse()
		tgtSeg = nearestSegment(target, pts)
	}

	// Cut the corridor at the destination and land the line exactly on it.
	return tgtSeg ? [...pts.slice(0, tgtSeg.i + 1), target] : pts
}

export const remainingRoute = (position, waypoints, target = null) => {
	const pts = orientRoute(position, waypoints, target)

	// Consume everything behind the vehicle, anchoring the line on it.
	if (!position || pts.length < 2) return pts

	const posSeg = nearestSegment(position, pts)
	const from = Math.min(posSeg.i, pts.length - 2)

	return [position, ...pts.slice(from + 1)]
}
