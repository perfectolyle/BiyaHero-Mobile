import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { View, Pressable, Modal, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps'
import { MaterialIcons } from '@expo/vector-icons'
import { VehicleGlyph } from './VehicleGlyph'
import { Txt } from '@/components/ui/Txt'
import { fetchNearbyPlaces } from '@/services/api'
import { usePrefs, MAP_TYPES } from '@/services/prefs'
import { useCopy } from '@/constants/copy'
import { distanceM, orientRoute, remainingRoute } from '@/services/geo'
import { elevation } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'
import { MAP_STYLES } from '@/theme/mapStyle'

/**
 * Metro Manila, where the demo fleet runs. The commuter pans from here — the app
 * never centres on them, because it never learns where they are.
 */
const DEFAULT_REGION = {
	latitude: 14.5750,
	longitude: 121.0000,
	latitudeDelta: 0.16,
	longitudeDelta: 0.16
}

/**
 * Where the user last panned, remembered on the device only.
 *
 * Without this the map reopens over Metro Manila every launch, which is wrong
 * for anyone living elsewhere. Remembering the last view gives them their own
 * area back without ever asking for a location permission.
 */
const REGION_KEY = 'biyahero.mapRegion'

/**
 * Marker whose view tracking stays on through a generous settle window, then
 * freezes. While tracksViewChanges is true Android re-rasterises the marker
 * continuously — with a whole fleet that is real GPU work every frame. But
 * frozen too early it snapshots a blank view (fonts and SVGs land late on a
 * cold start; a 900ms freeze lost that race on device). So: track for
 * SETTLE_MS after mount, freeze, and re-open the window whenever something
 * that changes the marker's pixels changes (`redrawKey`). Position changes
 * move the frozen bitmap — they need no window.
 */
const SETTLE_MS = 5000

/**
 * Far enough that the vehicle cannot have driven it between two fixes: a
 * resumed session, a GPS correction, or the first fix after a cold start.
 * Animating one of those sends the pin sliding across the city.
 */
const GLIDE_JUMP_M = 3000

/**
 * How often interpolated positions advance.
 *
 * 30 Hz, not 60: at city zoom a jeepney covers under two pixels a frame at
 * 60 Hz, so the extra half of the work buys nothing anyone can see.
 */
const GLIDE_HZ = 30

/**
 * Bounds on how long a pin takes to cross to its new fix.
 *
 * The gap is MEASURED, not assumed. Pings are nominally eight seconds apart and
 * in practice are not: a backgrounded app, a dead spot or a slow poll stretches
 * them. Animating over a hardcoded interval makes the pin finish early and
 * freeze — the hop-and-hold that reads as blinking — or overshoot the next fix.
 */
// Each follow step animates for exactly as long as the gap to the next one, so
// the camera is always moving rather than stepping and waiting.
const FOLLOW_STEP_MS = 400

const GLIDE_MIN_MS = 1000
const GLIDE_MAX_MS = 20000

/**
 * Below this spread, a set of points is a place, not an area, and is framed
 * as one. About 300 m — two vehicles idling at the same terminal, or a
 * destination with nothing passing it, must not become a max-zoom rooftop.
 */
const MIN_FIT_SPAN_DEG = 0.003

/** How a single place is framed: the neighbourhood, with a few streets around it. */
const PLACE_ZOOM = 15

/*
 * Navigation follow — the driver's view. Zoom, tilt and lead distance are
 * Google Maps' own proportions, near enough: close enough to read the next
 * turn, tilted enough that the road ahead runs up the screen, and aimed far
 * enough ahead that the vehicle sits low, above the sheet, not under it.
 */
const NAV_ZOOM = 17
const NAV_PITCH = 50
const NAV_LEAD_M = 90
/** Fixes closer than this carry no usable bearing — a parked jeepney jitters. */
const NAV_HEADING_MIN_M = 4

const RAD = Math.PI / 180

/** Compass bearing from a to b, in degrees clockwise from north. */
const bearing = (a, b) => {
	const lat1 = a.latitude * RAD
	const lat2 = b.latitude * RAD
	const dLng = (b.longitude - a.longitude) * RAD
	const y = Math.sin(dLng) * Math.cos(lat2)
	const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)

	return (Math.atan2(y, x) / RAD + 360) % 360
}

/** The point `metres` along `headingDeg` from `p`. */
const offsetM = (p, headingDeg, metres) => {
	const d = metres / 6371000
	const brg = headingDeg * RAD
	const lat1 = p.latitude * RAD
	const lng1 = p.longitude * RAD
	const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg))
	const lng2 = lng1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))

	return { latitude: lat2 / RAD, longitude: lng2 / RAD }
}

const lerp = (a, b, t) => a + (b - a) * t

/** Where a pin is right now, or its raw fix if nothing is interpolating it. */
const at = (legs, key, fallback = null) => {
	const leg = legs[key]
	if (!leg) return fallback

	const t = leg.durationMs > 0 ? Math.min(1, (Date.now() - leg.startedAt) / leg.durationMs) : 1

	return {
		latitude: lerp(leg.from.latitude, leg.to.latitude, t),
		longitude: lerp(leg.from.longitude, leg.to.longitude, t)
	}
}

/**
 * One clock, driving every position on the map.
 *
 * Two things force this shape. First, the route line is consumed at the
 * vehicle, so the line and the pin MUST read the same interpolated point — cut
 * the line at the raw fix while the pin is still travelling and the road clears
 * before the jeepney reaches it, which is precisely the defect this replaces.
 * Nothing native exposes its interpolated value back to JS, so the
 * interpolation has to live here.
 *
 * Second, cost. Animated markers move by setNativeProps, and on the New
 * Architecture every one of those is a full shadow-tree commit — twenty pins
 * animating is twenty commits a frame. One tick that re-renders memoised pins
 * is one commit, whatever the fleet size.
 */
