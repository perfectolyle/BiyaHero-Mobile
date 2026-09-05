import { create } from 'zustand'

/**
 * Draft state for the three-step driver registration (11 → 12 → 13).
 * Kept out of the main store because it is scratch data: it exists only between
 * the first screen and a successful POST, and is discarded either way.
 */
export const useRegistration = create(set => ({
	/**
	 * True while the vehicle screen is editing the REGISTERED vehicle rather
	 * than drafting a new registration. Set by the profile's Edit action —
	 * carried here instead of a route param, which proved unreliable.
	 */
	editing: false,
	name: '',
	vehicle_type: 'jeepney',
	plate_number: '',
	model: '',
	operator: '',
	body_number: '',
	license_no: '',
	license_expires_at: '',
	/**
	 * Chosen on the licence step and sent once. Never read back: the server
	 * stores a hash, and nothing in the app has a reason to hold this after
	 * the POST — which is also why `reset()` has to clear it.
	 */
	password: '',
	/** Local file URI of the captured licence photo, uploaded on submit. */
	licencePhotoUri: null,
	/**
	 * Local file URI of the vehicle photo. Optional: a driver signing up at the
	 * side of the road may not have a clear shot of their own jeepney, and
	 * refusing to register them over a photograph would be the wrong trade.
	 */
	vehiclePhotoUri: null,

	update: patch => set(patch),

	/** Prefill from the registered vehicle and enter edit mode. */
	beginEdit: vehicle =>
		set({
			editing: true,
			vehicle_type: vehicle.vehicle_type ?? 'jeepney',
			plate_number: vehicle.plate_number ?? '',
			model: vehicle.model ?? '',
			operator: vehicle.operator ?? '',
			body_number: vehicle.body_number ?? '',
			// The stored photo is a URL, not a local file. Held so the edit screen
			// can show what is already on record; only a NEW pick is uploaded.
			vehiclePhotoUri: null,
			vehiclePhotoUrl: vehicle.photo_url ?? null
		}),

	endEdit: () => set({ editing: false }),

	reset: () =>
		set({
			editing: false,
			name: '',
			vehicle_type: 'jeepney',
			plate_number: '',
			model: '',
			operator: '',
			body_number: '',
			license_no: '',
			license_expires_at: '',
			password: '',
			licencePhotoUri: null,
			// The vehicle photo too — both the local pick and the URL an edit
			// session held. Left in place, a fresh sign-up on a shared phone
			// opened on the previous driver's jeepney.
			vehiclePhotoUri: null,
			vehiclePhotoUrl: null
		})
}))
