import { Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MaterialIcons } from '@expo/vector-icons'
import { Txt } from '@/components/ui/Txt'
import { useStore } from '@/services/store'
import { useTheme } from '@/theme/useTheme'
import { useCopy } from '@/constants/copy'

/**
 * The standing reminder that one driver can see where this commuter is.
 *
 * The consent outlives the vehicle sheet it was given on — somebody waiting at
 * a corner checks the map, searches a destination, opens Settings, and
 * withdrawing on every one of those would switch the feature off exactly when
 * it matters. That is only defensible while something on screen keeps saying it
 * is on and can stop it in one tap, which is this. So it is mounted once at the
 * root, above every screen, rather than per screen where the next screen added
 * would silently be the one that leaks.
 *
 * A real bar, not an overlay: it takes the top inset for itself and the root
 * layout hands the screens a zero top inset in exchange, so headers, search
 * rows and sheets move down instead of being covered by it.
 *
 * Renders nothing when nobody is watching.
 */
export const WatchingBanner = () => {
	const copy = useCopy()
	const { theme } = useTheme()
	const insets = useSafeAreaInsets()
	const watchingTripId = useStore(s => s.watchingTripId)
	const watchingVehicle = useStore(s => s.watchingVehicle)
	const stopWatchingTrip = useStore(s => s.stopWatchingTrip)

	if (!watchingTripId) return null

	// Signboard and plate, the same pair the list card leads with — a name would
	// be useless here, because nobody picks their ride out of traffic by who is
	// driving it.
	const named = !!watchingVehicle?.destination

	return (
		<Pressable
			onPress={() => stopWatchingTrip()}
			accessibilityRole="button"
			accessibilityLabel={
				named
					? `${watchingVehicle.destination}, ${watchingVehicle.plate}. ${copy.mapHome.watchingStop}`
					: `${copy.mapHome.watching}. ${copy.mapHome.watchingStop}`
			}
			style={{ paddingTop: insets.top }}
			className="border-b-[1.5px] border-brand bg-brand-subtle active:opacity-80"
		>
			<View className="flex-row items-center gap-3 px-6 py-3">
				<MaterialIcons name="visibility" size={20} color={theme.brand.hover} />
				<View className="min-w-0 flex-1">
					{named ? (
						<View className="flex-row items-center gap-2">
							<Txt variant="bodyMStrong" numberOfLines={1} className="shrink">
								{watchingVehicle.destination}
							</Txt>
							{!!watchingVehicle.plate && (
								<Txt variant="monoData" className="text-fg-secondary">{watchingVehicle.plate}</Txt>
							)}
						</View>
					) : (
						<Txt variant="bodyMStrong" numberOfLines={1}>{copy.mapHome.watching}</Txt>
					)}
					<Txt variant="caption" className="text-fg-secondary">{copy.mapHome.watchingStop}</Txt>
				</View>
			</View>
		</Pressable>
	)
}