const useGlide = points => {
	const legs = useRef({})
	const [, setFrame] = useState(0)

	// Signature, not the array: the poll rebuilds every object each tick, and
	// identity alone would restart every leg eight times a minute.
	const signature = points
		.map(p => `${p.key}:${p.position?.latitude ?? ''},${p.position?.longitude ?? ''}`)
		.join('|')

	useEffect(() => {
		const now = Date.now()

		for (const { key, position } of points) {
			if (!position) continue

			const leg = legs.current[key]
			if (leg && leg.to.latitude === position.latitude && leg.to.longitude === position.longitude) continue

			// Measured from the previous fix for this pin, so an irregular ping
			// stretches the glide instead of stranding it.
			const gap = leg ? Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, now - leg.startedAt)) : 0
			const from = leg ? at(legs.current, key, position) : position
			const jumped = distanceM(from, position)

			legs.current[key] = {
				from,
				to: position,
				startedAt: now,
				// A jump is not a drive: land on it rather than sliding the pin
				// across the city for the next eight seconds.
				durationMs: jumped !== null && jumped > GLIDE_JUMP_M ? 0 : gap
			}
		}

		// Pins that left the fleet must not keep a leg alive forever.
		const live = new Set(points.map(p => p.key))
		for (const key of Object.keys(legs.current)) {
			if (!live.has(key)) delete legs.current[key]
		}

		// The interval only renders while something is mid-glide, so a leg that
		// SNAPPED (duration 0) would otherwise sit at the old fix until the next
		// vehicle happens to move.
		setFrame(f => f + 1)
	}, [signature])

	useEffect(() => {
		const timer = setInterval(() => {
			const now = Date.now()
			// Idle costs one cheap scan; only motion costs a render.
			const moving = Object.values(legs.current).some(leg => now - leg.startedAt < leg.durationMs)
			if (moving) setFrame(f => f + 1)
		}, Math.round(1000 / GLIDE_HZ))

		return () => clearInterval(timer)
	}, [])

	return legs.current
}

const SettledMarker = ({ redrawKey, settleMs = SETTLE_MS, children, ...markerProps }) => {
	const [tracking, setTracking] = useState(true)

	useEffect(() => {
		setTracking(true)
		const timer = setTimeout(() => setTracking(false), settleMs)
		return () => clearTimeout(timer)
	}, [redrawKey, settleMs])

	return (
		<Marker tracksViewChanges={tracking} {...markerProps}>
			{children}
		</Marker>
	)
}

const VehiclePin = memo(({ vehicle, position, selected, dim = false, onSelect }) => {
	const { theme, scheme } = useTheme()

	return (
	<SettledMarker
		coordinate={position}
		onPress={() => onSelect?.(vehicle)}
		anchor={{ x: 0.5, y: 0.5 }}
		// Above the destination pin (60): when a vehicle arrives, the live
		// thing wins the pixels. The commuter's own dot (100) tops both.
		zIndex={selected ? 80 : 70}
		redrawKey={`${vehicle.vehicle_type}|${vehicle.stale}|${selected}|${dim}|${scheme}`}
		accessibilityLabel={`${vehicle.destination}, ${vehicle.plate_number}`}
	>
		<View
			style={[
				elevation.float,
				// `dim` is the commuter's own choice from the layer menu, made
				// because thirty badges were sitting on top of the town names
				// they were trying to read. It is the whole badge that fades —
				// border, glyph and shadow together — so a dimmed pin still
				// reads as a solid object further back, not as a smudge.
				dim && { opacity: 0.45 },
				{
					borderColor: vehicle.stale ? theme.border.strong : theme.route[1],
					borderStyle: vehicle.stale ? 'dashed' : 'solid',
					// Sunken, not see-through. Opacity let the map and the route
					// line show straight through a stale pin, which read as a
					// smudge rather than as "last known position" — the dashed
					// border and muted glyph already carry that meaning, and
					// they only work if the badge behind them stays solid.
					backgroundColor: selected
						? theme.brand.default
						: vehicle.stale
							? theme.surface.sunken
							: theme.surface.default
				}
			]}
			className="h-11 w-11 items-center justify-center rounded-md border-2"
		>
			<VehicleGlyph
				type={vehicle.vehicle_type}
				width={24}
				color={vehicle.stale ? theme.icon.muted : theme.icon.primary}
			/>
		</View>
	</SettledMarker>
	)
}, (prev, next) =>
	// The fleet re-renders every 8 s poll with fresh object identities; only
	// these fields change any pixel or behaviour of a pin.
	prev.selected === next.selected &&
	prev.dim === next.dim &&
	prev.onSelect === next.onSelect &&
	prev.vehicle.stale === next.vehicle.stale &&
	prev.vehicle.vehicle_type === next.vehicle.vehicle_type &&
	// destination/plate reach the accessibilityLabel, not the pixels — but a
	// screen reader must not keep announcing last trip's destination.
	prev.vehicle.destination === next.vehicle.destination &&
	prev.vehicle.plate_number === next.vehicle.plate_number &&
	prev.position?.latitude === next.position?.latitude &&
	prev.position?.longitude === next.position?.longitude
)

/**
 * The driver's OWN vehicle: the same badge as the fleet pins but in
 * location-blue, so their map reads "that's me" — a vehicle, not a dot.
 */
const SelfVehiclePin = ({ vehicle, position }) => (
	<SettledMarker
		coordinate={position}
		anchor={{ x: 0.5, y: 0.5 }}
		redrawKey={vehicle.vehicle_type}
		zIndex={95}
	>
		<View
			style={[elevation.float, { borderColor: '#FFFFFF', backgroundColor: '#1A73E8' }]}
			className="h-11 w-11 items-center justify-center rounded-md border-2"
		>
			<VehicleGlyph type={vehicle.vehicle_type} width={24} color="#FFFFFF" />
		</View>
	</SettledMarker>
)

/**
 * Pin for where a trip (or a search) is headed — "Papuntang Tarlac City" on a
 * card should be findable on the map, not just a word. Icon-only on purpose:
 * Android shears any marker view wider than ~50dp on this stack (label chips
 * came out half-drawn on device), and the name is already on the basemap,
 * the sheet header, and the detail row. The white under-icon keeps the pin
 * legible over dark roads; the tip marks the exact spot.
 */
