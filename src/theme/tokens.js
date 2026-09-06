/**
 * Biyahero — design tokens.
 * Mirrors the `Color` and `Scale` variable collections in the Figma file
 * "Biyahero — Design System & Screens". Verified against get_variable_defs.
 *
 * Day is the shipping theme: dark UI is less legible in direct noon sunlight,
 * which is exactly when people commute. `night` is defined so the palette stays
 * complete, but only `day` is wired into tailwind.config.js.
 */

export const primitives = {
	ink: {
		950: '#070C15', 900: '#0B1220', 850: '#101827', 800: '#141C2E',
		700: '#1E293B', 600: '#263449', 500: '#3A4A63', 400: '#64748B',
		300: '#94A3B8', 200: '#CBD5E1', 100: '#E2E8F0', 50: '#F1F5F9', 0: '#FFFFFF'
	},
	/**
	 * A ramp for dark surfaces.
	 *
	 * `ink` is tuned for light UI and is far too compressed at its dark end:
	 * 900, 850, 800 and 700 all sit within 1.3:1 of each other, so on night the
	 * page, a card and a text input were the same colour to the eye — measured,
	 * an input's fill was 1.10:1 against the screen behind it — and a border
	 * drawn from ink 600 came out at 1.35:1, which is invisible. Fields had no
	 * edges and no fill, so nothing said where to tap.
	 *
	 * These steps are spaced so each level reads as a level, and the light end
	 * clears 4.5:1 for text and 3:1 for borders on every one of them.
	 */
	slate: {
		950: '#070C15', 900: '#0B1220', 850: '#151E2F', 800: '#1C2637',
		700: '#26334A', 600: '#3A4763', 500: '#4E5D78', 400: '#6B7B96',
		300: '#8C9BB2', 200: '#AFBCCE'
	},
	/** Signal Yellow — the language of PH jeepney route boards and transit signage. */
	signal: { 700: '#B88A00', 600: '#E0A800', 500: '#FFC72C', 400: '#FFD75E', 300: '#FFE494', 100: '#FFF6DC' },
	green: { 900: '#052E16', 600: '#15803D', 500: '#22C55E', 400: '#4ADE80', 100: '#DCFCE7' },
	amber: { 900: '#451A03', 600: '#D97706', 500: '#F59E0B', 400: '#FBBF24', 100: '#FEF3C7' },
	red: { 900: '#450A0A', 600: '#DC2626', 500: '#EF4444', 400: '#F87171', 100: '#FEE2E2' },
	route: { 1: '#38BDF8', 2: '#A78BFA', 3: '#FB7185', 4: '#84CC16', 5: '#FB923C', 6: '#F472B6' },
	water: { night: '#0A2033', day: '#DCEAF7' },
	park: { night: '#0F2A1C', day: '#DCF0E1' }
}

const p = primitives

/**
 * Place-pin colours, by category, following Google Maps' own convention: food
 * orange, health red, outdoors green, arts purple, lodging pink, civic and
 * religious grey, and blue for the broad run of shops, services, schools and
 * transit.
 *
 * A map of identical grey pins makes the reader tap each one to learn what it
 * is. Colour answers that before the tap, which is the entire reason Google
 * paints a restaurant orange and a hospital red.
 *
 * Two ramps, because the badge behind the glyph is white by day and near-black
 * at night: the day set goes muddy on dark, the night set washes out on white.
 */
export const day = {
	surface: { canvas: p.ink[50], default: p.ink[0], raised: p.ink[0], sunken: p.ink[100], inverse: p.ink[900], scrim: p.ink[900] },
	text: { primary: p.ink[900], secondary: p.ink[500], inverse: p.ink[0], onBrand: p.ink[950], danger: p.red[600], success: p.green[600] },
	brand: { default: p.signal[500], hover: p.signal[600], subtle: p.signal[100] },
	border: { subtle: p.ink[100], default: p.ink[200], strong: p.ink[400], focus: p.signal[600] },
	icon: { primary: p.ink[900], secondary: p.ink[500], muted: p.ink[400] },
	capacity: {
		open: { fg: p.green[600], bg: p.green[100] },
		filling: { fg: p.amber[600], bg: p.amber[100] },
		full: { fg: p.red[600], bg: p.red[100] },
		stale: { fg: p.ink[500], bg: p.ink[100] }
	},
	action: { dangerBg: p.red[600], dangerFg: p.ink[0] },
	map: { base: p.ink[100], block: p.ink[50], road: p.ink[0], roadMajor: p.signal[100], water: p.water.day, park: p.park.day },
	place: {
		terminal: '#1967D2',
		school: '#4285F4',
		store: '#4285F4',
		mall: '#4285F4',
		bank: '#4285F4',
		fuel: '#4285F4',
		food: '#E8710A',
		market: '#E8710A',
		hospital: '#D93025',
		pharmacy: '#D93025',
		hotel: '#C2185B',
		park: '#188038',
		culture: '#9334E6',
		worship: '#5F6368',
		government: '#5F6368'
	},
	route: p.route
}

