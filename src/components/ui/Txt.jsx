import { Text } from 'react-native'
import { type } from '@/theme/tokens'

/**
 * Every piece of text in the app goes through here.
 * `variant` picks a step off the Figma type ramp (family + size + leading +
 * tracking travel together); colour stays a className so it reads at the callsite.
 *
 * `text-fg` is prepended rather than defaulted. As a default parameter it was
 * silently dropped the moment a caller passed a className for anything else —
 * `min-w-0 flex-1` on a row that only wanted to shrink — and that text then had
 * no colour at all. On the light theme the fallback happened to look close
 * enough to read; on the dark one it rendered near-black on a near-black sheet,
 * which is how the vehicle-type options came to be barely visible. Prepending
 * means a caller's own `text-*` still wins, because the later class does.
 */
export const Txt = ({ variant = 'bodyM', className = '', style, children, ...rest }) => (
	<Text style={[type[variant], style]} className={`text-fg ${className}`} {...rest}>
		{children}
	</Text>
)
