import { useState } from 'react'
import { Pressable, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { MaterialIcons } from '@expo/vector-icons'
import { Txt } from './Txt'
import { useTheme } from '@/theme/useTheme'

/** What the API takes, and the only format that survives a timezone. */
const iso = date =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/**
 * A date, picked rather than typed.
 *
 * The licence expiry used to be a plain text input asking for YYYY-MM-DD, which
 * put the whole burden of the format on a driver holding a licence card: a
 * slash, a two-digit year or a day-first reading all failed server-side, after
 * the photo had already been taken and uploaded. The picker cannot produce an
 * unparseable value, and it cannot produce a past one either — an expired
 * licence is refused at registration, so offering those dates is offering a
 * dead end.
 */
export const DateField = ({ label, value, onChange, placeholder, error, minimumDate, className = '' }) => {
	const { theme } = useTheme()
	const [open, setOpen] = useState(false)

	const selected = value ? new Date(value) : null
	const valid = selected && !Number.isNaN(selected.getTime())

	return (
		<View className={`gap-2 ${className}`}>
			{!!label && <Txt variant="labelS" className="text-fg-secondary">{label}</Txt>}

			<Pressable
				onPress={() => setOpen(true)}
				accessibilityRole="button"
				accessibilityLabel={label}
				accessibilityValue={{ text: valid ? value : placeholder }}
				className={`h-14 flex-row items-center justify-between rounded-lg border-[1.5px] bg-surface px-4 active:opacity-80 ${
					error ? 'border-danger' : 'border-line-subtle'
				}`}
			>
				<Txt variant="monoData" className={valid ? 'text-fg' : 'text-fg-muted'}>
					{valid ? value : placeholder}
				</Txt>
				<MaterialIcons name="event" size={20} color={theme.icon.secondary} />
			</Pressable>

			{!!error && <Txt variant="caption" className="text-fg-danger">{error}</Txt>}

			{open && (
				<DateTimePicker
					mode="date"
					display="calendar"
					// A licence card in the hand is the source of truth, so it opens
					// on what is already chosen rather than on today.
					value={valid ? selected : (minimumDate ?? new Date())}
					minimumDate={minimumDate}
					onChange={(event, date) => {
						setOpen(false)
						if (event.type === 'set' && date) onChange(iso(date))
					}}
				/>
			)}
		</View>
	)
}
