/**
 * English copy — key-for-key mirror of copy.tl.js. If a key exists there it
 * must exist here, or a screen renders `undefined` the moment the user switches.
 */

/**
 * Whole CALENDAR days between a timestamp and now — 0 means today. Counting
 * 24-hour blocks instead would call last night's 9 PM run "today" at 7 AM,
 * which is exactly when a jeepney driver reads this.
 */
const daysSince = iso => {
	const then = iso ? new Date(iso) : null
	if (!then || Number.isNaN(then.getTime())) return null

	const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

	return Math.max(0, Math.round((midnight(new Date()) - midnight(then)) / 86_400_000))
}

const relativeDay = iso => {
	const days = daysSince(iso)
	if (days === null) return 'recently'
	if (days === 0) return 'today'
	if (days === 1) return 'yesterday'
	return `${days} days ago`
}

export const app = {
	name: 'Biyahero',
	tagline: 'Know which ride is coming your way — without signing up.'
}

export const roleSelect = {
	eyebrow: 'Hello!',
	title: 'What are you doing today?',
	subtitle: 'You can change this any time in Settings.',
	commuter: {
		title: "I'm riding",
		badge: 'NO ACCOUNT',
		body: 'See active vehicles right away. No sign-up and no password. Your location is optional and never leaves your phone unless you show it to one driver.'
	},
	driver: {
		title: "I'm driving",
		badge: 'REGISTRATION REQUIRED',
		body: 'Let passengers know you are on the road. One-time vehicle and licence registration is required.'
	},
	footnote: 'Biyahero is one app. Drivers are commuters too — you can switch any time.'
}

export const settings = {
	title: 'Settings',
	modeLabel: 'CURRENT MODE',
	commuter: "I'm riding",
	driver: "I'm driving",
	language: 'Language',
	languageNames: { tl: 'Filipino', en: 'English' },
	tapToChange: 'Tap to change',
	theme: 'Theme',
	themeNames: { system: 'Follows your device', light: 'Always light', dark: 'Always dark' },
	location: 'Location',
	locationOn: 'Allowed while in use',
	locationOff: 'Not allowed — open system settings',
	locationNotAsked: 'Not requested yet — optional, only to show you on the map',
	clearSearches: 'Clear recent searches',
	clearSearchesHint: 'Saved on this device only',
	searchesCleared: 'Searches cleared',
	privacy: 'Biyahero has no accounts for passengers. No personal information is stored on the server. Your location leaves your phone only if you show it to one driver, and it is deleted when that trip ends.'
}

export const mapHome = {
	searchPlaceholder: 'Where are you going?',
	activeCount: n => `${n} vehicle${n === 1 ? '' : 's'} active now`,
	// With a filter on, the plain count is a claim about the road that is not
	// true: "0 vehicles active now" while nineteen jeepneys pass the corner.
	filteredCount: n => `${n} match your filters`,
	updateNote: 'Updates every 8 seconds · no location permission',
	updateNoteLocated: 'Updates every 8 seconds · showing your location',
	myLocation: 'Show my location',
	locationServicesOff: "Your phone's Location (GPS) is off. Turn it on to see where you are.",
	layers: 'Map type',
	layerNames: { standard: 'Default', hybrid: 'Satellite', terrain: 'Terrain' },
	pins: 'Vehicles on the map',
	pinModes: { normal: 'Show', dim: 'Faded', hide: 'Hide' },
	myLocationOn: 'Now showing your location',
	myLocationOff: 'Your location is hidden',
	/**
	 * The banner that keeps the opt-in honest once the commuter leaves the
	 * vehicle screen. It has to name WHO can see them — an unnamed "someone can
	 * see you" reads as a warning about a stranger, not as a thing they chose —
	 * and it has to say how to stop, because it is the only way out.
	 */
	watching: 'A driver can see you',
	watchingStop: 'They can see you — tap to stop',
	near: plate => `${plate} is close!`,
	filters: [
		{ key: 'all', label: 'All' },
		{ key: 'jeepney', label: 'Jeepney' },
		{ key: 'ejeep', label: 'E-Jeep' },
		{ key: 'bus', label: 'Bus' },
		{ key: 'uv_express', label: 'UV Express' }
	],
	radius: {
		nearMe: 'Near me',
		km: n => `${n} km`
	}
}