const DestinationPin = ({ pin }) => {
	const { theme, scheme } = useTheme()

	return (
		<SettledMarker
			coordinate={pin}
			anchor={{ x: 0.5, y: 1 }}
			redrawKey={scheme}
			zIndex={60}
			accessibilityLabel={pin.label}
		>
			<View collapsable={false} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
				<MaterialIcons name="place" size={52} color={theme.surface.default} style={{ position: 'absolute' }} />
				<MaterialIcons name="place" size={42} color={theme.route[1]} style={{ position: 'absolute', top: 4 }} />
			</View>
		</SettledMarker>
	)
}

/**
 * A commuter who agreed to show THIS driver where they are waiting, on THIS
 * trip. The only position in the whole app that a commuter ever hands over, and
 * it is dropped the moment the trip ends.
 *
 * Neither the amber of a vehicle pin nor the capacity green: a person waiting is
 * a person, not a status. Filled means they are standing on the road still
 * ahead — someone this driver can stop for without leaving their corridor. That
 * is a fact about the route, not about who happens to be closest right now, so
 * a pin does not change colour as the vehicle drives towards it.
 *
 * 30dp, comfortably under the ~60dp a custom marker view can be rasterised into
 * on this stack (see PlacePin) — never the pin that comes back ragged.
 */
const WaitingPin = memo(({ pin }) => {
	const { theme, scheme } = useTheme()

	return (
		<SettledMarker
			coordinate={pin}
			anchor={{ x: 0.5, y: 0.5 }}
			// Over the place layer and the destination, under the fleet: a person
			// standing on a corner outranks the corner, and the moving vehicle
			// outranks both.
			zIndex={65}
			redrawKey={`${pin.onRoute}|${scheme}`}
		>
			<View
				style={[
					elevation.float,
					{
						backgroundColor: pin.onRoute ? theme.text.primary : theme.surface.default,
						// The filled pin keeps the ring in its own colour so both
						// tiers are the same 30dp circle and neither shifts.
						borderColor: pin.onRoute ? theme.text.primary : theme.border.subtle
					}
				]}
				className="h-[30px] w-[30px] items-center justify-center rounded-full border-[1.5px]"
			>
				<MaterialIcons
					name="person"
					size={18}
					color={pin.onRoute ? theme.surface.default : theme.icon.primary}
				/>
			</View>
		</SettledMarker>
	)
}, (prev, next) =>
	prev.pin.onRoute === next.pin.onRoute &&
	prev.pin.latitude === next.pin.latitude &&
	prev.pin.longitude === next.pin.longitude)

/**
 * Biyahero's own place layer.
 *
 * The Google Maps Android SDK only applies a custom style to the plain map
 * type. On satellite and terrain it draws its own labels and far fewer of
 * them, so the three layers disagreed about what exists — a church on
 * satellite, a public market on standard, neither on the other. Drawing the
 * places ourselves is the only way all three can show the same thing.
 */
const PLACE_ICONS = {
	terminal: 'directions-bus',
	worship: 'church',
	school: 'school',
	hospital: 'local-hospital',
	market: 'storefront',
	mall: 'local-mall',
	culture: 'theaters',
	government: 'account-balance',
	store: 'shopping-bag',
	park: 'park',
	fuel: 'local-gas-station',
	pharmacy: 'local-pharmacy',
	bank: 'savings',
	hotel: 'hotel',
	food: 'restaurant'
}

/**
 * Zoomed out past about a town's width the pins pile on top of each other —
 * Google hides its own POIs at these zooms for the same reason. Closer in,
 * more of them: detail arrives as you zoom, which is the behaviour people
 * already expect from a map.
 */
const PLACE_MAX_DELTA = 0.11
const PLACE_NEAR_DELTA = 0.05

/**
 * Two tiers, which is how every real map fits a town onto a phone: the places
 * worth naming get a name, everything else gets a dot until you zoom in. A
 * named pin is 52dp of screen and cannot crowd; a dot is 22dp and can sit
 * close to its neighbours, so most of the density lives in the dot tier.
 */
const PLACE_LABEL_CAP_FAR = 9
const PLACE_LABEL_CAP_NEAR = 16
const PLACE_DOT_CAP_FAR = 20
const PLACE_DOT_CAP_NEAR = 34

/**
 * How much of the viewport one pin claims, so two of them cannot print over
 * each other. Google runs a label collision engine; this is the cheap version
 * of the same idea, and it is why a dense poblacion reads as legible places
 * instead of a pile of overlapping text.
 */
const PLACE_CLEAR_X = 0.13
const PLACE_CLEAR_Y = 0.085
const PLACE_DOT_CLEAR_X = 0.042
const PLACE_DOT_CLEAR_Y = 0.030

/** Panning settles before we ask — a drag must not fire a request per frame. */
const PLACE_DEBOUNCE_MS = 600

/** Fetch wider than the screen so a short pan is already answered. */
const PLACE_PAD = 0.5

/**
 * Draw a little past the edge as well. A pin that pops in and out as it
 * crosses the boundary is a native marker created and destroyed each time,
 * and that churn shows up as dropped frames while panning.
 */
const PLACE_OVERDRAW = 1.25

/**
 * How many places to keep from earlier viewports. Holding them means a pan
 * that crosses into new ground ADDS markers instead of replacing every one;
 * the bound stops a long session growing without limit.
 */
const PLACE_MEMORY = 250

/** A region as map corners, optionally grown past what is on screen. */
const boxFor = (region, pad = 0) => {
	const lat = (region.latitudeDelta / 2) * (1 + pad * 2)
	const lng = (region.longitudeDelta / 2) * (1 + pad * 2)

	return {
		south: region.latitude - lat,
		north: region.latitude + lat,
		west: region.longitude - lng,
		east: region.longitude + lng
	}
}

/** Whether what we already fetched still covers the whole view. */
const boxCovers = (outer, inner) =>
	!!outer &&
	outer.south <= inner.south &&
	outer.north >= inner.north &&
	outer.west <= inner.west &&
	outer.east >= inner.east

