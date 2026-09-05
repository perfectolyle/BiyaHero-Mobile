import { Stack } from 'expo-router'

/**
 * freezeOnBlur: a screen under another one stops rendering.
 *
 * Opening a vehicle pushes the detail screen — with its own map — on top of
 * Map Home, which stays MOUNTED underneath. Both maps ran their 30 fps glide
 * clocks and both re-rendered every pin on every socket burst, so the tap
 * that opened a vehicle was also the moment the phone started drawing two
 * maps at once, one of them invisible. That is the stall, and a JS thread
 * stalled long enough is also what makes the socket watchdog give up.
 */
export default () => <Stack screenOptions={{ headerShown: false, animation: 'fade', freezeOnBlur: true }} />