export const search = {
	placeholder: 'Where are you going?',
	recent: 'RECENT SEARCHES',
	places: 'PLACES',
	popular: 'POPULAR DESTINATIONS',
	privacy: 'Saved on your device only. No account, and your location never leaves your phone unless you show it to one driver.',
	activeCount: n => `${n} vehicle${n === 1 ? '' : 's'} active now`,
	resultsTitle: (n, dest) => `${n} vehicle${n === 1 ? '' : 's'} passing ${dest}`,
	resultsSubtitle: (dest, radius) => `Routes passing within ${radius} of ${dest}`,
	emptyTitle: dest => `No vehicles passing ${dest}`,
	emptyBody: 'No driver is passing there right now. This is common after 9 PM.',
	searchAnywhere: q => `Search for "${q}"`,
	searchAnywhereHint: 'Anywhere on the map — shows the rides that run past it',
	offlineTitle: 'No connection',
	offlineBody: 'Biyahero is unreachable. Retrying every 8 seconds.',
	unknownPlaceTitle: dest => `Could not find "${dest}"`,
	unknownPlaceBody: 'Try another name, or pick one from the list.',
	noneActiveTitle: 'No vehicles active right now',
	noneActiveBody: 'No driver is broadcasting at the moment. Try again shortly.',
	clear: 'Clear'
}

