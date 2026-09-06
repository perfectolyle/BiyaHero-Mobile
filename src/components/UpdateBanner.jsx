import { useEffect } from 'react'
import { AppState, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MaterialIcons } from '@expo/vector-icons'
import { useUpdates } from 'expo-updates'
import { Txt } from '@/components/ui/Txt'
import { checkForUpdate, applyUpdate, isSupported } from '@/services/updates'
import { elevation } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'
import { useCopy } from '@/constants/copy'

/**
 * "A new version is ready — tap to reload."
 *
 * Shown only once a new bundle is fully DOWNLOADED, so the tap is a reload
 * rather than a spinner over an unknown wait.
 *
 * `isUpdatePending` is the source of truth, not our own check. expo-updates
 * fetches on launch all by itself, so by the time this component asked, the
 * server had nothing newer to offer and the check came back empty — while a
 * downloaded update sat waiting for a relaunch that a tester never performs.
 * The hook reports that pending bundle however it arrived: the launch fetch,
 * our foreground check, or a pull on the list.
 *
 * Deliberately not automatic. Reloading yanks the screen out from under
 * whoever is mid-tap, and a driver mid-trip must not lose their run to a
 * cosmetic update, so the choice stays theirs.
 */
export const UpdateBanner = () => {
	const copy = useCopy()
	const { theme } = useTheme()
	const insets = useSafeAreaInsets()
	const { isUpdatePending } = useUpdates()

	// The check on mount is not (only) about finding a new bundle — it is how
	// the hook learns what native already knows. expo-updates downloads on
	// launch, and that download routinely finishes before this JS has a
	// listener attached, so the pending flag lands in a state-change event
	// nobody is listening for yet and the hook seeds `false` from a context
	// captured earlier. Asking native anything re-emits the current context,
	// pending flag included. Coming back to the foreground is worth a fresh
	// ask for the ordinary reason: it is when a tester actually looks.
	useEffect(() => {
		if (!isSupported()) return

		checkForUpdate()
		const sub = AppState.addEventListener('change', state => {
			if (state === 'active') checkForUpdate()
		})

		return () => sub.remove()
	}, [])

	if (!isUpdatePending) return null

	return (
		<Pressable
			onPress={applyUpdate}
			accessibilityRole="button"
			accessibilityLabel={copy.common.updateReady}
			style={{ bottom: insets.bottom + 24, ...elevation.float }}
			className="absolute max-w-[88%] self-center flex-row items-center gap-2 rounded-full bg-surface-inverse px-4 py-3 active:opacity-80"
		>
			<MaterialIcons name="refresh" size={18} color={theme.text.inverse} />
			<Txt variant="labelL" numberOfLines={1} className="text-fg-inverse">{copy.common.updateReady}</Txt>
		</Pressable>
	)
}
