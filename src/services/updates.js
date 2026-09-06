import * as Updates from 'expo-updates'

/**
 * Over-the-air updates.
 *
 * The binary on a tester's phone carries a JS bundle; a published update
 * replaces that bundle without another install. expo-updates already checks on
 * launch and swaps the bundle in on the NEXT launch, which for a tester who
 * never closes the app means never — so this exists to fetch it now and offer
 * the reload, rather than waiting for them to kill the app.
 *
 * Disabled in Expo Go and in dev builds, where the bundle comes from Metro and
 * there is nothing to update; every call is then a cheap no-op.
 */
export const isSupported = () => Updates.isEnabled && !__DEV__

/**
 * Ask the server whether there is a newer bundle for this binary, and download
 * it if so. Returns 'ready' only once the bundle is on disk — an update that
 * has not finished downloading cannot be reloaded into.
 */
export const checkForUpdate = async () => {
	if (!isSupported()) return 'none'

	try {
		const check = await Updates.checkForUpdateAsync()
		if (!check.isAvailable) return 'none'

		const fetched = await Updates.fetchUpdateAsync()

		return fetched.isNew ? 'ready' : 'none'
	} catch {
		// A tester on venue wifi is not owed an error about this. The next
		// check, or the next launch, picks it up.
		return 'error'
	}
}

/** Restart into the downloaded bundle. Never returns — the JS context is replaced. */
export const applyUpdate = () => Updates.reloadAsync().catch(() => {})
