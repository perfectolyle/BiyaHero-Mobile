import { useEffect, useState } from 'react'
import { View, Image, Pressable, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
import { Screen } from '@/components/ui/Screen'
import { FormScroll } from '@/components/ui/FormScroll'
import { Txt } from '@/components/ui/Txt'
import { Header } from '@/components/ui/Header'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { VehicleGlyph } from '@/components/VehicleGlyph'
import { useRegistration } from '@/services/registration'
import { useStore } from '@/services/store'
import * as ImagePicker from 'expo-image-picker'
import { updateVehicle } from '@/services/api'
import { VEHICLE_TYPES, VEHICLE_LABELS } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'
import { useCopy } from '@/constants/copy'

/**
 * 12 · Vehicle Details. Type is picked by silhouette, the way it is on the road.
 *
 * Doubles as the EDIT screen (?edit=1 from the profile): fields prefill from
 * the registered vehicle and save via PATCH instead of continuing to the
 * licence step. The plate is half the login credential, so editing it changes
 * what the driver types to log in — the screen says so.
 */
export default function VehicleDetails() {
	const copy = useCopy()
	const { theme } = useTheme()
	const router = useRouter()
	const { vehicle_type, plate_number, model, operator, body_number, editing, vehiclePhotoUri, vehiclePhotoUrl } = useRegistration()
	const update = useRegistration(s => s.update)

	const driver = useStore(s => s.driver)
	const refreshMe = useStore(s => s.refreshMe)
	const showToast = useStore(s => s.showToast)

	const isEdit = editing && !!driver?.vehicle
	const [error, setError] = useState(null)
	const [saving, setSaving] = useState(false)

	// Leaving the screen ends edit mode, so a later registration starts clean.
	const endEdit = useRegistration(s => s.endEdit)
	useEffect(() => () => endEdit(), [])

	/**
	 * Camera or gallery, their choice: a driver at the terminal can shoot the
	 * jeepney in front of them, and one signing up at home has it in their roll.
	 * Compressed on the way out — this is a thumbnail on a card, not evidence,
	 * and a 12 MP original is a slow upload on mobile data for no visible gain.
	 */
	const pickPhoto = async fromCamera => {
		const picker = fromCamera
			? ImagePicker.launchCameraAsync
			: ImagePicker.launchImageLibraryAsync

		const permission = fromCamera
			? await ImagePicker.requestCameraPermissionsAsync()
			: await ImagePicker.requestMediaLibraryPermissionsAsync()

		if (!permission.granted) return showToast(copy.vehicleDetails.photoDenied)

		const result = await picker({ mediaTypes: ['images'], quality: 0.6, allowsEditing: true, aspect: [4, 3] })
		if (!result.canceled && result.assets?.[0]) update({ vehiclePhotoUri: result.assets[0].uri })
	}

	// The photo is what a commuter matches from a corner — a plate is only
	// readable once the jeepney has already arrived. Required, not optional.
	const hasPhoto = !!(vehiclePhotoUri || vehiclePhotoUrl)

	const next = () => {
		if (!plate_number.trim()) return setError(copy.vehicleDetails.invalidPlate)
		if (!hasPhoto) return setError(copy.vehicleDetails.needPhoto)
		setError(null)
		router.push('/driver/licence')
	}

	const save = async () => {
		if (!plate_number.trim()) return setError(copy.vehicleDetails.invalidPlate)
		if (!hasPhoto) return setError(copy.vehicleDetails.needPhoto)
		setError(null)
		setSaving(true)

		try {
			await updateVehicle({
				vehicle_type,
				plate_number: plate_number.trim(),
				model: model.trim() || undefined,
				operator: operator.trim() || undefined,
				body_number: body_number.trim() || undefined,
				vehiclePhotoUri
			})
			await refreshMe()
			showToast(copy.vehicleDetails.saved)
			router.back()
		} catch {
			showToast(copy.common.genericError)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Screen>
			<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
				<FormScroll contentContainerClassName="pb-4 pt-2 gap-3 flex-grow">
					<View className="gap-2">
						<Header
							compact
							eyebrow={copy.vehicleDetails.eyebrow}
							title={isEdit ? copy.vehicleDetails.editTitle : copy.vehicleDetails.title}
							right={isEdit ? null : <Txt variant="labelS" className="text-fg-secondary">{copy.signUp.step(1, 2)}</Txt>}
						/>
						{/* Under the title rather than a section of its own: it is the
						    reason for the form, not a step in it. */}
						<Txt variant="caption" className="text-fg-secondary">{copy.vehicleDetails.body}</Txt>
					</View>

					{/* One row instead of a two-by-two grid of tiles. The grid cost
					    ~270dp for a choice made once and usually left on its default,
					    and it is what pushed the rest of this step off the screen. The
					    glyph is kept, so the type is still readable at a glance. */}
					<Select
						label={copy.vehicleDetails.typeLabel}
						value={vehicle_type}
						onChange={value => update({ vehicle_type: value })}
						options={VEHICLE_TYPES.map(t => ({ value: t, label: VEHICLE_LABELS[t] }))}
						renderIcon={t => <VehicleGlyph type={t} width={28} color={theme.icon.primary} />}
					/>

					<View className="gap-2">
						<Txt variant="labelS" className="text-fg-secondary">{copy.vehicleDetails.photoLabel}</Txt>

						{/* A thumbnail in a row the same height as the two buttons it
						    replaces. A full-width preview grew this step by 64dp the
						    moment a photo was chosen, which is exactly what pushed the
						    form into scrolling. */}
						{vehiclePhotoUri || vehiclePhotoUrl ? (
							<View className="h-14 flex-row items-center gap-2 overflow-hidden rounded-lg border-[1.5px] border-line-subtle bg-surface pl-2 pr-1">
								{/* Replace and remove are separate targets. With only a
								    replace row there was no way to undo a wrong picture
								    except by choosing another one. */}
								<Pressable
									onPress={() => pickPhoto(false)}
									accessibilityRole="button"
									accessibilityLabel={copy.vehicleDetails.photoRetake}
									className="h-full min-w-0 flex-1 flex-row items-center gap-3 active:opacity-70"
								>
									<Image
										source={{ uri: vehiclePhotoUri ?? vehiclePhotoUrl }}
										className="h-10 w-16 rounded"
										resizeMode="cover"
									/>
									<Txt variant="bodyMStrong" numberOfLines={1} className="min-w-0 flex-1">
										{copy.vehicleDetails.photoRetake}
									</Txt>
								</Pressable>
								<Pressable
									onPress={() => update({ vehiclePhotoUri: null, vehiclePhotoUrl: null })}
									accessibilityRole="button"
									accessibilityLabel={copy.vehicleDetails.photoRemove}
									className="h-12 w-12 items-center justify-center rounded-lg active:opacity-70"
								>
									<MaterialIcons name="close" size={20} color={theme.icon.secondary} />
								</Pressable>
							</View>
						) : (
							<View className="flex-row gap-3">
								<Pressable
									onPress={() => pickPhoto(true)}
									accessibilityRole="button"
									className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-lg border-[1.5px] border-line-subtle bg-surface active:opacity-80"
								>
									<MaterialIcons name="photo-camera" size={18} color={theme.icon.primary} />
									<Txt variant="bodyMStrong">{copy.vehicleDetails.photoTake}</Txt>
								</Pressable>
								<Pressable
									onPress={() => pickPhoto(false)}
									accessibilityRole="button"
									className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-lg border-[1.5px] border-line-subtle bg-surface active:opacity-80"
								>
									<MaterialIcons name="photo-library" size={18} color={theme.icon.primary} />
									<Txt variant="bodyMStrong">{copy.vehicleDetails.photoPick}</Txt>
								</Pressable>
							</View>
						)}

						{/* The photo is the one requirement a driver would not guess:
						    it used to be optional, and nothing else on this step says
						    so. Every other unmarked field is required by the same
						    convention; the optional ones say so on their label. */}
						<Txt variant="caption" className="text-fg-secondary">{copy.vehicleDetails.photoNote}</Txt>
					</View>

					<Field
						label={copy.vehicleDetails.plateLabel}
						placeholder={copy.vehicleDetails.platePlaceholder}
						value={plate_number}
						onChangeText={value => update({ plate_number: value.toUpperCase() })}
						autoCapitalize="characters"
						mono
						hint={isEdit ? copy.vehicleDetails.editPlateNote : copy.vehicleDetails.plateNote}
						error={error}
					/>

					{/* Its own field, not swapped in by vehicle type. A bus has BOTH a
					    company and a model, and plenty of jeepneys run under a
					    cooperative — deciding for the driver which of the two they are
					    allowed to state was the wrong call. */}
					<Field
						label={copy.vehicleDetails.operatorLabel}
						placeholder={copy.vehicleDetails.operatorPlaceholder}
						value={operator}
						onChangeText={value => update({ operator: value })}
						autoCapitalize="words"
					/>

					<View className="flex-row gap-3">
						<Field
							className="flex-1"
							label={copy.vehicleDetails.modelLabel}
							placeholder={copy.vehicleDetails.modelPlaceholder}
							value={model}
							onChangeText={value => update({ model: value })}
						/>

						<Field
							className="w-[34%]"
							label={copy.vehicleDetails.bodyLabel}
							placeholder={copy.vehicleDetails.bodyPlaceholder}
							value={body_number}
							onChangeText={value => update({ body_number: value })}
							mono
						/>
					</View>

					{/* Full width, not the field's own hint: the body column is a
					    third of the screen and wrapped this to three lines.
					    It asked for a number without saying which one, and a
					    jeepney carries two. */}
					<Txt variant="caption" className="-mt-2 text-fg-secondary">{copy.vehicleDetails.bodyNote}</Txt>

					<View className="flex-1" />

					<View className="gap-3">
						{isEdit ? (
							<Button label={copy.vehicleDetails.save} onPress={save} loading={saving} disabled={!plate_number.trim() || !hasPhoto} />
						) : (
							<>
								<Button label={copy.vehicleDetails.continue} onPress={next} disabled={!plate_number.trim() || !hasPhoto} />
								<Button
									label={copy.signUp.haveAccount}
									tone="secondary"
									onPress={() => router.push('/driver/login')}
								/>
								<Txt variant="caption" className="text-center text-fg-secondary">{copy.signUp.terms}</Txt>
							</>
						)}
					</View>
				</FormScroll>
			</KeyboardAvoidingView>
		</Screen>
	)
}
