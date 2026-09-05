import { useState } from 'react'
import { View, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '@/components/ui/Screen'
import { FormScroll } from '@/components/ui/FormScroll'
import { Txt } from '@/components/ui/Txt'
import { Header } from '@/components/ui/Header'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { useStore } from '@/services/store'
import { useCopy } from '@/constants/copy'
import { resetTo } from '@/services/nav'

/**
 * Returning driver. LICENCE + PLATE say which driver; the PASSWORD proves it.
 *
 * The first two were once the whole credential, on the theory that the pair was
 * hard to guess. Guessing was never the threat: the plate is painted on the
 * side of the vehicle and the licence is handed over at every checkpoint, so
 * anyone standing at a terminal with a phone camera could collect both and then
 * broadcast a position under that driver's name. The pair is now the account
 * name and nothing more. Still no OTP — an SMS gateway is a bill and a
 * dependency, and a password the driver picks closes the actual hole.
 */
export default function DriverLogin() {
	const copy = useCopy()
	const router = useRouter()
	const login = useStore(s => s.login)

	const [licence, setLicence] = useState('')
	const [plate, setPlate] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState(null)
	const [busy, setBusy] = useState(false)

	const ready = licence.trim().length >= 9 && plate.trim().length >= 3 && password.length > 0

	const submit = async () => {
		setBusy(true)
		setError(null)

		try {
			// The password is sent as typed — trimming it here would silently
			// disagree with what was registered.
			await login({ license_no: licence.trim(), plate_number: plate.trim(), password })
			resetTo(router, '/driver')
		} catch (e) {
			setError(e?.response?.status === 404 ? copy.login.notFound : copy.common.genericError)
		} finally {
			setBusy(false)
		}
	}

	return (
		<Screen>
			<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
				<FormScroll contentContainerClassName="pb-6 pt-4 gap-6 flex-grow">
					<Header eyebrow={copy.login.eyebrow} title={copy.login.title} />

					<Txt variant="bodyM" className="text-fg-secondary">{copy.login.body}</Txt>

					<Field
						label={copy.login.licenceLabel}
						placeholder={copy.login.licencePlaceholder}
						value={licence}
						onChangeText={value => setLicence(value.toUpperCase())}
						autoCapitalize="characters"
						autoCorrect={false}
						mono
					/>

					<Field
						label={copy.login.plateLabel}
						placeholder={copy.login.platePlaceholder}
						value={plate}
						onChangeText={value => setPlate(value.toUpperCase())}
						autoCapitalize="characters"
						autoCorrect={false}
						mono
					/>

					{/* The failure message lives on the last field, not the
					    plate: the server refuses to say which of the three was
					    wrong, so pinning it under the plate blamed a field that
					    may well have been right. */}
					<Field
						label={copy.login.passwordLabel}
						placeholder={copy.login.passwordPlaceholder}
						value={password}
						onChangeText={setPassword}
						secureTextEntry
						autoCapitalize="none"
						autoCorrect={false}
						textContentType="password"
						onSubmitEditing={() => ready && submit()}
						returnKeyType="go"
						hint={copy.login.hint}
						error={error}
					/>

					<View className="flex-1" />

					<View className="gap-3">
						<Button label={copy.login.submit} onPress={submit} loading={busy} disabled={!ready} />
						{/* The way back to registration, as a control rather than a
						    line of grey text among other grey text — the same
						    mistake this screen's counterpart was making. */}
						<Button
							label={copy.login.noAccount}
							tone="secondary"
							// Pop when registration is what we came from, or the stack held
							// two copies of the vehicle form and Back appeared to do nothing.
							onPress={() => (router.canGoBack() ? router.back() : router.replace('/driver/vehicle'))}
						/>
					</View>
				</FormScroll>
			</KeyboardAvoidingView>
		</Screen>
	)
}
