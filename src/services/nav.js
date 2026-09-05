/**
 * Leave one mode for another without keeping the way back into it.
 *
 * `router.replace()` swaps only the TOP entry of the stack; everything beneath
 * it survives. That is right for a step inside a flow and wrong for every call
 * site here, because each one is a MODE CHANGE — the screens underneath are not
 * history any more, they are a mode the user has just left.
 *
 * What it was doing:
 *
 *   register  [vehicle, licence] -> replace -> [vehicle, driver home]
 *             so back from the home screen of an account you just made
 *             reopened the registration form.
 *   log in    [vehicle, login]   -> replace -> [vehicle, driver home]
 *             same, for a driver who already had an account.
 *   role      [driver, settings] -> replace -> [driver, commuter map]
 *             so back from the commuter map landed on the DRIVER profile with
 *             the role already switched to commuter.
 *   sign out  [driver home, profile] -> replace -> [driver home, role picker]
 *             back reached the home screen of the account just signed out of.
 *
 * Dismissing to the root first makes the replace land on an empty stack, so the
 * destination is the only thing left.
 */
export const resetTo = (router, href) => {
	// A stack already at its root has nothing to dismiss, and asking anyway logs
	// a warning on some navigators.
	if (router.canGoBack()) router.dismissAll()
	router.replace(href)
}
