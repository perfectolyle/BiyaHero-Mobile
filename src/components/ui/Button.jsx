import { Pressable, ActivityIndicator, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { Txt } from './Txt'
import { useTheme } from '@/theme/useTheme'

/** Built per render so icon/spinner colours follow the active theme. */
const tonesFor = theme => ({
	primary: { box: 'bg-brand', text: 'text-fg-on-brand', icon: theme.text.onBrand },
	secondary: { box: 'bg-surface border-[1.5px] border-line-subtle', text: 'text-fg', icon: theme.icon.primary },
	danger: { box: 'bg-danger', text: 'text-fg-inverse', icon: theme.text.inverse },
	ghost: { box: 'bg-transparent', text: 'text-fg-secondary', icon: theme.icon.secondary }
})

/**
 * 56 px tall, not 48 — the driver's primary actions get tapped in a moving
 * vehicle, and these are the only buttons on their screens.
 */
export const Button = ({ label, onPress, tone = 'primary', icon, disabled, loading, className = '' }) => {
	const { theme } = useTheme()
	const TONES = tonesFor(theme)
	const t = TONES[tone] ?? TONES.primary
	const inert = disabled || loading
	// A disabled button is a colour, not a translucency. `opacity-40` reads fine
	// over white — a pale yellow — but over a near-black canvas the same brand
	// yellow goes olive, and it drags the near-black label down with it until
	// the word is barely there. Loading keeps the tone it had, because a button
	// mid-request is still the button you pressed.
	const off = disabled && !loading
	const box = off ? 'bg-surface-sunken border-[1.5px] border-line-subtle' : t.box
	const textClass = off ? 'text-fg-secondary' : t.text
	const iconColour = off ? theme.icon.muted : t.icon

	return (
		<Pressable
			onPress={onPress}
			disabled={inert}
			accessibilityRole="button"
			accessibilityState={{ disabled: !!inert, busy: !!loading }}
			className={`h-14 flex-row items-center justify-center gap-2 rounded-lg px-6 ${box} ${loading ? 'opacity-60' : inert ? '' : 'active:opacity-80'} ${className}`}
		>
			{loading ? (
				<ActivityIndicator color={iconColour} />
			) : (
				<View className="flex-row items-center gap-2">
					{!!icon && <MaterialIcons name={icon} size={20} color={iconColour} />}
					<Txt variant="bodyMStrong" className={textClass}>{label}</Txt>
				</View>
			)}
		</Pressable>
	)
}
