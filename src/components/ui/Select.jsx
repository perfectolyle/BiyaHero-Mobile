import { useState } from 'react'
import { View, Pressable, Modal } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { Txt } from './Txt'
import { useTheme } from '@/theme/useTheme'
import { useCopy } from '@/constants/copy'

/**
 * A labelled picker that reads as a Field.
 *
 * The vehicle type was four tiles in a two-by-two grid — about 270dp for a
 * choice that is made once and almost always left on its default. That is the
 * single largest block on the registration step, and it is what pushed the rest
 * of the form off the screen.
 *
 * Options are chosen from a sheet rather than an inline expansion, so the
 * closed height is fixed at one row no matter how many there are, and the open
 * list never pushes the fields below it around.
 *
 * `renderIcon` is optional; the vehicle picker uses it to keep the glyph that
 * made the tiles readable at a glance.
 */
export const Select = ({ label, value, options, onChange, renderIcon, hint, className = '' }) => {
	const { theme } = useTheme()
	const copy = useCopy()
	const [open, setOpen] = useState(false)

	const current = options.find(o => o.value === value)

	return (
		<View className={`gap-2 ${className}`}>
			{!!label && <Txt variant="labelS" className="text-fg-secondary">{label}</Txt>}

			<Pressable
				onPress={() => setOpen(true)}
				accessibilityRole="button"
				accessibilityLabel={`${label}: ${current?.label ?? ''}`}
				className="h-14 flex-row items-center gap-3 rounded-lg border-[1.5px] border-line-subtle bg-surface px-4 active:opacity-80"
			>
				{!!renderIcon && current && renderIcon(current.value)}
				<Txt variant="bodyL" className="min-w-0 flex-1">{current?.label ?? ''}</Txt>
				<MaterialIcons name="expand-more" size={22} color={theme.icon.secondary} />
			</Pressable>

			{!!hint && <Txt variant="caption" className="text-fg-secondary">{hint}</Txt>}

			<Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
				<Pressable className="flex-1 justify-end bg-black/40" onPress={() => setOpen(false)}>
					{/* Swallows taps so pressing the sheet itself does not dismiss it. */}
					<Pressable onPress={() => {}} className="gap-1 rounded-t-2xl bg-surface px-6 pb-8 pt-5">
						<View className="flex-row items-center justify-between pb-2">
							<Txt variant="headingS">{label}</Txt>
							<Pressable
								onPress={() => setOpen(false)}
								accessibilityRole="button"
								accessibilityLabel={copy.common.close}
								className="h-10 w-10 items-center justify-center rounded-full bg-surface-sunken active:opacity-70"
							>
								<MaterialIcons name="close" size={20} color={theme.icon.secondary} />
							</Pressable>
						</View>

						{options.map(option => {
							const active = option.value === value

							return (
								<Pressable
									key={option.value}
									onPress={() => {
										onChange(option.value)
										setOpen(false)
									}}
									accessibilityRole="radio"
									accessibilityState={{ selected: active }}
									// 56 clears the 48 floor, and the driver is tapping this
									// one-handed at the side of a road.
									className="h-14 flex-row items-center gap-3 rounded-lg px-2 active:opacity-70"
								>
									{!!renderIcon && renderIcon(option.value)}
									<Txt variant="bodyL" className="min-w-0 flex-1">{option.label}</Txt>
									{/* A tick as well as the weight: the design system does not
									    let a state ride on colour alone. */}
									{active && <MaterialIcons name="check" size={22} color={theme.brand.hover} />}
								</Pressable>
							)
						})}
					</Pressable>
				</Pressable>
			</Modal>
		</View>
	)
}