export const night = {
	surface: { canvas: p.slate[900], default: p.slate[800], raised: p.slate[700], sunken: p.slate[850], inverse: p.ink[0], scrim: p.slate[950] },
	// Deliberately only TWO text tiers. A third grey fails 4.5:1 on dark surfaces —
	// muted greys live in `icon` and `border`, where the 3:1 UI threshold applies.
	text: { primary: p.ink[0], secondary: p.slate[200], inverse: p.slate[900], onBrand: p.ink[950], danger: p.red[400], success: p.green[400] },
	// `subtle` is a BACKGROUND on night, not a tint of the brand: it sits under a
	// Signal Yellow glyph. signal 700 was a mid amber, so a yellow icon on it had
	// almost nothing to separate them.
	brand: { default: p.signal[500], hover: p.signal[400], subtle: '#3A2D08' },
	border: { subtle: p.slate[500], default: p.slate[400], strong: p.slate[300], focus: p.signal[500] },
	icon: { primary: p.ink[0], secondary: p.slate[200], muted: p.slate[300] },
	capacity: {
		// The 900-level primitives are near-black at these sizes; a chip needs a
		// fill that reads as a fill behind text that clears 4.5:1 on it.
		open: { fg: p.green[400], bg: '#0C2C18' },
		filling: { fg: p.amber[400], bg: '#33240A' },
		full: { fg: p.red[400], bg: '#3A1414' },
		stale: { fg: p.slate[200], bg: '#28324A' }
	},
	action: { dangerBg: p.red[500], dangerFg: p.ink[0] },
	map: { base: p.slate[850], block: p.slate[800], road: p.slate[700], roadMajor: p.slate[600], water: p.water.night, park: p.park.night },
	place: {
		terminal: '#AECBFA',
		school: '#8AB4F8',
		store: '#8AB4F8',
		mall: '#8AB4F8',
		bank: '#8AB4F8',
		fuel: '#8AB4F8',
		food: '#FCAD70',
		market: '#FCAD70',
		hospital: '#F28B82',
		pharmacy: '#F28B82',
		hotel: '#F48FB1',
		park: '#81C995',
		culture: '#C58AF9',
		worship: '#BDC1C6',
		government: '#BDC1C6'
	},
	route: p.route
}

/**
 * Static fallback only. Components that need raw colour values should use
 * useTheme() from '@/theme/useTheme' so dark mode reaches them; this export
 * remains for non-React call sites that render before a theme exists.
 */
export const theme = day

/**
 * The flat semantic palette — single source for BOTH sides of theming:
 * tailwind.config.js turns these keys into `rgb(var(--biya-<key>) / alpha)`
 * classes, and vars.js emits the per-theme variable values. Add a colour here
 * and both sides pick it up.
 */
export const semanticColors = t => ({
	'surface': t.surface.default,
	'surface-canvas': t.surface.canvas,
	'surface-raised': t.surface.raised,
	'surface-sunken': t.surface.sunken,
	'surface-inverse': t.surface.inverse,
	'fg': t.text.primary,
	'fg-secondary': t.text.secondary,
	'fg-inverse': t.text.inverse,
	'fg-on-brand': t.text.onBrand,
	'fg-danger': t.text.danger,
	'fg-success': t.text.success,
	'brand': t.brand.default,
	'brand-hover': t.brand.hover,
	'brand-subtle': t.brand.subtle,
	'line': t.border.default,
	'line-subtle': t.border.subtle,
	'line-strong': t.border.strong,
	'line-focus': t.border.focus,
	'icon': t.icon.primary,
	'icon-secondary': t.icon.secondary,
	'icon-muted': t.icon.muted,
	'danger': t.action.dangerBg,
	'capacity-open-fg': t.capacity.open.fg,
	'capacity-open-bg': t.capacity.open.bg,
	'capacity-filling-fg': t.capacity.filling.fg,
	'capacity-filling-bg': t.capacity.filling.bg,
	'capacity-full-fg': t.capacity.full.fg,
	'capacity-full-bg': t.capacity.full.bg,
	'capacity-stale-fg': t.capacity.stale.fg,
	'capacity-stale-bg': t.capacity.stale.bg,
	'route-1': t.route[1],
	'route-2': t.route[2],
	'route-3': t.route[3],
	'route-4': t.route[4],
	'route-5': t.route[5],
	'route-6': t.route[6],
	'map-base': t.map.base,
	'map-block': t.map.block,
	'map-road': t.map.road,
	'map-road-major': t.map.roadMajor,
	'map-water': t.map.water,
	'map-park': t.map.park
})

