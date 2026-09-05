/**
 * Filipino copy — the shipping default, lifted verbatim from the Figma screens.
 * Every key here must have a mirror in copy.en.js; copy.js swaps whole modules.
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
	if (days === null) return 'kamakailan'
	if (days === 0) return 'ngayong araw'
	if (days === 1) return 'kahapon'
	return `${days} araw ang nakalipas`
}

export const app = {
	name: 'Biyahero',
	tagline: 'Alamin kung anong sasakyan ang papunta sa iyo — nang hindi nagra-rehistro.'
}

export const roleSelect = {
	eyebrow: 'Kumusta!',
	title: 'Ano ang gagawin mo ngayon?',
	subtitle: 'Puwede mong palitan ito anumang oras sa Settings.',
	commuter: {
		title: 'Sakay ako',
		badge: 'WALANG ACCOUNT',
		body: 'Tingnan agad ang mga aktibong sasakyan. Walang sign-up at walang password. Opsyonal ang lokasyon mo — hindi ito ipinapadala sa server maliban kung ipakita mo ito sa isang drayber.'
	},
	driver: {
		title: 'Driver ako',
		badge: 'KAILANGAN NG REHISTRO',
		body: 'Ipaalam sa mga pasahero na aktibo ka. Kailangan ng one-time na rehistro ng sasakyan at lisensya para ma-verify.'
	},
	footnote: 'Isang app lang ang Biyahero. Karaniwang pasahero rin ang mga drayber — puwede kang lumipat kahit kailan.'
}

export const settings = {
	title: 'Settings',
	modeLabel: 'KASALUKUYANG MODE',
	commuter: 'Sakay ako',
	driver: 'Driver ako',
	language: 'Wika',
	languageNames: { tl: 'Filipino', en: 'English' },
	tapToChange: 'I-tap para palitan',
	theme: 'Tema',
	themeNames: { system: 'Sumusunod sa device', light: 'Laging maliwanag', dark: 'Laging madilim' },
	location: 'Lokasyon',
	locationOn: 'Pinapayagan habang ginagamit',
	locationOff: 'Hindi pinapayagan — buksan ang settings ng system',
	locationNotAsked: 'Hindi pa hinihingi — opsyonal, para lang makita ang lokasyon mo sa mapa',
	clearSearches: 'Burahin ang mga hinanap',
	clearSearchesHint: 'Naka-save lang sa device na ito',
	searchesCleared: 'Nabura ang mga hinanap',
	privacy: 'Walang account ang Biyahero para sa mga pasahero. Walang personal na impormasyong iniimbak sa server. Umaalis lang sa telepono ang lokasyon mo kung ipakita mo ito sa isang drayber, at binubura ito pagkatapos ng biyahe.'
}

export const mapHome = {
	searchPlaceholder: 'Saan ka pupunta?',
	/** Count is injected: "12 sasakyan aktibo ngayon". */
	activeCount: n => `${n} sasakyan aktibo ngayon`,
	updateNote: 'Nag-a-update kada 8 segundo · walang location permission',
	updateNoteLocated: 'Nag-a-update kada 8 segundo · ipinapakita ang lokasyon mo',
	myLocation: 'Ipakita ang lokasyon ko',
	locationServicesOff: 'Naka-off ang Location (GPS) ng telepono mo. Buksan ito para makita ang lokasyon mo.',
	layers: 'Anyo ng mapa',
	layerNames: { standard: 'Karaniwan', hybrid: 'Satellite', terrain: 'Terrain' },
	/**
	 * The fleet as a layer of its own. "Malabo" (faint) rather than a percentage:
	 * the commuter is choosing to see the town names through the badges, not
	 * tuning a slider.
	 */
	pins: 'Mga sasakyan sa mapa',
	pinModes: { normal: 'Ipakita', dim: 'Malabo', hide: 'Itago' },
	myLocationOn: 'Ipinapakita na ang lokasyon mo',
	myLocationOff: 'Itinago ang lokasyon mo',
	/**
	 * The banner that keeps the opt-in honest once the commuter leaves the
	 * sasakyan screen. It has to name WHO can see them — "may nakakakita sa iyo"
	 * with no name reads as a warning about a stranger, not as a thing they
	 * chose — and it has to say how to stop, because it is the only way out.
	 */
	watching: 'May drayber na nakakakita sa iyo',
	watchingStop: 'Nakikita ka nito — i-tap para itigil',
	near: plate => `Malapit na ang ${plate}!`,
	filters: [
		{ key: 'all', label: 'Lahat' },
		{ key: 'jeepney', label: 'Jeepney' },
		{ key: 'ejeep', label: 'E-Jeep' },
		{ key: 'bus', label: 'Bus' },
		{ key: 'uv_express', label: 'UV Express' }
	],
	/**
	 * The distance chips. Applied on the phone — the server never learns where
	 * the commuter is from a filter — and only offered once the location toggle
	 * is on, because "within 3 km" of nowhere is not a filter.
	 */
	radius: {
		nearMe: 'Malapit sa akin',
		km: n => `${n} km`
	}
}