/**
 * Short window: these are a glyph in a circle, and the icon font is held at
 * launch (see _layout), so there is no font race left to wait out. Pins mount
 * only after the camera has settled and the fetch has returned, so the very
 * first capture already happens on a still map.
 */
const PLACE_SETTLE_MS = 150

/**
 * One place from Biyahero's own layer.
 *
 * Named at 52dp square, or a bare 20dp dot. 52dp is what this stack can
 * actually draw: a custom marker view is rasterised into a bitmap that will
 * not grow past roughly 60dp — a bare 200x36 test box came back a ragged
 * 100x100 blob, which is why the old label chips were half-drawn. So the name
 * is set in 8pt over two lines and truncated, and Android's own info window
 * carries it in full on tap for both tiers; that one is drawn by the OS and is
 * not subject to the cap.
 *
 * Under the fleet on purpose. These are the ground the jeepneys move over.
 */
const PlacePin = memo(({ place, labelled, mapType }) => {
	const { theme, scheme } = useTheme()
	const terminal = place.kind === 'terminal'
	const tint = theme.place[place.kind] ?? theme.icon.secondary
	// Dark ink on a pale grid, white on aerial photography — the same swap
	// Google makes, because neither reads on the other's background.
	const onImagery = mapType === 'hybrid'

	// No elevation: an Android shadow is a separate render pass per marker,
	// and with dozens on screen that was most of the cost. A hairline border
	// separates the badge from the map for a fraction of the work.
	const badge = (
		<View
			style={{
				width: labelled ? 26 : 20,
				height: labelled ? 26 : 20,
				borderRadius: labelled ? 13 : 10,
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: theme.surface.default,
				// A terminal wears a full ring in its own colour: it is the one
				// kind of place this whole app is about.
				borderColor: terminal ? tint : theme.border.subtle,
				borderWidth: terminal ? 2 : 1
			}}
		>
			<MaterialIcons name={PLACE_ICONS[place.kind] ?? 'place'} size={labelled ? 15 : 12} color={tint} />
		</View>
	)

	return (
		<SettledMarker
			coordinate={place.position}
			anchor={{ x: 0.5, y: 0.5 }}
			zIndex={terminal ? 50 : labelled ? 40 : 35}
			redrawKey={`${scheme}|${mapType}|${labelled}`}
			settleMs={PLACE_SETTLE_MS}
			// Android draws this itself, so the name is safe from the bitmap
			// cap — and it is the only way a dot says what it is.
			title={place.name}
			accessibilityLabel={place.name}
		>
			{labelled ? (
				<View collapsable={false} style={{ width: 52, height: 52, alignItems: 'center' }}>
					{badge}
					<Txt
						numberOfLines={2}
						style={{
							width: 52,
							marginTop: 1,
							textAlign: 'center',
							fontSize: 8,
							lineHeight: 9,
							color: onImagery ? '#FFFFFF' : theme.text.primary,
							textShadowColor: onImagery ? 'rgba(0,0,0,0.9)' : theme.surface.default,
							textShadowRadius: 3
						}}
					>
						{place.name}
					</Txt>
				</View>
			) : (
				<View collapsable={false} style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
					{badge}
				</View>
			)}
		</SettledMarker>
	)
}, (prev, next) =>
	prev.place.id === next.place.id &&
	prev.labelled === next.labelled &&
	prev.mapType === next.mapType)

const LAYER_ICONS = { standard: 'map', hybrid: 'satellite-alt', terrain: 'terrain' }

/**
 * How the fleet is drawn, in the order offered. Mirrors PIN_MODES in prefs.js,
 * which is what validates a saved value; this is only the menu.
 */
const PIN_ICONS = { normal: 'directions-bus', dim: 'opacity', hide: 'visibility-off' }

/**
 * Google-style layer switcher. Satellite is the reason it exists: a commuter
 * who cannot place a street name can almost always recognise the roof of the
 * terminal they are standing next to.
 *
 * Unpositioned on purpose — it sits in the Map's control column so it lines up
 * with whatever else a screen stacks there.
 */
/** One row of the layer sheet: a label over three equal chips. */
const LayerRow = ({ label, options, icons, names, value, onChange }) => {
	const { theme } = useTheme()

	return (
		<View className="gap-2">
			<Txt variant="labelS" className="text-fg-secondary">{label}</Txt>
			<View className="flex-row gap-2">
				{options.map(option => {
					const active = option === value

					return (
						<Pressable
							key={option}
							onPress={() => onChange(option)}
							accessibilityRole="radio"
							accessibilityState={{ selected: active }}
							accessibilityLabel={names[option]}
							className={`flex-1 items-center gap-2 rounded-lg border-[1.5px] px-2 py-3 active:opacity-80 ${
								active ? 'border-brand bg-brand-subtle' : 'border-line-subtle bg-surface'
							}`}
						>
							<MaterialIcons name={icons[option]} size={22} color={active ? theme.brand.hover : theme.icon.secondary} />
							<Txt variant="labelL" numberOfLines={1} className={active ? 'text-brand-hover' : 'text-fg-secondary'}>
								{names[option]}
							</Txt>
						</Pressable>
					)
				})}
			</View>
		</View>
	)
}

/**
 * The layer button, and the sheet it opens. A sheet in a Modal rather than a
 * popover beside the button: the popover grew upwards from wherever the
 * control column sat, and on the driver's trip screen — column high on a
 * short map — it ran off the top of the screen, the map-type rows unreachable
 * above the status bar and the rest sitting on the LIVE banner. A Modal sits
 * above every sheet and every banner whatever the screen, and closes on the
 * scrim, on Back, and on a choice.
 */
