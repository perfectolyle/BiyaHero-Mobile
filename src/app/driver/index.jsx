import { useCallback, useState } from 'react'
import { View, ScrollView, Pressable } from 'react-native'
import { Redirect, useRouter, useFocusEffect } from 'expo-router'
import { Screen } from '@/components/ui/Screen'
import { Txt } from '@/components/ui/Txt'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { StatCard } from '@/components/StatCard'
import { DriverVehicleCard } from '@/components/DriverVehicleCard'
import { fetchRecentRoutes } from '@/services/api'
import { useStore } from '@/services/store'
import { useCopy } from '@/constants/copy'

const greeting = copy => {
	const hour = new Date().getHours()
	if (hour < 12) return copy.driverHome.greetingMorning
	if (hour < 18) return copy.driverHome.greetingAfternoon
	return copy.driverHome.greetingEvening
}

/** 15 · Driver Home — off duty. Two taps of work: where to, and how full. */
export default function DriverHome() {
	const copy = useCopy()
	const router = useRouter()
	const driver = useStore(s => s.driver)
	const trip = useStore(s => s.trip)
	const summary = useStore(s => s.summary)
	const loadSummary = useStore(s => s.loadSummary)
	const setPresetRoute = useStore(s => s.setPresetRoute)
	const [recent, setRecent] = useState([])

	useFocusEffect(
		useCallback(() => {
			if (!driver) return

			let cancelled = false
			loadSummary()
			// Refetched on focus rather than once: the list is stale the moment
			// the driver finishes a run and lands back here.
			fetchRecentRoutes()
				.then(rows => !cancelled && setRecent(rows))
				.catch(() => {})

			return () => {
				cancelled = true
			}
		}, [driver])
	)

	if (!driver) return <Redirect href="/driver/vehicle" />
	// Verification gates the whole driver experience, not just the start button.
	if (driver.verification_status !== 'approved') return <Redirect href="/driver/pending" />
	if (trip) return <Redirect href="/driver/trip" />

	// The same run again, from the screen the driver is already on. Starting a
	// trip is two decisions — where to, and how full — and for the routes a
	// driver actually repeats this settles the first one.
	const runAgain = route => {
		setPresetRoute(route)
		router.push('/driver/start')
	}

	return (
		<Screen>
			<ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-6 pt-6 gap-6 flex-grow">
				<View className="flex-row items-start justify-between">
					<View className="min-w-0 flex-1">
						<Txt variant="bodyL" className="text-fg-secondary">{greeting(copy)}</Txt>
						<Txt variant="displayS" numberOfLines={1}>{driver.name}</Txt>
					</View>
					<Pressable onPress={() => router.push('/driver/profile')} accessibilityRole="button" className="active:opacity-70">
						<Avatar name={driver.name} size={44} />
					</Pressable>
				</View>

				<DriverVehicleCard vehicle={driver.vehicle} verified={driver.is_verified} />

				<View className="flex-row items-center gap-3 rounded-lg bg-surface-sunken p-4">
					<View className="h-2 w-2 rounded-full bg-icon-muted" />
					<Txt variant="bodyM" className="min-w-0 flex-1 text-fg-secondary">{copy.driverHome.offlineNote}</Txt>
				</View>

				<View className="gap-3">
					<Txt variant="labelS" className="text-fg-secondary">{copy.driverHome.todayLabel}</Txt>
					<View className="flex-row gap-3">
						<StatCard value={summary?.trips ?? 0} label={copy.driverHome.trips} />
						<StatCard value={summary?.hours_online ?? 0} label={copy.driverHome.hoursOnline} />
						<StatCard value={summary?.km_travelled ?? 0} label={copy.driverHome.kmTravelled} />
					</View>
				</View>

				{recent.length > 0 && (
					<View className="gap-3">
						<Txt variant="labelS" className="text-fg-secondary">{copy.startTrip.recentLabel}</Txt>
						<View className="gap-2">
							{recent.map(r => (
								<Pressable
									key={r.id}
									onPress={() => runAgain(r)}
									accessibilityRole="button"
									className="rounded-lg border-[1.5px] border-line-subtle bg-surface p-3 active:opacity-80"
								>
									<Txt variant="bodyMStrong" numberOfLines={1}>{r.label}</Txt>
									<Txt variant="caption" className="text-fg-secondary">
										{copy.startTrip.recentMeta(r.length_km, r.lastUsedAt)}
									</Txt>
								</Pressable>
							))}
						</View>
					</View>
				)}

				{/* Keeps the start button on the bottom edge when a new driver has
				    no history yet to fill the space. */}
				<View className="flex-1" />

				<View className="gap-3">
					<Button label={copy.driverHome.startTrip} onPress={() => router.push('/driver/start')} />
					<Txt variant="caption" className="text-center text-fg-secondary">{copy.driverHome.startNote}</Txt>
				</View>
			</ScrollView>
		</Screen>
	)
}