export const search = {
	placeholder: 'Saan ka pupunta?',
	recent: 'MGA HULING HINANAP',
	places: 'MGA LUGAR',
	popular: 'MGA SIKAT NA DESTINASYON',
	privacy: 'Naka-save sa device mo lang. Walang account, at hindi umaalis sa telepono mo ang lokasyon mo maliban kung ipakita mo ito sa isang drayber.',
	activeCount: n => `${n} sasakyan aktibo ngayon`,
	/** Corridor match, not a route lookup — 400 m either side of the destination. */
	resultsTitle: (n, dest) => `${n} sasakyan dumadaan sa ${dest}`,
	resultsSubtitle: (dest, radius) => `Mga rutang dumadaan sa loob ng ${radius} ng ${dest}`,
	emptyTitle: dest => `Walang sasakyan na dumadaan sa ${dest}`,
	emptyBody: 'Walang aktibong drayber na dumadaan diyan ngayon. Karaniwan itong nangyayari pagkatapos ng 9 PM.',
	searchAnywhere: q => `Hanapin ang "${q}"`,
	searchAnywhereHint: 'Kahit saang lugar — ipapakita ang mga sasakyang dumadaan doon',
	/** No destination typed — nothing is being filtered, there is simply nobody out. */
	offlineTitle: 'Walang koneksyon',
	offlineBody: 'Hindi maabot ang Biyahero. Susubukan ulit kada 8 segundo.',
	unknownPlaceTitle: dest => `Hindi mahanap ang "${dest}"`,
	unknownPlaceBody: 'Subukan ang ibang pangalan, o pumili mula sa listahan.',
	noneActiveTitle: 'Walang aktibong sasakyan ngayon',
	noneActiveBody: 'Walang drayber na nagbo-broadcast sa ngayon. Subukan ulit maya-maya.',
	clear: 'I-clear'
}

