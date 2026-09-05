import { useEffect, useRef } from 'react'
import { Keyboard, ScrollView, TextInput } from 'react-native'

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

	useEffect(() => {
		const shown = Keyboard.addListener('keyboardDidShow', () => {
			const focused = TextInput.State.currentlyFocusedInput?.()
			const container = scroll.current?.getNativeScrollRef?.() ?? scroll.current

			if (!focused || !container) return

			focused.measureLayout(
				container,
				(x, y) => scroll.current?.scrollTo({ y: Math.max(0, y - CLEARANCE), animated: true }),
				// A field unmounted between focus and measure has nothing to show.
				() => {}
			)
		})

		return () => shown.remove()
	}, [])

	return (
		<ScrollView ref={scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" {...props}>
			{children}
		</ScrollView>
	)
}
