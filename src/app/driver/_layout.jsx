import { Stack } from 'expo-router'

// freezeOnBlur for the same reason as the commuter stack: the trip screen's
// map stays mounted under profile, history and help, and would otherwise keep
// gliding and re-rendering while nobody can see it.
export default () => <Stack screenOptions={{ headerShown: false, animation: 'fade', freezeOnBlur: true }} />