export const vehicle = {
	status: 'KALAGAYAN',
	type: 'URI',
	capacity: 'KAPASIDAD',
	live: 'Live',
	/** Street name, not a distance — this line never depends on knowing where the commuter is. */
	currentlyAt: street => `Kasalukuyang nasa ${street}`,
	routeLength: km => `${km} km ang buong ruta`,
	onStreet: street => `Nasa ${street} ngayon`,
	lastOnStreet: street => `Huling nasa ${street}`,
	verifiedDriver: years => `Beripikadong drayber · ${years} taon sa ruta`,
	/** Straight-line distance — honest now, because the commuter opted in. */
	away: m => (m < 1000 ? `${m} m ang layo sa iyo` : `${(m / 1000).toFixed(1)} km ang layo sa iyo`),
	photoAlt: dest => `Larawan ng sasakyang papuntang ${dest}`,
	/** Opens the driver sheet. The name itself now lives inside it. */
	viewDriver: 'Tingnan ang drayber',
	viewDriverShort: 'Drayber',
	bodyLabel: 'Body no.',
	driverSheetTitle: 'Tungkol sa drayber',
	modelLabel: 'Modelo',
	operatorLabel: 'Kompanya',
	plateLabel: 'Plaka',
	typeLabel: 'Uri ng sasakyan',
	unknownModel: 'Hindi nakasaad',
	centerOnVehicle: 'Itutok sa sasakyan',
	nearest: 'Pinakamalapit sa iyo',
	passesWithin: (m, dest) => `Dumadaan ${m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`} mula sa ${dest}`,
	tripEndedTitle: 'Tapos na ang biyaheng ito',
	tripEndedBody: 'Tinapos ng drayber ang biyahe, kaya wala na siya sa mapa. Bumalik para makita ang ibang sasakyan.',
	unverifiedDriver: taon => `Drayber · ${taon} taon sa Biyahero`,
	staleTitle: 'Huling alam na posisyon',
	staleBody: 'Walang live na GPS. Ipinapakita ang oras kung kailan huling nakita.',
	/**
	 * The only screen where a commuter is told what they are agreeing to, so the
	 * scope has to sit in the words: one driver, one trip. Both halves are
	 * literal — no other driver is ever sent this, and the position is deleted
	 * when the trip ends. The consent outlives this screen on purpose, which is
	 * why WatchingBanner exists to keep saying so.
	 */
	watchTitle: 'Ipakita kung nasaan ako',
	watchBody: 'Sa drayber na ito lang, habang tumatakbo ang biyahe.',
	watchOn: 'Nakikita ka na ng drayber na ito.',
	watchOff: 'Hindi ka na nakikita ng drayber.'
}

export const capacity = {
	open: 'May upuan',
	filling: 'Medyo puno',
	full: 'Puno',
	unknown: 'Di sigurado'
}

export const freshness = {
	live: 'LIVE',
	/** Minutes since the last ping, for anything past PING staleness. */
	minutes: n => `${n} MIN`,
	/**
	 * Never heard from at all. Showing "1 MIN" here would claim a ping we never
	 * received — the same invention the no-ETA rule exists to prevent.
	 */
	unknown: '—'
}

export const signUp = {
	eyebrow: 'REHISTRO NG DRAYBER',
	step: (n, of) => `Hakbang ${n} ng ${of}`,
	haveAccount: 'Naka-rehistro ka na? Mag-log in',
	alreadyRegistered: 'Nakarehistro na ang lisensyang ito. Mag-log in na lang.',
	terms: 'Sa pagpapatuloy, sumasang-ayon ka sa Mga Tuntunin at Patakaran sa Privacy ng Biyahero.'
}

/**
 * Returning drivers. Licence + plate say WHICH driver; the password proves it.
 * The first two are painted on the vehicle and printed on a card, so on their
 * own they were a credential anyone at a terminal could read.
 */
export const login = {
	eyebrow: 'PAG-LOG IN',
	title: 'Mag-log in bilang drayber',
	body: 'Ilagay ang lisensya, plaka, at password mo.',
	licenceLabel: 'NUMERO NG LISENSYA',
	licencePlaceholder: 'N01-19-123456',
	plateLabel: 'PLAKA NG SASAKYAN',
	platePlaceholder: 'NCR 8842',
	submit: 'Mag-log in',
	noAccount: 'Wala pang account? Magparehistro',
	passwordLabel: 'PASSWORD',
	passwordPlaceholder: 'Password mo',
	notFound: 'Mali ang lisensya, plaka, o password.',
	hint: 'Walang SMS code — password lang.'
}

export const vehicleDetails = {
	eyebrow: 'DETALYE NG SASAKYAN',
	title: 'Anong sasakyan ang minamaneho mo?',
	body: 'Makikilala ka nila nito sa kalsada.',
	typeLabel: 'URI NG SASAKYAN',
	plateLabel: 'PLAKA',
	platePlaceholder: 'NCR 8842',
	modelLabel: 'MODELO',
	modelPlaceholder: 'Sarao 2018',
	operatorLabel: 'KOMPANYA',
	operatorPlaceholder: 'Victory Liner, 5Star, Solid North',
	bodyLabel: 'BODY NO.',
	bodyNote: 'Nakapinta sa katawan, hindi ang plaka.',
	bodyPlaceholder: '214',
	plateNote: 'Pampubliko ang plaka — nakapinta na ito sa sasakyan.',
	/**
	 * The vehicle photo is shown to strangers, so the words have to say that
	 * plainly. It is also why the note names the sasakyan and never the driver.
	 */
	photoLabel: 'LARAWAN NG SASAKYAN',
	photoNote: 'Ito ang hahanapin ng pasahero sa kanto.',
	needPhoto: 'Kunan o pumili muna ng larawan ng sasakyan.',
	photoTake: 'Kunan',
	photoPick: 'Pumili',
	photoRetake: 'Palitan ang larawan',
	photoRemove: 'Alisin ang larawan',
	photoDenied: 'Kailangan ng pahintulot para sa camera o gallery.',
	continue: 'Magpatuloy',
	invalidPlate: 'Kailangan ang plaka ng sasakyan.',
	editTitle: 'Baguhin ang sasakyan',
	save: 'I-save ang pagbabago',
	saved: 'Na-save ang pagbabago',
	/** The plate is half the login credential, so editing it changes the login. */
	editPlateNote: 'Ang plaka ay kalahati ng pag-log in mo — kapag pinalitan, ang bago na ang gagamitin.'
}

export const history = {
	title: 'Kasaysayan ng biyahe',
	empty: 'Wala pang tapos na biyahe',
	emptyBody: 'Lalabas dito ang bawat biyaheng natapos mo.',
	meta: (mins, km) => `${mins} min · ${km} km`,
	months: ['Ene', 'Peb', 'Mar', 'Abr', 'May', 'Hun', 'Hul', 'Ago', 'Set', 'Okt', 'Nob', 'Dis']
}

export const help = {
	title: 'Tulong at suporta',
	items: [
		{
			q: 'Paano ako nakikita ng mga pasahero?',
			a: 'Kapag sinimulan mo ang biyahe, ipinapadala ang lokasyon mo kada 8 segundo. Kapag tinapos mo ito, agad kang nawawala sa mapa nila.'
		},
		{
			q: 'Ano ang ibig sabihin ng VERIFIED?',
			a: 'Tama ang porma ng numero ng lisensya mo, hindi pa ito paso, at may nakaimbak na larawan. Hindi ito kumpirmasyon mula sa LTO.'
		},
		{
			q: 'Paano mag-log in sa ibang telepono?',
			a: 'Ilagay ang numero ng lisensya at plaka ng sasakyan mo. Walang password at walang SMS code.'
		},
		{
			q: 'Nakikita ba ng mga drayber ang mga pasahero?',
			a: 'Hindi, maliban kung ikaw mismo ang magpapakita. May switch sa bawat sasakyan: kapag binuksan mo ito, makikita ng drayber na iyon lang kung saan ka naghihintay, hanggang matapos ang biyahe. Walang heatmap at walang bilang ng mga hindi pumayag.'
		},
		{
			q: 'Paano papalitan ang plaka o sasakyan?',
			a: 'Sa profile, i-tap ang "Baguhin". Tandaan: ang plaka ang kalahati ng pag-log in mo.'
		}
	]
}

export const licence = {
	eyebrow: 'BERIPIKASYON',
	title: 'Kunan ng larawan ang lisensya mo',
	body: 'Isang beses lang ito. Ginagamit namin ito para patunayan na lehitimong drayber ka.',
	frameHint: 'Ipasok ang lisensya sa loob ng frame',
	capture: 'Kunan ng larawan',
	retake: 'Ulitin',
	submit: 'Ipadala ang rehistro',
	captured: 'Nakuha ang larawan',
	confirmLabel: 'KUMPIRMAHIN ANG DETALYE',
	nameLabel: 'PANGALAN SA LISENSYA',
	namePlaceholder: 'Roberto Santos',
	numberLabel: 'NUMERO NG LISENSYA',
	numberPlaceholder: 'N01-19-123456',
	invalidName: 'Kailangan ang pangalan sa lisensya.',
	needPhoto: 'Kailangan ang larawan ng lisensya.',
	permissionTitle: 'Kailangan ng access sa camera',
	permissionBody: 'Ginagamit lang ito para kunan ng larawan ang lisensya mo.',
	grant: 'Payagan ang camera',
	expiryLabel: 'PETSA NG EXPIRY',
	expiryPlaceholder: 'Pumili ng petsa',
	invalidExpiry: 'Ilagay ang petsa ng expiry (YYYY-MM-DD).',
	expiredLicence: 'Paso na ang lisensya mo.',
	invalidNumber: 'Mali ang porma ng numero. Dapat katulad ng N01-19-123456.',
	passwordLabel: 'PASSWORD',
	passwordPlaceholder: 'Hindi bababa sa 8 karakter',
	invalidPassword: 'Dapat 8 karakter pataas ang password.',
	/**
	 * Says the hard part out loud. There is no reset link — a driver has no
	 * verified email or phone for one to go to — so the eye toggle beside this
	 * field is the only chance they get to check what they typed.
	 */
	passwordNote: 'Ito ang gagamitin mo sa pag-log in. Tandaan mo ito — walang paraan para i-reset.',
	/**
	 * Deliberately does NOT claim the licence was checked against LTO — there is
	 * no public API to check it against. It says exactly what happens.
	 */
	reviewNote: 'Sinusuri namin ang porma at bisa ng numero. Nakaimbak ang larawan kung sakaling may reklamo.',
	/** Never displayed back to anyone — the design stores a hash, not the number. */
	hashNote: 'Lisensya: naka-hash, hindi kailanman ipinapakita.'
}

export const pending = {
	title: 'Sinusuri ang rehistro mo',
	body: 'Karaniwang tumatagal ito ng 1–2 oras sa mga araw ng trabaho. Aabisuhan ka namin sa SMS kapag aprubado na.',
	steps: [
		{ title: 'Naipadala ang rehistro', body: 'Natanggap namin ang detalye ng sasakyan at lisensya mo.' },
		{ title: 'Sinusuri ngayon', body: 'Kinukumpirma namin ang lisensya at plaka.' },
		{ title: 'Handa ka nang magbiyahe', body: 'Makikita ka na ng mga pasahero kapag aprubado.' }
	],
	footnote: 'Habang naghihintay, puwede mo pa ring gamitin ang Biyahero bilang pasahero — isang app lang ito.',
	useAsCommuter: 'Gamitin bilang pasahero',
	checking: 'Tinitingnan ang estado…',
	refresh: 'I-refresh ang estado',
	notApproved: 'Hindi pa aprubado ang rehistro mo.',
	approvedTitle: 'Aprubado ka na!',
	approvedBody: 'Makikita ka na ng mga pasahero kapag sinimulan mo ang biyahe.',
	rejectedTitle: 'Hindi naaprubahan ang rehistro',
	rejectedBody: 'Suriin ang dahilan sa ibaba at magpadala ulit ng malinaw na larawan ng lisensya.'
}

export const driverHome = {
	greetingMorning: 'Magandang umaga,',
	greetingAfternoon: 'Magandang hapon,',
	greetingEvening: 'Magandang gabi,',
	offlineNote: 'Offline ka ngayon — hindi ka nakikita ng mga pasahero',
	todayLabel: 'NGAYONG ARAW',
	trips: 'BIYAHE',
	hoursOnline: 'ORAS ONLINE',
	kmTravelled: 'KM NABIYAHE',
	startTrip: 'Simulan ang biyahe',
	locationServicesOff: 'Naka-off ang Location (GPS) ng telepono mo. Buksan ito para makapagsimula ng biyahe.',
	startNote: 'Sisimulan nito ang pagbo-broadcast ng lokasyon mo. Titigil ito kapag tinapos mo ang biyahe.'
}

export const startTrip = {
	title: 'Saan ka papunta?',
	body: 'Sabihin sa mga pasahero kung saan ka patungo ngayong biyahe. Puwede mo itong palitan anumang oras.',
	frequentLabel: 'MADALAS MONG RUTA',
	previewLabel: 'PREVIEW NG RUTA',
	preview: (km, mins) => `~${km} km · tinatayang ${mins} min sa trapiko ngayon`,
	destinationPlaceholder: 'Ilagay ang destinasyon',
	start: 'Simulan ang biyahe',
	needDestination: 'Pumili muna ng destinasyon.',
	suggestionsLabel: 'MGA LUGAR',
	resolveFailed: 'Hindi makuha ang eksaktong lugar. Subukang ituro sa mapa.',
	// Short on purpose: it sits beside the name and the address in a
	// narrow row, where 'ang layo sa iyo' would push the name out.
	away: m => (m < 1000 ? `${m} m` : `${Math.round(m / 1000)} km`),
	searching: 'Naghahanap…',
	noPlaces: 'Walang nahanap na lugar. Subukan ang ibang pangalan o ituro sa mapa.',
	searchFailed: 'Hindi maabot ang paghahanap. Subukan ulit o ituro sa mapa.',
	nearbyLabel: 'MGA RUTA MALAPIT SA IYO',
	recentLabel: 'MGA HULING RUTA MO',
	recentMeta: (km, iso) => `${km} km · huling binyahe ${relativeDay(iso)}`,
	nearbyMeta: (km, m) => `${km} km · dumadaan ${m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`} mula sa iyo`,
	pickOnMap: 'Ituro sa mapa',
	pinHint: 'I-tap ang mapa kung saan ang punta mo',
	pinUse: 'Gamitin ang lugar na ito',
	pinnedFallback: 'Piniling lokasyon',
	viaLabel: 'RUTA MO',
	viaHint: 'May sarili kang ruta? Iguhit mo ito — hindi mo na kailangang maghanap ng punta. Ang dulo ng iginuhit mo ang magiging punta ng biyahe.',
	viaPinned: 'Itinurong kalsada',
	viaRemove: 'Alisin ang puntong ito',
	drawOpen: 'Iguhit ang ruta mo',
	drawEdit: 'Baguhin ang ruta',
	drawHint: 'Mula sa kinaroroonan mo, sunod-sunod na i-tap ang mga kalsadang dinadaanan mo. Ang huling i-tap mo ang punta ng biyahe.',
	drawEmpty: 'I-tap ang mapa para simulan.',
	drawYouAreHere: 'Nandito ka',
	previewDrawn: 'Ito ang iginuhit mo. Susundan nito ang tunay na kalsada kapag sinimulan mo na ang biyahe.',
	previewSnapped: km => `~${km} km sa tunay na kalsada`,
	previewDetour: (road, drawn) =>
		`${road} km ang ruta sa kalsada, pero ${drawn} km lang ang iginuhit mo. Baka may puntong tumapat sa expressway o one-way — subukang ilipat.`,
	drawNeedsLocation: 'Buksan muna ang location. Doon magsisimula ang ruta mo.',
	drawCount: n => (n === 1 ? '1 punto' : `${n} punto`),
	drawUndo: 'Bawiin',
	drawClear: 'Simulan ulit',
	drawDone: 'Gamitin ang rutang ito',
	newRouteNote: 'Ihahanay ang ruta mula mismo sa kinaroroonan mo papunta sa piniling lugar.',
	rerouteTitle: 'Palitan ang destinasyon',
	rerouteBody: 'Ire-ruta ang biyahe mula sa kasalukuyan mong kinaroroonan — tuloy ang takbo ng biyahe.',
	rerouteSubmit: 'Palitan ang ruta',
	rerouted: 'Napalitan ang ruta.'
}

