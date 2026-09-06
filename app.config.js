require('dotenv/config')

module.exports = ({ config }) => ({
	...config,
	name: 'Biyahero',
	slug: 'biyahero',
	scheme: 'biyahero',
	version: '1.0.15',
	orientation: 'portrait',
	icon: './src/assets/icon.png',
	userInterfaceStyle: 'light',
	/*
	 * Over-the-air updates, so a tester does not have to be handed a new APK for
	 * every JS change.
	 *
	 * `appVersion` ties an update to the `version` above: a build only accepts
	 * updates published against the same version string, which is what stops a
	 * JS bundle expecting a native module the installed binary does not have.
	 * Bumping `version` therefore REQUIRES a fresh install, and anything that
	 * changes native code — a new native module, a permission, the Maps key —
	 * does too. Everything else can go out with `eas update`.
	 *
	 * The channel is named here rather than left to EAS Build, because these
	 * APKs are built locally with gradle; without it a local build subscribes
	 * to nothing and would never see an update.
	 */
	runtimeVersion: { policy: 'appVersion' },
	updates: {
		url: 'https://u.expo.dev/7556787b-9d13-409d-996a-42a640c6de1d',
		requestHeaders: { 'expo-channel-name': 'sqa' },
		// A tester on venue wifi should get the app, not a spinner: launch on
		// what is already on the device and fetch the new bundle behind it.
		fallbackToCacheTimeout: 0
	},
	ios: {
		supportsTablet: true,
		bundleIdentifier: 'com.anonymous.biyahero',
		config: {
			googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
		}
	},
	android: {
		adaptiveIcon: {
			// The launcher masks the foreground to its own shape and crops ~28%,
			// so the artwork is inset on a transparent canvas over a flat white.
			backgroundColor: '#FFFFFF',
			foregroundImage: './src/assets/icon-foreground.png',
			monochromeImage: './src/assets/icon-foreground.png'
		},
		package: 'com.anonymous.biyahero',
		config: {
			googleMaps: {
				apiKey: process.env.GOOGLE_MAPS_API_KEY
			}
		}
	},
	web: {
		bundler: 'metro',
		favicon: './src/assets/icon.png'
	},
	plugins: [
		'expo-router',
		'@react-native-community/datetimepicker',
		[
			'expo-image-picker',
			{
				photosPermission:
					'Pumili ng larawan ng sasakyan mo para makilala ito ng mga pasahero.'
			}
		],
		[
			'expo-camera',
			{
				cameraPermission:
					'Ginagamit ang camera para kunan ng larawan ang lisensya mo para sa beripikasyon.'
			}
		],
		[
			'expo-location',
			{
				// Drivers only, and only while a trip is running.
				locationAlwaysAndWhenInUsePermission:
					'Ginagamit ang lokasyon mo habang may biyahe ka para makita ka ng mga pasahero.'
			}
		]
	],
	extra: {
		apiUrl: process.env.API_URL,
		router: {},
		eas: {
			projectId: '7556787b-9d13-409d-996a-42a640c6de1d'
		}
	}
})