const LayerPicker = () => {
	const copy = useCopy()
	const { theme } = useTheme()
	const insets = useSafeAreaInsets()
	const mapType = usePrefs(s => s.mapType)
	const setMapType = usePrefs(s => s.setMapType)
	const pinMode = usePrefs(s => s.pinMode)
	const setPinMode = usePrefs(s => s.setPinMode)
	const [open, setOpen] = useState(false)

	return (
		<>
			<Pressable
				onPress={() => setOpen(true)}
				accessibilityRole="button"
				accessibilityLabel={copy.mapHome.layers}
				style={elevation.float}
				className="h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-line-subtle bg-surface active:opacity-80"
			>
				<MaterialIcons name="layers" size={24} color={open ? theme.brand.hover : theme.icon.secondary} />
			</Pressable>

			<Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
				<Pressable
					onPress={() => setOpen(false)}
					accessibilityRole="button"
					accessibilityLabel={copy.common.close}
					style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.4)' }}
				>
					{/* A Pressable of its own, so a tap inside the card is not a tap
					    on the scrim behind it. */}
					<Pressable
						onPress={() => {}}
						style={[elevation.sheet, { paddingBottom: insets.bottom + 16 }]}
						className="gap-5 rounded-t-2xl bg-surface px-6 pt-3"
					>
						<View className="items-center pb-1">
							<View className="h-[5px] w-10 rounded-[3px] bg-line" />
						</View>
						<LayerRow
							label={copy.mapHome.layers}
							options={MAP_TYPES}
							icons={LAYER_ICONS}
							names={copy.mapHome.layerNames}
							value={mapType}
							onChange={type => {
								setMapType(type)
								setOpen(false)
							}}
						/>
						{/* The fleet, as a layer of its own. Thirty badges at province
						    zoom sat on top of "Tarlac", "Angeles" and "Manila", and
						    at street zoom on the landmark a commuter was steering by.
						    Dimming lets the map read through them; hiding leaves the
						    list in the sheet as the fleet's only presence. */}
						<LayerRow
							label={copy.mapHome.pins}
							options={Object.keys(PIN_ICONS)}
							icons={PIN_ICONS}
							names={copy.mapHome.pinModes}
							value={pinMode}
							onChange={mode => {
								setPinMode(mode)
								setOpen(false)
							}}
						/>
					</Pressable>
				</Pressable>
			</Modal>
		</>
	)
}

/**
 * Map Canvas. Desaturated on purpose: the map is the ground, vehicles are the
 * figure. Nothing here reads or displays the commuter's own position — there is
 * no myLocation button and no permission request. waitingPins is the single
 * consented exception: positions commuters chose to show ONE driver for ONE
 * trip, handed in as a prop and never sensed here.
 */
