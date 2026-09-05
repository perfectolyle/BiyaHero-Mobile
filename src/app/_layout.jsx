import { useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import { MaterialIcons } from '@expo/vector-icons'
import {
	PlusJakartaSans_400Regular,
	PlusJakartaSans_500Medium,
	PlusJakartaSans_600SemiBold,
	PlusJakartaSans_700Bold,
	PlusJakartaSans_800ExtraBold
} from '@expo-google-fonts/plus-jakarta-sans'
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useStore } from '@/services/store'
import { usePrefs } from '@/services/prefs'
import { useTheme } from '@/theme/useTheme'
import { Splash } from '@/components/Splash'
import { Toast } from '@/components/Toast'
import { WatchingBanner } from '@/components/WatchingBanner'
import '../global.css'

export default function RootLayout() {
	const hydrate = useStore(s => s.hydrate)
	const hydrated = useStore(s => s.hydrated)
	const hydratePrefs = usePrefs(s => s.hydrate)
	const prefsHydrated = usePrefs(s => s.hydrated)
	const { vars } = useTheme()
	const insets = useSafeAreaInsets()
	const watching = useStore(s => !!s.watchingTripId)
	const [minimumElapsed, setMinimumElapsed] = useState(false)

	// The watching bar is a real bar: it eats the top inset, so the screens
	// beneath it must stop adding their own or every header sits a notch too
	// low. Overriding the context beats touching each screen — the next screen
	// somebody adds inherits it instead of quietly overlapping the bar.
	const screenInsets = useMemo(
		() => (watching ? { ...insets, top: 0 } : insets),
		[watching, insets.top, insets.bottom, insets.left, insets.right]
	)

	const [fontsLoaded] = useFonts({
		// @expo/vector-icons loads its font lazily on first use, which a map
		// marker cannot survive: Android rasterises the marker into a bitmap
		// and freezes it, so a glyph that was still a missing-character box
		// stays a box forever. Held with the text fonts so it is up first.
		...MaterialIcons.font,
		PlusJakartaSans_400Regular,
		PlusJakartaSans_500Medium,
		PlusJakartaSans_600SemiBold,
		PlusJakartaSans_700Bold,
		PlusJakartaSans_800ExtraBold,
		JetBrainsMono_500Medium,
		JetBrainsMono_700Bold
	})

	useEffect(() => {
		hydrate()
		hydratePrefs()
		// Hold the splash briefly even on a fast device — a 90 ms flash of the
		// brand reads as a glitch rather than a launch.
		const timer = setTimeout(() => setMinimumElapsed(true), 900)
		return () => clearTimeout(timer)
	}, [])

	const ready = fontsLoaded && hydrated && prefsHydrated && minimumElapsed

	// The vars wrapper is what makes every `bg-*`/`text-*` class resolve to the
	// active theme — one style object re-colours the whole tree.
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<View style={vars} className="flex-1 bg-surface-canvas">
				{ready ? (
					<>
						<WatchingBanner />
						<SafeAreaInsetsContext.Provider value={screenInsets}>
							<Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
						</SafeAreaInsetsContext.Provider>
						<Toast />
					</>
				) : (
					<Splash />
				)}
			</View>
		</GestureHandlerRootView>
	)
}
