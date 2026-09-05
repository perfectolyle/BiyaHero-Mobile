import { useEffect, useRef, useState } from 'react'
import { Keyboard, ScrollView, TextInput, View } from 'react-native'

/** Room left above the keyboard so the field is not flush against it. */
const CLEARANCE = 24

/**
 * A scrolling form that brings the focused field above the keyboard.
 *
 * Android resizes the window when the keyboard opens and its native ScrollView
 * scrolls to whichever child has focus — but only at the moment focus CHANGES.
 * The resize happens after that, so nothing asks again, and a field low on the
 * screen ends up behind the keyboard with the driver typing blind into it. On
 * the vehicle form the BODY NO. input disappeared entirely; only its label
 * stayed visible.
 *
 * KeyboardAvoidingView does not cover this: on Android its behaviour is
 * `undefined`, which renders a plain View and does nothing at all.
 *
 * So: wait for the keyboard, then scroll whatever is focused into view.
 */
export const FormScroll = ({ children, ...props }) => {
	const scroll = useRef(null)
	// Room to actually move. A form deliberately sized to fit one screen has no
	// scrollable range, so scrollTo is a no-op and the keyboard simply covers
	// the lower fields — which is exactly what happened once the vehicle step
	// was compressed to avoid scrolling. The keyboard's own height, added as
	// padding while it is open, gives the scroll somewhere to go.
	const [keyboard, setKeyboard] = useState(0)

	useEffect(() => {
		const bring = () => {
			const focused = TextInput.State.currentlyFocusedInput?.()
			const container = scroll.current?.getNativeScrollRef?.() ?? scroll.current

			if (!focused || !container) return

			focused.measureLayout(
				container,
				(x, y) => scroll.current?.scrollTo({ y: Math.max(0, y - CLEARANCE), animated: true }),
				// A field unmounted between focus and measure has nothing to show.
				() => {}
			)
		}

		const shown = Keyboard.addListener('keyboardDidShow', event => {
			setKeyboard(event.endCoordinates?.height ?? 0)
			// After the padding lands, or there is still nothing to scroll into.
			requestAnimationFrame(bring)
		})

		const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0))

		return () => {
			shown.remove()
			hidden.remove()
		}
	}, [])

	return (
		<ScrollView ref={scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" {...props}>
			{children}
			{/* A spacer, not contentContainerStyle.paddingBottom.

			    Every caller sizes its own bottom padding through
			    contentContainerClassName, and NativeWind compiles that to the
			    same contentContainerStyle prop — so setting it here REPLACED
			    their pb-* rather than adding to it, and with the keyboard shut
			    that meant paddingBottom: 0. The last button on every form sat
			    flush against the bottom edge of the screen.

			    Only mounted while the keyboard is open, because the container's
			    own `gap` would otherwise put a full gap's worth of dead space
			    under the last row to separate it from a zero-height spacer. */}
			{keyboard > 0 && <View style={{ height: keyboard }} />}
		</ScrollView>
	)
}