export const Map = ({
	vehicles = [],
	selectedId,
	onSelect,
	onMapPress,
	// The user dragged the map. A screen that is following a vehicle turns
	// that off here — a camera fighting a finger is worse than either alone.
	onUserPan = null,
	// The FULL corridor. Map trims it at the vehicle itself, because the line
	// is consumed at a position that only exists here — see useGlide.
	route,
	// Where the corridor is cut short. Kept separate from destinationPin: the
	// commuter screens pin a searched place they are not routed to.
	routeTarget = null,
	// Whose travel erases the line: a vehicle id, or 'self' for the driver's
	// own. Omitted, the route draws whole.
	routeAnchor,
	destinationPin,
	selfVehicle,
	// Only ever non-empty on the driver's own active-trip screen, and only for
	// the commuters who opted in to that trip.
	waitingPins = [],
	fitTo,
	fitKey,
	myLocation,
	locateNonce = 0,
	// Recentre on something that is not the viewer — the vehicle a commuter is
	// watching. Separate from locateNonce, which always means "where am I".
	// Follow mode. While ON the camera stays on the vehicle as it moves; while
	// OFF the commuter pans freely. A one-shot recentre was the earlier shape,
	// but a jeepney that is moving walks straight back out of frame.
	follow = false,
	// 'region': north-up, fixed span, the vehicle biased above the sheet.
	// 'navigation': heading-up and tilted, the road ahead at the top of the
	// screen and the vehicle low in it — a driver's view, not a commuter's.
	followMode = 'region',
	// Which glide leg to track — 'v:<id>'. Following the INTERPOLATED position
	// rather than the raw fix is what makes it read as a camera on a moving
	// vehicle instead of a jump every eight seconds.
	followKey = null,
	// Raw fix, used until a glide leg exists for followKey.
	centerOn = null,
	// How far ABOVE the map's true centre to place the followed vehicle, as a
	// fraction of the latitude span. The sheet covers the lower part of this
	// map, so a plain centre would park the jeepney behind it.
	centerBias = 0.32,
	rememberRegion = false,
	// Extra round controls (a crosshair, say) stacked under the layer button in
	// the same column, so every screen's controls share one right edge.
	controls,
	// Clears the tallest sheet on any screen using this map.
	controlsBottom = 420,
	// How much of the map's bottom edge is reserved, in dp. This is mapPadding:
	// it moves BOTH Google's logo and the camera's idea of centre, which is why
	// it is kept as small as the sheet's collapsed height on screens whose sheet
	// can be pulled down — the logo then sits at the bottom of the map, never
	// stranded halfway up it.
	bottomInset = 0,
	// Extra room the FIT alone needs, in dp: the rest of the sheet, which the
	// camera must frame above but which the logo should not be pushed up by.
	// Android adds this to mapPadding, so the two compose.
	fitBottomExtra = 0
}) => {
	const { theme, scheme } = useTheme()
	const { width: screenW, height: screenH } = useWindowDimensions()
	const mapType = usePrefs(s => s.mapType)
	// How loudly the fleet is drawn: full, dimmed so labels read through, or
	// hidden so the map is only ground. The selected vehicle is always shown.
	const pinMode = usePrefs(s => s.pinMode)
	const mapRef = useRef(null)
	const [initialRegion, setInitialRegion] = useState(rememberRegion ? null : DEFAULT_REGION)
	// Android silently drops camera commands issued before onMapReady. fitTo is
	// memoised per trip upstream, so a dropped first call would never retry —
	// gate on readiness and the effect re-fires the moment the map can obey.
	const [mapReady, setMapReady] = useState(false)
	// Everything on the map that moves, under one clock.
	const glidePoints = useMemo(
		() => [
			...vehicles.filter(v => v.position).map(v => ({ key: `v:${v.id}`, position: v.position })),
			...(selfVehicle?.position ? [{ key: 'self', position: selfVehicle.position }] : []),
			...(myLocation ? [{ key: 'me', position: myLocation }] : [])
		],
		[vehicles, selfVehicle?.position, myLocation]
	)

	const legs = useGlide(glidePoints)

	const anchorKey = routeAnchor === 'self' ? 'self' : routeAnchor != null ? `v:${routeAnchor}` : null
	// The last real fix. Which way round the corridor runs is a fact about where
	// the vehicle IS, so it is decided here and not from the interpolated point
	// — and it only changes when a ping lands.
	const rawAnchor = anchorKey
		? (routeAnchor === 'self' ? selfVehicle?.position : vehicles.find(v => v.id === routeAnchor)?.position) ?? null
		: null

	// Read once per render so the pin and the line cannot disagree by a frame.
	const anchorPosition = anchorKey ? at(legs, anchorKey, rawAnchor) : null

	// Orientation and the cut at the destination move once per ping, so they are
	// paid then. Deciding orientation without the position is not a cheaper
	// version of this: a corridor is driven both ways and most destinations sit
	// in the middle of one, so the line would reverse onto the half the vehicle
	// is not on and draw a chord straight across the city.
	const orientedRoute = useMemo(
		() => (route?.length ? orientRoute(rawAnchor, route, routeTarget) : []),
		[route, routeTarget, rawAnchor?.latitude, rawAnchor?.longitude]
	)

	// The road still ahead, re-cut once per ping. Kept whole and memoised so a
	// corridor of several hundred points is handed to the map once rather than
	// re-uploaded on every frame of the glide.
	const routeTail = useMemo(() => {
		if (orientedRoute.length < 2 || !rawAnchor) return orientedRoute

		return remainingRoute(rawAnchor, orientedRoute, null).slice(1)
	}, [orientedRoute, rawAnchor?.latitude, rawAnchor?.longitude])

	// The only part that moves: the stretch between the gliding pin and the road
	// in front of it. Two points, rebuilt per frame, so the vehicle visibly eats
	// the line as it travels.
	const routeLeader = useMemo(
		() => (routeTail.length && anchorPosition ? [anchorPosition, routeTail[0]] : []),
		[routeTail, anchorPosition?.latitude, anchorPosition?.longitude]
	)

	// The settled viewport, which is what the place layer is drawn for. It is
	// where the map is POINTED — chosen by dragging — never where the user is.
	const [viewport, setViewport] = useState(null)
	const [places, setPlaces] = useState([])
	const fetchedBox = useRef(null)

	useEffect(() => {
		if (!rememberRegion) return

		AsyncStorage.getItem(REGION_KEY)
			.then(saved => setInitialRegion(saved ? JSON.parse(saved) : DEFAULT_REGION))
			.catch(() => setInitialRegion(DEFAULT_REGION))
	}, [rememberRegion])

	// Biyahero's own place layer: fetched for a box wider than the screen, so a
	// short pan is already answered, and only once the map has stopped moving.
	useEffect(() => {
		const view = viewport ?? initialRegion
		if (!view) return

		if (view.latitudeDelta > PLACE_MAX_DELTA) {
			// Zoomed out past the point where labels are readable. Drop the box
			// too, so coming back down re-fetches instead of drawing a stale set.
			fetchedBox.current = null
			setPlaces([])

			return
		}

		if (boxCovers(fetchedBox.current, boxFor(view))) return

		const timer = setTimeout(() => {
			const box = boxFor(view, PLACE_PAD)

			fetchNearbyPlaces(box)
				.then(rows => {
					fetchedBox.current = box
					// Merge rather than replace: replacing unmounted every
					// marker on screen and rebuilt it, which was the single
					// biggest source of stutter while panning.
					setPlaces(prev => {
						// Not `new Map` — the component in this file is called
						// Map and shadows the global.
						const fresh = new Set(rows.map(p => p.id))
						const all = [...prev.filter(p => !fresh.has(p.id)), ...rows]

						return all.length > PLACE_MEMORY ? all.slice(all.length - PLACE_MEMORY) : all
					})
				})
				// A map without shop pins is a smaller loss than a red box.
				.catch(() => {})
		}, PLACE_DEBOUNCE_MS)

		return () => clearTimeout(timer)
	}, [viewport, initialRegion])

	// Trim the fetched box to what is actually on screen, then to what a phone
	// can draw. The server already ordered them by how much a commuter needs
	// them, so slicing keeps terminals and landmarks and drops the bakeries.
	const view = viewport ?? initialRegion

	// Which places get named depends on the camera, but it must not depend on
	// every twitch of it: a 20 m nudge otherwise reshuffles the tiers, and
	// every marker that changes tier is unmounted and rasterised again. That
	// churn was most of the lag. Quantising to a fifth of the screen means a
	// real pan re-tiers and a settle-in-place does not.
	const layoutKey = view
		? [
			Math.round(view.latitude / (view.latitudeDelta / 5)),
			Math.round(view.longitude / (view.longitudeDelta / 5)),
			view.latitudeDelta.toFixed(3)
		].join('|')
		: 'none'

	const visiblePlaces = useMemo(() => {
		if (!view || view.latitudeDelta > PLACE_MAX_DELTA) return []

		const latPad = (view.latitudeDelta / 2) * PLACE_OVERDRAW
		const lngPad = (view.longitudeDelta / 2) * PLACE_OVERDRAW

		// Merged sets arrive in whatever order they were fetched, so the
		// server's ranking is restored here: what a commuter needs most, then
		// what is nearest the middle of the view.
		const onScreen = places
			.filter(p =>
				Math.abs(p.position.latitude - view.latitude) <= latPad &&
				Math.abs(p.position.longitude - view.longitude) <= lngPad)
			.sort((a, b) =>
				(a.rank - b.rank) ||
				((a.position.latitude - view.latitude) ** 2 + (a.position.longitude - view.longitude) ** 2) -
				((b.position.latitude - view.latitude) ** 2 + (b.position.longitude - view.longitude) ** 2))

		const near = view.latitudeDelta <= PLACE_NEAR_DELTA
		const labelCap = near ? PLACE_LABEL_CAP_NEAR : PLACE_LABEL_CAP_FAR
		const dotCap = near ? PLACE_DOT_CAP_NEAR : PLACE_DOT_CAP_FAR

		// Greedy, in the server's order: the first place to claim a patch of
		// screen keeps it. That order is "most useful first", so a terminal
		// wins its corner and the sari-sari store beside it steps aside — to
		// the dot tier rather than off the map.
		const free = (kept, p, clearX, clearY) =>
			!kept.some(k =>
				Math.abs(k.place.position.longitude - p.position.longitude) / view.longitudeDelta < clearX &&
				Math.abs(k.place.position.latitude - p.position.latitude) / view.latitudeDelta < clearY)

		const kept = []

		for (const place of onScreen) {
			if (kept.length >= labelCap) break
			if (free(kept, place, PLACE_CLEAR_X, PLACE_CLEAR_Y)) kept.push({ place, labelled: true })
		}

		const named = new Set(kept.map(k => k.place.id))

		for (const place of onScreen) {
			if (kept.length >= labelCap + dotCap) break
			if (named.has(place.id)) continue
			if (free(kept, place, PLACE_DOT_CLEAR_X, PLACE_DOT_CLEAR_Y)) kept.push({ place, labelled: false })
		}

		return kept
		// `view` is deliberately not a dependency: layoutKey is its quantised
		// form, and re-running on the raw camera is exactly the churn above.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [places, layoutKey])

	// Crosshair tap: bring the viewer's own position into view. For a commuter
	// that is the opt-in dot; for a driver it is their vehicle, which is
	// already on the map — so the driver screen needs no second marker to
	// recentre on.
	useEffect(() => {
		const here = myLocation ?? selfVehicle?.position

		if (locateNonce > 0 && here && mapRef.current) {
			mapRef.current.animateCamera({ center: here, zoom: 15 }, { duration: 600 })
		}
	}, [locateNonce])

	// Recentre on the followed vehicle. It glides continuously, so the camera
	// is aimed at wherever it is at the moment of the tap rather than at a
	// remembered position — otherwise the button lands the map where the
	// jeepney used to be.
	// Keep the latest raw fix reachable from inside the interval without making
	// the interval depend on it — re-arming a follow timer every poll would stutter.
	const centerOnRef = useRef(centerOn)
	centerOnRef.current = centerOn

	useEffect(() => {
		if (!follow) return

		// The zoom is held while following. "Focus on the vehicle" means the camera
		// is committed to it; a commuter who wants to look around turns follow off,
		// which is the whole point of it being a toggle.
		const span = 0.012
		// Screens that let mapPadding carry the whole sheet pass centerBias={0};
		// screens that pad only for the logo keep a bias, because the rest of the
		// sheet is still covering the bottom of the map.
		const bias = centerBias

		// Navigation keeps the last good heading: a vehicle waiting at a light
		// produces fixes a metre apart whose bearing is noise, and swinging the
		// whole map round on that is the one thing this view must never do.
		let heading = null

		const track = () => {
			const here = at(legs, followKey, centerOnRef.current)
			if (!here || !mapRef.current) return

			if (followMode === 'navigation') {
				const leg = legs[followKey]
				const moved = leg ? distanceM(leg.from, leg.to) : null
				if (moved !== null && moved >= NAV_HEADING_MIN_M) heading = bearing(leg.from, leg.to)

				// Aimed AHEAD of the vehicle, not at it: with the camera centred on
				// the vehicle it sits mid-screen and the sheet covers the road in
				// front of it. Leading along the heading puts the vehicle low and
				// the next few hundred metres on top — Google's framing.
				mapRef.current.animateCamera(
					{
						center: heading == null ? here : offsetM(here, heading, NAV_LEAD_M),
						heading: heading ?? 0,
						pitch: NAV_PITCH,
						zoom: NAV_ZOOM
					},
					{ duration: FOLLOW_STEP_MS }
				)
				return
			}

			// The longitude span must match the map's aspect ratio. Equal deltas on a
			// tall screen make Google widen the latitude span to fit, which dilutes the
			// bias below and parks the vehicle under the sheet.
			mapRef.current.animateToRegion(
				{
					latitude: here.latitude - span * bias,
					longitude: here.longitude,
					latitudeDelta: span,
					longitudeDelta: span * (screenW / screenH)
				},
				FOLLOW_STEP_MS
			)
		}

		track()
		const timer = setInterval(track, FOLLOW_STEP_MS)

		return () => {
			clearInterval(timer)
			// Leaving navigation puts the camera back flat and north-up. The
			// region view and a freed map cannot express a tilt, and a map left
			// leaning at 50° reads as broken rather than as a choice.
			if (followMode === 'navigation') mapRef.current?.animateCamera({ heading: 0, pitch: 0 }, { duration: 300 })
		}
	}, [follow, followKey, followMode, centerBias, bottomInset])

	// Frame the matches ONCE per fitKey — a new search, a new route. The
	// points array is rebuilt on every 8 s poll, and re-fitting on that would
	// yank the camera back the moment anyone pans or zooms.
	const lastFitKey = useRef(null)
	useEffect(() => {
		// A following camera is already committed. Framing the whole route
		// underneath it zoomed the driver out to the entire corridor for one
		// frame before the follow snapped them back in. But only once it HAS
		// something to follow: before the first GPS fix the follow has no
		// position, and skipping the fit then left the driver on an unframed
		// map with the route somewhere off screen.
		//
		// The key is recorded even when the fit yields, because the follow IS
		// the framing for this key. Without that, the moment the driver panned
		// — which turns follow off — this effect re-ran, saw a key it had never
		// fitted, and yanked the camera out to the whole route right under
		// their finger.
		if (follow && at(legs, followKey, centerOnRef.current)) {
			lastFitKey.current = fitKey
			return
		}

		const points = fitTo?.filter(Boolean)

		// Nothing to frame — the search was cleared, or its matches have not
		// arrived yet. Release the key so returning to the SAME destination
		// frames again instead of being mistaken for the frame still showing.
		if (!points?.length) {
			lastFitKey.current = null
			return
		}

		if (!mapReady || !mapRef.current) return
		if (fitKey !== undefined && fitKey === lastFitKey.current) return

		lastFitKey.current = fitKey

		// One point, or points on top of each other, must not be "fitted".
		//
		// fitToCoordinates on a single coordinate zooms in as far as the tiles
		// go: a destination with no vehicles passing it landed the commuter on
		// a rooftop at maximum zoom — grey roof, no roads, no labels — which
		// read as the search having done nothing at all. A place is framed
		// the way a person would frame it: the neighbourhood around it.
		const lats = points.map(p => p.latitude)
		const lngs = points.map(p => p.longitude)
		const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs))

		if (points.length < 2 || span < MIN_FIT_SPAN_DEG) {
			const center = points[points.length - 1]
			mapRef.current.animateCamera({ center, zoom: PLACE_ZOOM }, { duration: 600 })
			return
		}

		mapRef.current.fitToCoordinates(points, {
			// Android ADDS this to the base map padding — MapView.java's
			// appendMapPadding does setPadding(edge + base) — and then resets to
			// base while the animation is still running. So with the sheet already
			// reserved as mapPadding, a 120/380 edge left a 224dp band to fit a
			// whole corridor into: opening a vehicle framed the route at province
			// scale with the jeepney a dot in the middle. Once bottomInset carries
			// the sheet, the edge is only breathing room, and symmetric — the
			// asymmetry it used to carry is what mapPadding now expresses.
			edgePadding: bottomInset > 0 || fitBottomExtra > 0
				? { top: 48, right: 48, bottom: 48 + fitBottomExtra, left: 48 }
				: { top: 120, right: 80, bottom: 380, left: 80 },
			animated: true
		})
	}, [fitTo, fitKey, mapReady, follow, fitBottomExtra])

	// Hold the map back until the saved region is known, otherwise it mounts on
	// the default and visibly jumps.
	if (!initialRegion) return <View className="flex-1 bg-map-base" />

	return (
		<View className="flex-1 bg-map-base">
			<MapView
				ref={mapRef}
				provider={PROVIDER_GOOGLE}
				style={{ flex: 1 }}
				initialRegion={initialRegion}
				mapPadding={{ top: 0, right: 0, bottom: bottomInset, left: 0 }}
				onMapReady={() => setMapReady(true)}
				// Tapping bare map clears whatever the user was following —
				// marker taps fire their own handler and never reach this.
				// POI labels are their own gesture on Android and would
				// otherwise swallow the tap, so they clear the focus too.
				onPress={onMapPress}
				onPoiClick={onMapPress}
				// isGesture, not onPanDrag: the follow control on the driver's trip
				// screen came up OFF from the first frame, before anyone touched
				// the map — a programmatic camera move was being read as a drag.
				// The region callback says who moved the camera; only a finger
				// counts.
				onRegionChange={(_region, details) => {
					if (details?.isGesture) onUserPan?.()
				}}
				onRegionChangeComplete={next => {
					setViewport(next)
					if (rememberRegion) AsyncStorage.setItem(REGION_KEY, JSON.stringify(next)).catch(() => {})
				}}
				mapType={mapType}
				// Styling only applies to the drawn map; imagery ignores it.
				customMapStyle={mapType === 'standard' ? MAP_STYLES[scheme] : []}
				showsUserLocation={false}
				showsMyLocationButton={false}
				showsBuildings={false}
				showsCompass={false}
				toolbarEnabled={false}
				rotateEnabled={false}
			>
				{routeTail.length > 1 && (
					<Polyline coordinates={routeTail} strokeColor={theme.route[1]} strokeWidth={5} />
				)}
				{routeLeader.length === 2 && (
					<Polyline coordinates={routeLeader} strokeColor={theme.route[1]} strokeWidth={5} />
				)}

				{/* No start dot: routes render navigation-style — the line begins
				    at the vehicle and is consumed as it travels. */}
				{/* Under everything else Biyahero draws: these are the ground the
				    fleet moves over, not the thing being tracked. */}
				{visiblePlaces.map(({ place, labelled }) => (
					<PlacePin key={place.id} place={place} labelled={labelled} mapType={mapType} />
				))}

				{!!destinationPin && <DestinationPin pin={destinationPin} />}

				{/* Keyed by slot, not by coordinate: the driver's poll hands back a
				    fresh array every few seconds and a coordinate key would unmount
				    and re-rasterise every waiting pin on each GPS jitter. */}
				{waitingPins.map((pin, i) => (
					<WaitingPin key={i} pin={pin} />
				))}

				{/* The selected vehicle is exempt from dimming and hiding: it is
				    the one thing on the map the commuter has asked about. */}
				{vehicles
					.filter(v => v.position && (pinMode !== 'hide' || v.id === selectedId))
					.map(v => (
						<VehiclePin
							key={v.id}
							vehicle={v}
							position={at(legs, `v:${v.id}`, v.position)}
							selected={v.id === selectedId}
							dim={pinMode === 'dim' && v.id !== selectedId}
							onSelect={onSelect}
						/>
					))}

				{!!selfVehicle?.position && (
					<SelfVehiclePin vehicle={selfVehicle} position={at(legs, 'self', selfVehicle.position)} />
				)}

				{!!myLocation && (
					<SettledMarker
						coordinate={at(legs, 'me', myLocation)}
						anchor={{ x: 0.5, y: 0.5 }}
						redrawKey="static"
						zIndex={100}
					>
						{/* The conventional blue dot: halo, white ring, solid core. */}
						<View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(26,115,232,0.18)' }}>
							<View
								className="h-[18px] w-[18px] rounded-full border-[3px]"
								style={{ backgroundColor: '#1A73E8', borderColor: '#FFFFFF' }}
							/>
						</View>
					</SettledMarker>
				)}
			</MapView>

			{/* One column owns every floating control: two absolutely positioned
			    siblings drift apart the moment their paddings differ. */}
			<View style={{ position: 'absolute', right: 24, bottom: controlsBottom }} className="items-end gap-3">
				<LayerPicker />
				{controls}
			</View>
		</View>
	)
}
