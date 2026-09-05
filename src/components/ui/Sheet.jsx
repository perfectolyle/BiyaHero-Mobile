import { useEffect, useMemo } from 'react'
import { View, Pressable, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MaterialIcons } from '@expo/vector-icons'
import { elevation } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'

const SPRING = { damping: 20, stiffness: 180, mass: 0.6 }

/**
 * How far a fling carries. The finger leaves the glass at a velocity, and the
 * stop it was heading for matters more than the one it happens to be over —
 * without this a decisive flick that only travelled 30dp snaps straight back.
 */
const FLING_LOOKAHEAD = 0.14

/**
 * Bottom sheet with three positions: full, peek, and — when `miniHeight` is
 * given — mini, a band just tall enough to grab, so the map can have nearly the
 * whole screen. The mini stop shows a chevron, because a sheet that has shrunk
 * to a grabber has to say that there is something above it.
 *
 * `position` drives it from outside ('full' | 'peek' | 'mini'); every drag
 * reports where it landed through `onPositionChange`, so the caller's state and
 * the sheet cannot disagree.
 */
export const Sheet = ({
	children,
	head = null,
	peekHeight = 320,
	// 0 disables the third stop, and the sheet behaves as it always did.
	miniHeight = 0,
	heightRatio = 0.86,
	position = null,
	onPositionChange,
	onExpandedChange
}) => {
	const { height: screenHeight } = useWindowDimensions()
	const insets = useSafeAreaInsets()
	const { theme } = useTheme()

	const sheetHeight = Math.round(screenHeight * heightRatio)
	const yFull = 0
	const yPeek = Math.max(0, sheetHeight - peekHeight)
	const yMini = miniHeight > 0 ? Math.max(yPeek, sheetHeight - miniHeight) : yPeek
	const lowest = yMini

	const translateY = useSharedValue(yPeek)
	const startY = useSharedValue(yPeek)

	const yFor = name => (name === 'full' ? yFull : name === 'mini' ? yMini : yPeek)

	// Driven from outside: selecting a vehicle opens the sheet to its peek, and
	// closing it puts it back. Without this the caller could believe the sheet
	// is open while it sits collapsed under the map.
	useEffect(() => {
		if (!position) return
		translateY.value = withSpring(yFor(position), SPRING)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [position, yPeek, yMini])

	const settle = name => {
		onPositionChange?.(name)
		// Kept for callers that only care about the one bit.
		onExpandedChange?.(name === 'full')
	}

	const pan = useMemo(
		() =>
			Gesture.Pan()
				// The head band holds tappable chips: only a clearly vertical drag
				// may claim the touch, or a sloppy tap twitches the sheet instead
				// of applying the filter. It also lets a horizontal row inside the
				// head scroll without the sheet stealing the gesture.
				.activeOffsetY([-10, 10])
				.failOffsetX([-15, 15])
				.onStart(() => {
					startY.value = translateY.value
				})
				.onUpdate(event => {
					translateY.value = Math.min(lowest, Math.max(yFull, startY.value + event.translationY))
				})
				.onEnd(event => {
					// Where the finger was heading, not where it stopped.
					const projected = translateY.value + event.velocityY * FLING_LOOKAHEAD
					const stops = miniHeight > 0 ? [yFull, yPeek, yMini] : [yFull, yPeek]

					let best = stops[0]
					for (let i = 1; i < stops.length; i++) {
						if (Math.abs(stops[i] - projected) < Math.abs(best - projected)) best = stops[i]
					}

					translateY.value = withSpring(best, SPRING)
					runOnJS(settle)(best === yFull ? 'full' : best === yMini && miniHeight > 0 ? 'mini' : 'peek')
				}),
		[yFull, yPeek, yMini, lowest, miniHeight, onPositionChange, onExpandedChange]
	)

	const style = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))

	return (
		<Animated.View
			style={[
				style,
				elevation.sheet,
				{ height: sheetHeight, paddingBottom: insets.bottom },
				{ position: 'absolute', left: 0, right: 0, bottom: 0 }
			]}
			className="rounded-t-2xl bg-surface"
		>
			{/* Everything above the scrolling list drags the sheet — a 5px grabber
			    alone is a target nobody hits. Pass the static header as `head`. */}
			<GestureDetector gesture={pan}>
				<View>
					<Pressable
						// A tap on the grabber is the same intent as a drag up, and it
						// is the only affordance a collapsed sheet has left.
						onPress={() => {
							const next = translateY.value > (yPeek + yMini) / 2 ? 'peek' : translateY.value > yPeek / 2 ? 'full' : 'peek'
							translateY.value = withSpring(yFor(next), SPRING)
							settle(next)
						}}
						accessibilityRole="button"
						hitSlop={10}
						className="items-center pb-1 pt-[10px]"
					>
						{miniHeight > 0 && (
							<MaterialIcons name="keyboard-arrow-up" size={18} color={theme.icon.muted} style={{ marginBottom: -4 }} />
						)}
						<View className="h-[5px] w-10 rounded-[3px] bg-line" />
					</Pressable>
					{!!head && <View className="px-6">{head}</View>}
				</View>
			</GestureDetector>
			<View className="flex-1 px-6">{children}</View>
		</Animated.View>
	)
}