export const activeTrip = {
	liveBanner: 'LIVE — nakikita ka ng mga pasahero',
	notLiveBanner: 'Hindi ka nakikita — pindutin para ayusin',
	notLiveAction: 'Hindi ka nakikita ng mga pasahero. Pindutin para buksan ang Location settings.',
	openProfile: 'Buksan ang profile mo',
	/**
	 * The camera control on the trip screen, one tap per state: free map →
	 * follow (north-up) → navigation (heading-up, tilted, the road ahead on
	 * top). Panning the map drops back to free.
	 */
	followModes: { off: 'Malayang mapa', region: 'Sundan ako', navigation: 'Nabigasyon' },
	heading: dest => `Papuntang ${dest}`,
	elapsed: (mins, km) => `${mins} min na · ${km} km ang nabiyahe`,
	change: 'Palitan',
	capacityPrompt: 'GAANO KAPUNO ANG SASAKYAN MO?',
	end: 'Tapusin ang biyahe',
	endNote: 'Ititigil nito ang pag-broadcast ng lokasyon mo. Mawawala ka agad sa mapa ng mga pasahero.',
	watchingNone: 'Wala pang pasaherong nakatutok sa iyo',
	watchingNoneBody: 'Lalabas dito ang mga pasaherong pumayag na ipakita kung saan sila naghihintay.',
	watchingCount: n => `${n} pasahero ang nakatutok sa iyo`,
	/**
	 * The line that explains the itim na pin. Without it the driver has to guess
	 * what the colour means, and a colour nobody explained is worse than none.
	 */
	watchingOnRoute: n => `${n} nasa ruta mo`,
	watchingNoneOnRoute: 'Wala pa sa ruta mo — nasa gilid sila ng dinadaanan mo',
	watchingNearest: m => `pinakamalapit ${m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`} sa unahan`,
	/** No GPS fix means no honest distance — same rule as freshness.unknown: never invent one. */
	watchingNoFix: "Walang layo hangga't walang GPS"
}

export const driverProfile = {
	totalTrips: 'KABUUANG BIYAHE',
	onRoute: 'SA RUTA',
	/** Replaces the design's ON-TIME figure: nothing records a schedule, so it
	    could only ever be invented. Distance is derived from real trips. */
	totalKm: 'KM NABIYAHE',
	years: n => `${n} taon`,
	/** Deliberate product decision, surfaced in the UI rather than hidden. */
	noRatings: 'Walang rating ang Biyahero — anonymous ang mga pasahero, kaya walang mananagot sa mga review.',
	myVehicle: 'SASAKYAN KO',
	edit: 'Baguhin',
	tripHistory: 'Kasaysayan ng biyahe',
	settingsRow: 'Settings',
	settingsRowHint: 'Wika, tema, at pagpalit ng mode (Sakay/Driver)',
	help: 'Tulong at suporta',
	logout: 'Mag-log out'
}

export const common = {
	back: 'Bumalik',
	close: 'Isara',
	cancel: 'Kanselahin',
	retry: 'Subukan ulit',
	loading: 'Sandali lang…',
	offline: 'Walang koneksyon',
	genericError: 'May naganap na problema. Subukan ulit.',
	showPassword: 'Ipakita ang password',
	hidePassword: 'Itago ang password'
}
