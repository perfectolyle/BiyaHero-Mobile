import { View, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
import { Txt } from './Txt'
import { useTheme } from '@/theme/useTheme'
import { useCopy } from '@/constants/copy'

/** Back affordance + title. `eyebrow` carries the step label on the driver wizard. */
export const Header = ({ title, eyebrow, onBack, right, compact = false, className = '' }) => {
	const copy = useCopy()
	const { theme } = useTheme()
	const router = useRouter()
	const goBack = onBack || (() => (router.canGoBack() ? router.back() : router.replace('/')))

	return (
		// `compact` is for a step whose FIELDS are the content: the chrome gives
		// back its spacing and a size, rather than the form losing a note.
		<View className={`${compact ? "gap-2" : "gap-4"} ${className}`}>
			<View className="flex-row items-center justify-between">
				<Pressable
					onPress={goBack}
					accessibilityRole="button"
					accessibilityLabel={copy.common.back}
					hitSlop={8}
					className="h-12 w-12 items-center justify-center rounded-lg border-[1.5px] border-line-subtle bg-surface active:opacity-80"
				>
					<MaterialIcons name="arrow-back" size={22} color={theme.icon.primary} />
				</Pressable>
				{right}
			</View>
			{!!eyebrow && <Txt variant="labelS" className="text-brand-hover">{eyebrow}</Txt>}
			{!!title && <Txt variant={compact ? "headingL" : "displayS"}>{title}</Txt>}
		</View>
	)
}