export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 32, 8: 40, 9: 48, 10: 64 }
export const radius = { xs: 6, sm: 8, md: 12, lg: 16, xl: 20, '2xl': 28, full: 999 }
/** 48, not the 44 iOS minimum — the driver taps this in a moving vehicle. */
export const size = { touchMin: 48, iconSm: 16, iconMd: 20, iconLg: 24, iconXl: 32, pin: 44, avatar: 40, sheetGrabber: 36 }

const PJS = {
	regular: 'PlusJakartaSans_400Regular',
	medium: 'PlusJakartaSans_500Medium',
	semibold: 'PlusJakartaSans_600SemiBold',
	bold: 'PlusJakartaSans_700Bold',
	extrabold: 'PlusJakartaSans_800ExtraBold'
}
const JBM = { medium: 'JetBrainsMono_500Medium', bold: 'JetBrainsMono_700Bold' }

export const fonts = { ...PJS, mono: JBM.medium, monoBold: JBM.bold }

/** Body sits one step larger than typical: outdoor sunlight, one-handed use, older drivers. */
export const type = {
	displayL: { fontFamily: PJS.extrabold, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
	displayS: { fontFamily: PJS.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
	headingL: { fontFamily: PJS.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
	headingM: { fontFamily: PJS.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
	headingS: { fontFamily: PJS.semibold, fontSize: 17, lineHeight: 24, letterSpacing: -0.1 },
	bodyL: { fontFamily: PJS.medium, fontSize: 17, lineHeight: 26, letterSpacing: 0 },
	bodyM: { fontFamily: PJS.regular, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
	bodyMStrong: { fontFamily: PJS.semibold, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
	labelL: { fontFamily: PJS.semibold, fontSize: 14, lineHeight: 18, letterSpacing: 0.2 },
	labelS: { fontFamily: PJS.bold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
	caption: { fontFamily: PJS.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
	// Mono for alphanumeric codes: plate numbers scan faster, ETAs align in lists.
	monoPlate: { fontFamily: JBM.bold, fontSize: 20, lineHeight: 24, letterSpacing: 1.0 },
	monoData: { fontFamily: JBM.bold, fontSize: 15, lineHeight: 20, letterSpacing: 0.3 },
	monoCaption: { fontFamily: JBM.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 }
}

export const elevation = {
	/** Elevation/Float — floating map controls and chips. */
	float: { shadowColor: '#000000', shadowOpacity: 0.28, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 4 },
	/** Elevation/Sheet — the bottom sheet, casting upward. */
	sheet: { shadowColor: '#000000', shadowOpacity: 0.4, shadowOffset: { width: 0, height: -4 }, shadowRadius: 24, elevation: 16 }
}

/** A ping older than this renders the vehicle as Stale — dashed pin + "last seen" label. */
export const STALE_AFTER_MS = 120_000
/** Commuter destination matches any trip polyline passing within this radius. */
export const ROUTE_MATCH_RADIUS_M = 400
/** Driver location broadcast interval — throttled for data and battery. */
export const PING_INTERVAL_MS = 8_000

/**
 * The four PH public-utility vehicle classes the app covers.
 * Tricycle and habal-habal are deliberately out of scope for v1 — they serve an
 * AREA rather than a route, so they need a different trip model entirely.
 */
export const VEHICLE_TYPES = ['jeepney', 'ejeep', 'bus', 'uv_express']

export const VEHICLE_LABELS = {
	jeepney: 'Jeepney',
	ejeep: 'E-Jeep',
	bus: 'Bus',
	uv_express: 'UV Express'
}

/**
 * Where a passenger may actually board. UV Express loads at its terminal and will
 * not stop mid-route, so showing it as "nearby" the way a jeepney is shown would
 * promise a ride that never stops.
 */
export const BOARDING_RULE = {
	jeepney: 'anywhere',
	ejeep: 'stops',
	bus: 'stops',
	uv_express: 'terminal'
}
