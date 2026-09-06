import { useEffect, useState } from 'react'
import { AppState, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MaterialIcons } from '@expo/vector-icons'
import { Txt } from '@/components/ui/Txt'
import { checkForUpdate, applyUpdate } from '@/services/updates'
import { elevation } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'
import { useCopy } from '@/constants/copy'

/**
 * "A new version is ready — tap to reload."
 *
 * Shown only once a new bundle is fully downloaded, so the tap is instant
 * rather than a spinner over an unknown wait. It checks on mount and every
 * time the app comes back to the foreground, which is when a tester who has
 * been handed "try it again now" actually looks.
 *
 * Deliberately not automatic: reloading yanks the screen out from under
 * whoever is mid-tap, and a driver mid-trip must never lose their run to a
 * cosmetic update. The choice stays theirs.
 */
export const UpdateBanner = () => {
	const copy = useCopy()
	const { theme } = useTheme()
	const insets = useSafeAreaInsets()
	const [ready, setReady] = useState(false)

	useEffect(() => {
		let alive = true

		const look = async () => {
			if (await checkForUpdate() === 'ready' && alive) setReady(true)
		}

		look()
		const sub = AppState.addEventListener('change', state => {
			if (state === 'active') look()
		})

		return () => {
			alive = false
			sub.remove()
		}
	}, [])

	if (!ready) return null

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
