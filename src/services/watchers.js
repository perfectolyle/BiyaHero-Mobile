import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'biyahero.watcher'
const HEX = '0123456789abcdef'

const generate = () => Array.from({ length: 32 }, () => HEX[Math.floor(Math.random() * 16)]).join('')

const load = async () => {
	const fresh = generate()

	try {
		const saved = await AsyncStorage.getItem(KEY)
		if (saved) return saved

		await AsyncStorage.setItem(KEY, fresh)
	} catch {
		// A device that cannot persist can still opt in; it just gets a new id
		// after a restart, and the server's freshness window collects the old row.
	}

	return fresh
}

let pending = null

/**
 * A stable anonymous id for THIS DEVICE, so an opt-in can be withdrawn again.
 * It is not a person: no account, no profile, nothing read off the hardware —
 * only a random string this phone keeps. The server stores a hash of it, never
 * the string itself.
 */
export const watcherId = () => {
	// One shared read. The opt-in POST and the refresh behind it can be in flight
	// together, and two generators racing would leave the driver holding two pins
	// for one commuter, only one of which the opt-out could take back.
	if (!pending) pending = load()

	return pending
}
