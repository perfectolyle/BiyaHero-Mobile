import { useEffect } from 'react'
import { Pressable } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { elevation } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'

const TRACK_W = 52
const TRACK_H = 32
const THUMB = 26
const PAD = (TRACK_H - THUMB) / 2

/**
 * On/off switch, drawn rather than borrowed from the platform.
 *
 * React Native's Switch hands `trackColor` to the Android widget, which then
 * applies its own alpha to it — roughly a third. Any of this theme's off-state
 * greys came back so pale that on a sunken card the control was invisible: the
 * commuter could not tell there was a switch, let alone which way it was set.
 * Drawing it keeps the colours the design system actually chose.
 */
export const Toggle = ({ value, onValueChange, accessibilityLabel, disabled = false }) => {
	const { theme } = useTheme()
	const progress = useSharedValue(value ? 1 : 0)

	useEffect(() => {
		progress.value = withTiming(value ? 1 : 0, { duration: 160 })
	}, [value])

	const track = useAnimatedStyle(() => ({
		backgroundColor: progress.value > 0.5 ? theme.brand.default : theme.border.default
	}))

	const thumb = useAnimatedStyle(() => ({
		transform: [{ translateX: PAD + progress.value * (TRACK_W - THUMB - PAD * 2) }]
	}))

	return (
		<Pressable
			onPress={() => !disabled && onValueChange?.(!value)}
			accessibilityRole="switch"
			accessibilityState={{ checked: value, disabled }}
			accessibilityLabel={accessibilityLabel}
			hitSlop={8}
			style={{ opacity: disabled ? 0.5 : 1 }}
		>
			<Animated.View
				style={[
					track,
					{ width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2, justifyContent: 'center' }
				]}
			>
				<Animated.View
					style={[
						thumb,
						elevation.float,
						{
							width: THUMB,
							height: THUMB,
							borderRadius: THUMB / 2,
							backgroundColor: theme.surface.default
						}
					]}
				/>
			</Animated.View>
		</Pressable>
	)
}