export const vehicle = {
	status: 'STATUS',
	type: 'TYPE',
	capacity: 'CAPACITY',
	live: 'Live',
	currentlyAt: street => `Currently on ${street}`,
	routeLength: km => `${km} km full route`,
	onStreet: street => `On ${street} now`,
	lastOnStreet: street => `Last seen on ${street}`,
	verifiedDriver: years => `Verified driver · ${years} year${years === 1 ? '' : 's'} on the route`,
	away: m => (m < 1000 ? `${m} m away from you` : `${(m / 1000).toFixed(1)} km away from you`),
	photoAlt: dest => `Photo of the vehicle heading to ${dest}`,
	/** Opens the driver sheet. The name itself now lives inside it. */
	viewDriver: 'View the driver',
	viewDriverShort: 'Driver',
	bodyLabel: 'Body no.',
	driverSheetTitle: 'About the driver',
	modelLabel: 'Model',
	operatorLabel: 'Operator',
	plateLabel: 'Plate',
	typeLabel: 'Vehicle type',
	unknownModel: 'Not stated',
	centerOnVehicle: 'Centre on the vehicle',
	nearest: 'Closest to you',
	passesWithin: (m, dest) => `Passes ${m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`} from ${dest}`,
	tripEndedTitle: 'This trip has ended',
	tripEndedBody: 'The driver finished the run, so they are off the map. Go back to see other vehicles.',
	unverifiedDriver: years => `Driver · ${years} year${years === 1 ? '' : 's'} on Biyahero`,
	staleTitle: 'Last known position',
	staleBody: 'No live GPS. Showing when this vehicle was last seen.',
	/**
	 * The only screen where a commuter is told what they are agreeing to, so the
	 * scope has to sit in the words: one driver, one trip. Both halves are
	 * literal — no other driver is ever sent this, and the position is deleted
	 * when the trip ends. The consent outlives this screen on purpose, which is
	 * why WatchingBanner exists to keep saying so.
	 */
	watchTitle: 'Show where I am waiting',
	watchBody: 'This driver only, while the trip is running.',
	watchOn: 'This driver can see you now.',
	watchOff: 'The driver can no longer see you.'
}

export const capacity = {
	open: 'Seats open',
	filling: 'Filling up',
	full: 'Full',
	unknown: 'Unknown'
}

export const freshness = {
	live: 'LIVE',
	minutes: n => `${n} MIN`,
	unknown: '—'
}

export const signUp = {
	eyebrow: 'DRIVER REGISTRATION',
	step: (n, of) => `Step ${n} of ${of}`,
	haveAccount: 'Already registered? Log in',
	alreadyRegistered: 'This licence is already registered. Just log in.',
	terms: 'By continuing you agree to the Biyahero Terms and Privacy Policy.'
}

export const login = {
	eyebrow: 'LOG IN',
	title: 'Log in as a driver',
	body: 'Enter your licence, plate and password.',
	licenceLabel: 'LICENCE NUMBER',
	licencePlaceholder: 'N01-19-123456',
	plateLabel: 'VEHICLE PLATE',
	platePlaceholder: 'NCR 8842',
	submit: 'Log in',
	noAccount: 'No account yet? Register',
	passwordLabel: 'PASSWORD',
	passwordPlaceholder: 'Your password',
	notFound: 'Wrong licence, plate or password.',
	hint: 'No SMS code — just a password.'
}

export const vehicleDetails = {
	eyebrow: 'VEHICLE DETAILS',
	title: 'What vehicle do you drive?',
	body: 'This is how they recognise you on the road.',
	typeLabel: 'VEHICLE TYPE',
	plateLabel: 'PLATE',
	platePlaceholder: 'NCR 8842',
	modelLabel: 'MODEL',
	modelPlaceholder: 'Sarao 2018',
	operatorLabel: 'COMPANY',
	operatorPlaceholder: 'Victory Liner, 5Star, Solid North',
	bodyLabel: 'BODY NO.',
	bodyNote: 'Painted on the body, not the plate.',
	bodyPlaceholder: '214',
	plateNote: 'The plate is public — it is painted on the vehicle.',
	/**
	 * The vehicle photo is shown to strangers, so the words have to say that
	 * plainly. It is also why the note names the vehicle and never the driver.
	 */
	photoLabel: 'VEHICLE PHOTO',
	photoNote: 'This is what a commuter looks for from the corner.',
	needPhoto: 'Take or choose a photo of the vehicle first.',
	photoTake: 'Take one',
	photoPick: 'Choose',
	photoRetake: 'Change the photo',
	photoRemove: 'Remove the photo',
	photoDenied: 'Camera or gallery permission is needed.',
	continue: 'Continue',
	invalidPlate: 'The vehicle plate is required.',
	editTitle: 'Edit vehicle',
	save: 'Save changes',
	saved: 'Changes saved',
	editPlateNote: 'The plate is part of your login — if you change it, use the new one to log in.'
}

export const licence = {
	eyebrow: 'VERIFICATION',
	title: 'Take a photo of your licence',
	body: 'Just once. We use it to check that you are a legitimate driver.',
	frameHint: 'Fit the licence inside the frame',
	capture: 'Take photo',
	retake: 'Retake',
	submit: 'Submit registration',
	captured: 'Photo captured',
	confirmLabel: 'CONFIRM THE DETAILS',
	nameLabel: 'NAME ON LICENCE',
	namePlaceholder: 'Roberto Santos',
	numberLabel: 'LICENCE NUMBER',
	numberPlaceholder: 'N01-19-123456',
	invalidName: 'The name on the licence is required.',
	needPhoto: 'A photo of the licence is required.',
	permissionTitle: 'Camera access needed',
	permissionBody: 'It is only used to photograph your licence.',
	grant: 'Allow camera',
	expiryLabel: 'EXPIRY DATE',
	expiryPlaceholder: 'Pick a date',
	invalidExpiry: 'Enter the expiry date (YYYY-MM-DD).',
	expiredLicence: 'Your licence has expired.',
	invalidNumber: 'Wrong number format. It should look like N01-19-123456.',
	passwordLabel: 'PASSWORD',
	passwordPlaceholder: 'At least 8 characters',
	invalidPassword: 'The password must be at least 8 characters.',
	/**
	 * Says the hard part out loud. There is no reset link — a driver has no
	 * verified email or phone for one to go to — so the eye toggle beside this
	 * field is the only chance they get to check what they typed.
	 */
	passwordNote: 'This is what you will log in with. Remember it — there is no way to reset it.',
	reviewNote: 'We check the number format and expiry. The photo is kept in case of a dispute.',
	hashNote: 'Licence: hashed, never displayed.'
}

export const pending = {
	title: 'Reviewing your registration',
	body: 'This usually takes 1–2 hours on working days. We will notify you once approved.',
	steps: [
		{ title: 'Registration received', body: 'We received your vehicle and licence details.' },
		{ title: 'Under review', body: 'We are confirming the licence and plate.' },
		{ title: 'Ready to drive', body: 'Passengers will see you once you start a trip.' }
	],
	footnote: 'Biyahero is one app — you can keep using it as a passenger meanwhile.',
	useAsCommuter: 'Use as passenger',
	checking: 'Checking status…',
	refresh: 'Refresh status',
	notApproved: 'Your registration is not approved yet.',
	approvedTitle: 'You are approved!',
	approvedBody: 'Passengers will see you once you start a trip.',
	rejectedTitle: 'Registration not approved',
	rejectedBody: 'Check the reason below and submit a clear photo of your licence again.'
}

export const driverHome = {
	greetingMorning: 'Good morning,',
	greetingAfternoon: 'Good afternoon,',
	greetingEvening: 'Good evening,',
	offlineNote: 'You are offline — passengers cannot see you',
	todayLabel: 'TODAY',
	trips: 'TRIPS',
	hoursOnline: 'HOURS ONLINE',
	kmTravelled: 'KM TRAVELLED',
	startTrip: 'Start a trip',
	locationServicesOff: "Your phone's Location (GPS) is off. Turn it on to start a trip.",
	startNote: 'This starts broadcasting your location. It stops when you end the trip.'
}

export const startTrip = {
	title: 'Where are you headed?',
	body: 'Tell passengers where this trip is going. You can change it any time.',
	frequentLabel: 'YOUR FREQUENT ROUTES',
	previewLabel: 'ROUTE PREVIEW',
	preview: (km, mins) => `~${km} km · about ${mins} min in current traffic`,
	destinationPlaceholder: 'Enter a destination',
	start: 'Start the trip',
	needDestination: 'Pick a destination first.',
	suggestionsLabel: 'PLACES',
	resolveFailed: 'Could not pin that place down. Try pointing to it on the map.',
	// Short on purpose: it sits beside the name and the address in a
	// narrow row, where 'ang layo sa iyo' would push the name out.
	away: m => (m < 1000 ? `${m} m` : `${Math.round(m / 1000)} km`),
	searching: 'Searching…',
	noPlaces: 'No place found. Try another name or pin it on the map.',
	searchFailed: 'Search is unreachable. Try again or pin it on the map.',
	nearbyLabel: 'ROUTES NEAR YOU',
	recentLabel: 'YOUR RECENT ROUTES',
	recentMeta: (km, iso) => `${km} km · last run ${relativeDay(iso)}`,
	nearbyMeta: (km, m) => `${km} km · passes ${m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`} from you`,
	pickOnMap: 'Pin on the map',
	pinHint: 'Tap the map where you are headed',
	pinUse: 'Use this spot',
	pinnedFallback: 'Pinned location',
	viaLabel: 'YOUR ROUTE',
	viaHint: 'Own route? Trace it — no need to search for a destination. Wherever the line ends is where the trip goes.',
	viaPinned: 'Pinned road',
	viaRemove: 'Remove this point',
	drawOpen: 'Trace your route',
	drawEdit: 'Change the route',
	drawHint: 'Starting from where you are, tap the roads you drive through in order. Your last tap is where the trip ends.',
	drawEmpty: 'Tap the map to start.',
	drawYouAreHere: 'You are here',
	previewDrawn: 'This is what you traced. It follows the real roads once the trip starts.',
	previewSnapped: km => `~${km} km on real roads`,
	previewDetour: (road, drawn) =>
		`The road route is ${road} km but you only traced ${drawn} km. A point may have landed on an expressway or a one-way — try moving it.`,
	drawNeedsLocation: 'Turn on location first. Your route starts from where you are.',
	drawCount: n => (n === 1 ? '1 point' : `${n} points`),
	drawUndo: 'Undo',
	drawClear: 'Start over',
	drawDone: 'Use this route',
	newRouteNote: 'The route will be laid out from right where you are to the place you picked.',
	rerouteTitle: 'Change destination',
	rerouteBody: 'The trip re-routes from where you are now — the run keeps going.',
	rerouteSubmit: 'Change the route',
	rerouted: 'Route changed.'
}

