import { useEffect, useMemo, useState } from 'react'
import { View, Pressable, ScrollView, Linking } from 'react-native'
import { Redirect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { MaterialIcons } from '@expo/vector-icons'
import { Map } from '@/components/Map'
import { Sheet } from '@/components/ui/Sheet'
import { Txt } from '@/components/ui/Txt'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { CapacityPicker } from '@/components/CapacityPicker'
import { useStore } from '@/services/store'
import { fetchTripWatchers } from '@/services/api'
import { subscribe } from '@/services/realtime'
import { elevation, PING_INTERVAL_MS } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'
import { useCopy } from '@/constants/copy'
import { resetTo } from '@/services/nav'

/**
 * 17 · Active Trip. While this screen is open the vehicle is broadcasting and
 * visible to commuters — ending the trip removes it from their map immediately.
 */
export default function ActiveTrip() {
	const copy = useCopy()
	const { theme, statusBar } = useTheme()
	const router = useRouter()
	const insets = useSafeAreaInsets()

	const driver = useStore(s => s.driver)
	const trip = useStore(s => s.trip)
	const setCapacity = useStore(s => s.setCapacity)
	const endTrip = useStore(s => s.endTrip)
	const beginReroute = useStore(s => s.beginReroute)
	const isBroadcasting = useStore(s => s.isBroadcasting)
	const broadcastPosition = useStore(s => s.broadcastPosition)
	const retryBroadcast = useStore(s => s.retryBroadcast)

	const [elapsed, setElapsed] = useState(0)
	// How the camera treats the driver's own vehicle. Navigation from the first
	// frame — heading-up, tilted, locked on — because that is what a driver
	// expects a trip screen to do; one tap steps to a north-up follow, one more
	// frees the map. Panning frees it too. A one-shot recentre used to live here
	// and did not stay with the vehicle, which read as "focus is not working".
	const [followMode, setFollowMode] = useState('navigation')
	const [watchers, setWatchers] = useState({ count: 0, onRouteCount: 0, nearestM: null, points: [] })

	useEffect(() => {
		if (!trip?.started_at) return

		const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - new Date(trip.started_at).getTime()) / 60000)))
		tick()
		const timer = setInterval(tick, 30_000)

		return () => clearInterval(timer)
	}, [trip?.started_at])

	// The commuters who agreed to be visible on THIS trip. Nothing here is kept
	// past the screen: the rows die with the trip and the pins with the unmount.
	useEffect(() => {
		if (!trip?.id) return

		let cancelled = false

		const load = () =>
			fetchTripWatchers(trip.id)
				.then(data => !cancelled && setWatchers(data))
				// A dropped poll is a network blip, not the corner emptying. Zeroing
				// the strip here would tell the driver nobody is waiting any more.
				.catch(() => {})

		load()
		const timer = setInterval(load, PING_INTERVAL_MS)

		// Someone opting in — or taking it back — is the one change a driver
		// should not wait eight seconds to see. The event carries nothing about
		// the commuter; it only says the set moved, and the read that follows
		// is the same authorised one, so the socket never becomes a second way
		// to reach a position.
		const unsubscribe = subscribe(`private-trips.${trip.id}`, 'watchers.changed', load)

		return () => {
			cancelled = true
			clearInterval(timer)
			unsubscribe()
		}
	}, [trip?.id])

	// Keyed on the route, not the trip object — a capacity tap rebuilds the
	// trip and must not yank the camera back with a fresh fitTo identity.
	const waypoints = useMemo(
		() => (trip?.route?.waypoints ?? []).map(w => ({ latitude: Number(w.lat), longitude: Number(w.lng) })),
		[trip?.route?.id]
	)

	if (!driver) return <Redirect href="/driver/vehicle" />
	if (!trip) return <Redirect href="/driver" />

	// The exact target the trip resolved to — pinned spot or place — with the
	// route's far end as the fallback for older trips.
	const destinationPin =
		trip.dest_lat != null
			? { latitude: Number(trip.dest_lat), longitude: Number(trip.dest_lng), label: trip.destination }
			: waypoints.length
				? { ...waypoints[waypoints.length - 1], label: trip.destination }
				: null

	const finish = async () => {
		// Stay on the run if the server never heard the end request — the store
		// has already said so with a toast. Leaving anyway showed "ended" while
		// commuters still saw this jeepney live.
		if (await endTrip()) resetTo(router, '/driver')
	}

	return (
		<View className="flex-1 bg-surface-canvas">
			<StatusBar style={statusBar} />
			<Map
				vehicles={[]}
				route={waypoints}
				routeTarget={destinationPin}
				routeAnchor="self"
				destinationPin={destinationPin}
				fitTo={waypoints}
				fitKey={trip.route?.id ?? trip.id}
				selfVehicle={{ position: broadcastPosition, vehicle_type: driver?.vehicle?.vehicle_type ?? 'jeepney' }}
				waitingPins={watchers.points}
				follow={followMode !== 'off'}
				followKey="self"
				followMode={followMode === 'navigation' ? 'navigation' : 'region'}
				centerOn={broadcastPosition}
				onUserPan={() => setFollowMode('off')}
				// The avatar is the ONLY route off this screen that does not end
				// the trip. Driver home is where it normally lives, and home is
				// exactly what this screen replaces: driver/index redirects to
				// here the moment a trip exists, so profile — and through it
				// history, help and settings — had no reachable entry for the
				// whole run. Ending the trip to change the language, or to fix
				// the GPS this screen is complaining about, is not a trade a
				// driver should be asked to make.
				controls={
					<>
						{/* 56 with the same border and surface as the follow control
						    below it — the map stacks its controls in one column and
						    they have to read as one set, not as an avatar parked next
						    to a button. The initial sits inside at driver-home's size. */}
						<Pressable
							onPress={() => router.push('/driver/profile')}
							accessibilityRole="button"
							accessibilityLabel={copy.activeTrip.openProfile}
							style={elevation.float}
							className="h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-line-subtle bg-surface active:opacity-80"
						>
							<Avatar name={driver?.name} size={44} tone="brand" />
						</Pressable>
						{/* One tap per state, the way Google Maps' own button works:
						    free → follow (north-up) → navigation (heading-up, tilted).
						    Filled AND a different glyph per state — a state is never
						    carried by colour alone. */}
						<Pressable
							onPress={() =>
								setFollowMode(m => (m === 'off' ? 'region' : m === 'region' ? 'navigation' : 'off'))
							}
							accessibilityRole="button"
							accessibilityLabel={copy.activeTrip.followModes[followMode]}
							style={[
								elevation.float,
								{
									backgroundColor: followMode === 'off' ? theme.surface.default : theme.brand.default,
									borderColor: followMode === 'off' ? theme.border.subtle : theme.brand.default
								}
							]}
							className="h-14 w-14 items-center justify-center rounded-full border-[1.5px] active:opacity-80"
						>
							<MaterialIcons
								name={followMode === 'navigation' ? 'navigation' : followMode === 'region' ? 'gps-fixed' : 'gps-not-fixed'}
								size={24}
								color={followMode === 'off' ? theme.icon.secondary : theme.text.onBrand}
							/>
						</Pressable>
					</>
				}
				controlsBottom={520}
			/>

			{/* The banner is a factual claim about the watcher, not about the
			    trip row: if broadcasting stopped, commuters cannot see them.

			    When it IS stopped it also becomes the fix. The cause is almost
			    always the phone's Location switch, and the only control for
			    that is the system settings screen — which the driver could not
			    reach from here at all. Stating a problem next to no way to act
			    on it is what the 20-second toast was already doing. */}
			<Pressable
				// Retry the broadcast first; only when the phone's Location switch is
				// the reason does the tap hand off to the system settings.
				onPress={
					isBroadcasting
						? undefined
						: () => retryBroadcast().then(ok => !ok && Linking.openSettings().catch(() => {}))
				}
				disabled={isBroadcasting}
				accessibilityRole={isBroadcasting ? 'text' : 'button'}
				accessibilityLabel={isBroadcasting ? copy.activeTrip.liveBanner : copy.activeTrip.notLiveAction}
				style={{ top: insets.top + 6, ...elevation.float }}
				className={`absolute max-w-[88%] self-center flex-row items-center gap-2 rounded-full border-[1.5px] bg-surface px-4 py-2 ${
					isBroadcasting ? 'border-capacity-open-fg' : 'border-capacity-stale-fg active:opacity-80'
				}`}
			>
				<View
					className={`h-[9px] w-[9px] rounded-full ${isBroadcasting ? 'bg-capacity-open-fg' : 'bg-capacity-stale-fg'}`}
				/>
				<Txt
					variant="bodyMStrong"
					numberOfLines={2}
					className={`min-w-0 flex-1 ${isBroadcasting ? 'text-capacity-open-fg' : 'text-capacity-stale-fg'}`}
				>
					{isBroadcasting ? copy.activeTrip.liveBanner : copy.activeTrip.notLiveBanner}
				</Txt>
				{/* Only when it does something. A chevron on the healthy state
				    would be the "looks tappable but is not" problem in reverse. */}
				{!isBroadcasting && (
					<MaterialIcons name="chevron-right" size={20} color={theme.capacity.stale.fg} />
				)}
			</Pressable>

			{/* Head, not scroll content: it is what the driver drags to open the
			    sheet. The pan gesture needs a clearly vertical drag, so the
			    "Palitan" button inside still takes its own taps. */}
			<Sheet
				peekHeight={500}
				head={
					<View className="flex-row items-start justify-between gap-3 pb-4 pt-1">
						<View className="min-w-0 flex-1 gap-[2px]">
							{/* Two lines at Heading/M, not one at Heading/L: beside the
							    "Change" pill, "Bound for SM City Tarlac" was reaching
							    the screen as "Bound for SM City T…" — the one fact the
							    heading exists to state was the part cut off. */}
							<Txt variant="headingM" numberOfLines={2}>{copy.activeTrip.heading(trip.destination)}</Txt>
							<Txt variant="caption" className="text-fg-secondary">
								{copy.activeTrip.elapsed(elapsed, (trip.distance_km ?? 0).toFixed(1))}
							</Txt>
						</View>
						<Pressable
							onPress={() => {
								beginReroute()
								router.push('/driver/start')
							}}
							accessibilityRole="button"
							className="rounded-full border-[1.5px] border-line-subtle bg-surface px-4 py-2 active:opacity-80"
						>
							<Txt variant="bodyMStrong" className="text-fg-secondary">{copy.activeTrip.change}</Txt>
						</Pressable>
					</View>
				}
			>
				<ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-6 gap-6">
					{/* Shown even at zero: a driver seeing no pins must be able to
					    tell an empty corner from a feature that is broken. */}
					<View className="flex-row items-center gap-[14px] rounded-lg bg-surface-sunken p-[14px]">
						<View className="h-11 w-11 items-center justify-center rounded-full bg-brand-subtle">
							<MaterialIcons name="person" size={22} color={theme.brand.hover} />
						</View>
						<View className="min-w-0 flex-1 gap-[2px]">
							<Txt variant="bodyMStrong">
								{watchers.count ? copy.activeTrip.watchingCount(watchers.count) : copy.activeTrip.watchingNone}
							</Txt>
							<Txt variant="caption" className="text-fg-secondary">
								{!watchers.count
									? copy.activeTrip.watchingNoneBody
									: !watchers.onRouteCount
										? copy.activeTrip.watchingNoneOnRoute
										: [
												copy.activeTrip.watchingOnRoute(watchers.onRouteCount),
												// Without a fix there is no honest distance, but "2 nasa
												// ruta mo" is still true and still worth saying.
												watchers.nearestM == null
													? copy.activeTrip.watchingNoFix
													: copy.activeTrip.watchingNearest(watchers.nearestM)
											].join(' · ')}
							</Txt>
						</View>
					</View>

					<View className="gap-3">
						<Txt variant="labelS" className="text-fg-secondary">{copy.activeTrip.capacityPrompt}</Txt>
						<CapacityPicker value={trip.capacity} onChange={setCapacity} />
					</View>

					<View className="gap-3">
						<Button label={copy.activeTrip.end} tone="danger" onPress={finish} />
						<Txt variant="caption" className="text-center text-fg-secondary">{copy.activeTrip.endNote}</Txt>
					</View>
				</ScrollView>
			</Sheet>
		</View>
	)
}
