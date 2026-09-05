import { useState } from 'react'
import { View, TextInput, Pressable } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { Txt } from './Txt'
import { type } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'
import { useCopy } from '@/constants/copy'

/**
 * Labelled input. `prefix` carries the fixed +63 on the sign-up screen;
 * `mono` switches to JetBrains for plate numbers, which scan faster in mono.
 *
 * Passing `secureTextEntry` also buys an eye toggle. There is no password reset
 * — a driver has no verified email or phone for a link to go to — so a typo
 * made behind dots at registration locks them out of their own account. Being
 * able to read back what was typed is the whole recovery story.
 */
export const Field = ({ label, error, prefix, mono = false, hint, required = false, className = '', ...input }) => {
	const { theme } = useTheme()
	const copy = useCopy()
	const [revealed, setRevealed] = useState(false)

	const secure = !!input.secureTextEntry

	return (
	<View className={`gap-2 ${className}`}>
		{!!label && (
			<Txt variant="labelS" className="text-fg-secondary">
				{label}
				{required && <Txt variant="labelS" className="text-fg-danger"> *</Txt>}
			</Txt>
		)}
		<View
			className={`h-14 flex-row items-center gap-2 rounded-lg border-[1.5px] bg-surface px-4 ${
				error ? 'border-danger' : 'border-line-subtle'
			}`}
		>
			{!!prefix && <Txt variant="bodyL" className="text-fg-secondary">{prefix}</Txt>}
			<TextInput
				style={[mono ? type.monoData : type.bodyL, { flex: 1, color: theme.text.primary, padding: 0 }]}
				placeholderTextColor={theme.icon.muted}
				{...input}
				secureTextEntry={secure && !revealed}
			/>
			{secure && (
				<Pressable
					onPress={() => setRevealed(v => !v)}
					accessibilityRole="button"
					accessibilityLabel={revealed ? copy.common.hidePassword : copy.common.showPassword}
					// Padded out to a real target without growing the row: the
					// box is 56 tall and the icon sits in the middle of it.
					hitSlop={12}
					className="active:opacity-60"
				>
					<MaterialIcons
						name={revealed ? 'visibility-off' : 'visibility'}
						size={20}
						color={theme.icon.secondary}
					/>
				</Pressable>
			)}
		</View>
		{!!error && <Txt variant="caption" className="text-fg-danger">{error}</Txt>}
		{!error && !!hint && <Txt variant="caption" className="text-fg-secondary">{hint}</Txt>}
	</View>
)
}