export const activeTrip = {
	liveBanner: 'LIVE — passengers can see you',
	notLiveBanner: 'Not visible — tap to fix',
	notLiveAction: 'Passengers cannot see you. Tap to open Location settings.',
	openProfile: 'Open your profile',
	followModes: { off: 'Free map', region: 'Follow me', navigation: 'Navigation' },
	heading: dest => `Bound for ${dest}`,
	elapsed: (mins, km) => `${mins} min in · ${km} km travelled`,
	change: 'Change',
	capacityPrompt: 'HOW FULL IS YOUR VEHICLE?',
	end: 'End the trip',
	endNote: 'This stops broadcasting your location. You disappear from passenger maps immediately.',
	watchingNone: 'No commuters are watching you yet',
	watchingNoneBody: 'Commuters who agree to show where they are waiting will appear here.',
	watchingCount: n => `${n} commuter${n === 1 ? '' : 's'} watching you`,
	/**
	 * The line that explains the filled pin. Without it the driver has to guess
	 * what the colour means, and a colour nobody explained is worse than none.
	 */
	watchingOnRoute: n => `${n} on your route`,
	watchingNoneOnRoute: 'None on your route yet — they are off to the side of it',
	watchingNearest: m => `nearest ${m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`} ahead`,
	/** No GPS fix means no honest distance — same rule as freshness.unknown: never invent one. */
	watchingNoFix: 'No distance until GPS returns'
}

export const driverProfile = {
	totalTrips: 'TOTAL TRIPS',
	onRoute: 'ON THE ROUTE',
	totalKm: 'KM TRAVELLED',
	years: n => `${n} year${n === 1 ? '' : 's'}`,
	noRatings: 'Biyahero has no ratings — passengers are anonymous, so nobody could be held to a review.',
	myVehicle: 'MY VEHICLE',
	edit: 'Edit',
	tripHistory: 'Trip history',
	settingsRow: 'Settings',
	settingsRowHint: 'Language, theme, and mode switch (Ride/Drive)',
	help: 'Help and support',
	logout: 'Log out'
}

export const history = {
	title: 'Trip history',
	empty: 'No completed trips yet',
	emptyBody: 'Every trip you finish will show up here.',
	meta: (mins, km) => `${mins} min · ${km} km`,
	months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
}

export const help = {
	title: 'Help and support',
	items: [
		{
			q: 'How do passengers see me?',
			a: 'When you start a trip, your location is sent every 8 seconds. When you end it, you disappear from their map immediately.'
		},
		{
			q: 'What does VERIFIED mean?',
			a: 'Your licence number is correctly formatted, not expired, and a photo is on file. It is not a confirmation from the LTO.'
		},
		{
			q: 'How do I log in on another phone?',
			a: "Enter your licence number, your vehicle's plate, and your password. No SMS code."
		},
		{
			q: 'Can drivers see passengers?',
			a: 'No, unless you choose to be seen. Every vehicle has a switch: turn it on and that one driver sees where you are waiting, until the trip ends. There is no heatmap, and nobody who declined is counted.'
		},
		{
			q: 'How do I change my plate or vehicle?',
			a: 'On your profile, tap "Edit". Remember: the plate is part of your login.'
		}
	]
}

export const common = {
	back: 'Back',
	close: 'Close',
	cancel: 'Cancel',
	retry: 'Try again',
	loading: 'One moment…',
	offline: 'No connection',
	genericError: 'Something went wrong. Try again.',
	showPassword: 'Show password',
	hidePassword: 'Hide password'
}
