import { useMemo } from 'react'
import { View, Pressable, Image, Modal } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MaterialIcons } from '@expo/vector-icons'
import { Txt } from '@/components/ui/Txt'
import { Toggle } from '@/components/ui/Toggle'
import { VehicleGlyph } from '@/components/VehicleGlyph'
import { CapacityBadge } from '@/components/CapacityBadge'
import { FreshnessPill } from '@/components/FreshnessPill'
import { useStore } from '@/services/store'
import { distanceM } from '@/services/geo'
import { VEHICLE_LABELS } from '@/theme/tokens'
import { useTheme } from '@/theme/useTheme'
import { useCopy } from '@/constants/copy'

const DetailRow = ({ tint, children, title, subtitle }) => (
	<View className="flex-row items-center gap-[14px] pb-4 pt-1">
		<View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: tint }}>
			{children}
		</View>
		<View className="min-w-0 flex-1 gap-[2px]">
			<Txt variant="headingS">{title}</Txt>
			<Txt variant="caption" className="text-fg-secondary">{subtitle}</Txt>
		</View>
	</View>
)

/**
 * One jeepney, as a sheet.
 *
 * Split into a head and a body because it is shown two ways: in place on the
 * map home, where tapping a vehicle raises this over the same map rather than
 * pushing a second screen with a second map, and as its own route for a deep
 * link. Both render the same thing from the same props, so the two cannot
 * drift apart.
 */

/** The identity band. Doubles as the sheet's drag handle, so it stays short. */
export const VehicleSheetHead = ({ vehicle, degraded = false, onOpenDriver }) => {
	const copy = useCopy()
	const { theme } = useTheme()

	return (
		<View className="flex-row items-center gap-3 pb-3 pt-1">
			<Pressable
				onPress={() => vehicle.driver_name && onOpenDriver?.()}
				accessibilityRole={vehicle.driver_name ? 'button' : undefined}
				// The whole row is one target, so it has to say what the jeepney IS,
				// not only that a driver card exists behind it.
				accessibilityLabel={
					[
						vehicle.destination,
						vehicle.operator ?? vehicle.plate_number,
						copy.capacity[degraded ? 'unknown' : vehicle.capacity],
						vehicle.driver_name ? copy.vehicle.viewDriver : null
					]
						.filter(Boolean)
						.join(', ')
				}
				className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-70"
			>
				<View
					className="h-12 w-12 items-center justify-center rounded-md border-2 bg-surface-sunken"
					style={{ borderColor: degraded ? theme.border.strong : theme.route[1] }}
				>
					<VehicleGlyph type={vehicle.vehicle_type} color={degraded ? theme.icon.muted : theme.icon.primary} />
				</View>
				<View className="min-w-0 flex-1 gap-[2px]">
					<Txt variant="headingL" numberOfLines={1}>{vehicle.destination}</Txt>
					<View className="flex-row items-center gap-2">
						{/* A bus is known by the name painted along its side — nobody
						    reads a plate on a moving Victory Liner. Jeepneys are
						    owner-operated and carry no company, so they keep the
						    plate. Whichever is NOT shown is in the driver sheet. */}
						{vehicle.operator ? (
							<Txt variant="bodyMStrong" numberOfLines={1} className="shrink text-fg">{vehicle.operator}</Txt>
						) : (
							<Txt variant="monoData" numberOfLines={1} className="shrink text-fg-secondary">{vehicle.plate_number}</Txt>
						)}
						{/* A capacity read off a payload that stopped arriving is a
						    guess presented as a fact. */}
						<CapacityBadge state={degraded ? 'unknown' : vehicle.capacity} />
					</View>
				</View>
				{!!vehicle.driver_name && (
					<View className="flex-row items-center gap-[6px]">
						<View className="h-8 w-8 items-center justify-center rounded-full bg-surface-sunken">
							<Txt variant="labelS" className="text-fg-secondary">{vehicle.driver_name.charAt(0)}</Txt>
						</View>
						<MaterialIcons name="chevron-right" size={20} color={theme.icon.muted} />
					</View>
				)}
			</Pressable>
		</View>
	)
}

/** Everything under the identity: freshness, where it is, what it looks like, the opt-in. */
export const VehicleSheetBody = ({ vehicle, degraded = false }) => {
	const copy = useCopy()
	const { theme } = useTheme()
	const awayM = useStore(s => {
		const me = s.myLocation
		if (!me || !vehicle?.position) return null
		const metres = distanceM(me, vehicle.position)
		return metres == null ? null : Math.round(metres / 10) * 10
	})
	const watchingTripId = useStore(s => s.watchingTripId)
	const toggleWatchingTrip = useStore(s => s.toggleWatchingTrip)

	// Keyed on the URL string, not rebuilt per render. An object literal in
	// source={{ uri }} is a new identity every time, and this re-polls every
	// 8 s — so the Image was handed a "new" source four times a minute and
	// reloaded the same picture each time. That was the blink.
	const photoSource = useMemo(
		() => (vehicle?.photoUrl ? { uri: vehicle.photoUrl } : null),
		[vehicle?.photoUrl]
	)

	return (
		<>
			{/* What is actually coming down the road. A plate identifies a jeepney
			    only once it is close enough to read; paint and shape are what a
			    commuter matches from a corner.

			    A ratio, not a fixed height: h-40 was a 2.16:1 letterbox on one phone
			    and nearly square on a narrow one, so one photo cropped differently
			    per device. 16:9 because anything tighter crops the jeepney rather
			    than framing it — the sheet is made taller instead, so the street it
			    is on and the opt-in switch still clear the fold. */}
			{!!photoSource && (
				<Image
					source={photoSource}
					style={{ aspectRatio: 16 / 9 }}
					className="mb-4 w-full rounded-lg bg-surface-sunken"
					resizeMode="cover"
					accessibilityLabel={copy.vehicle.photoAlt(vehicle.destination)}
				/>
			)}

			{/* Freshness first, because it changes the meaning of everything under
			    it: a street name is a fact or a memory depending on this line. */}
			{degraded && (
				<View className="mb-4 flex-row items-start gap-3 rounded-lg bg-capacity-stale-bg p-4">
					<MaterialIcons name="signal-wifi-statusbar-null" size={18} color={theme.capacity.stale.fg} />
					<View className="min-w-0 flex-1 gap-2">
						<Txt variant="bodyMStrong" className="text-capacity-stale-fg">{copy.vehicle.staleTitle}</Txt>
						<Txt variant="caption" className="text-fg-secondary">{copy.vehicle.staleBody}</Txt>
						{/* The body promises a last-seen time; without this the screen
						    said less than the card the commuter tapped to get here. */}
						<View className="flex-row">
							<FreshnessPill stale minutesAgo={vehicle.minutesAgo} />
						</View>
					</View>
				</View>
			)}

			{/* The LIVE fact leads. "Buendia → Baclaran" reads the same on every
			    poll; where the jeepney is right now is what a commuter at a corner
			    is actually reading for. */}
			<DetailRow
				tint={theme.brand.subtle}
				title={
					vehicle.current_street
						? (degraded
							? copy.vehicle.lastOnStreet(vehicle.current_street)
							: copy.vehicle.onStreet(vehicle.current_street))
						: (vehicle.route?.label ?? vehicle.destination)
				}
				subtitle={[
					vehicle.current_street ? (vehicle.route?.label ?? vehicle.destination) : null,
					vehicle.route?.length_km ? copy.vehicle.routeLength(vehicle.route.length_km) : null,
					awayM == null ? null : copy.vehicle.away(awayM)
				].filter(Boolean).join(' · ')}
			>
				<MaterialIcons name="place" size={20} color={theme.brand.hover} />
			</DetailRow>

			<View className="mt-4 flex-row items-center gap-[14px] rounded-lg bg-surface-sunken p-[14px]">
				<View className="h-11 w-11 items-center justify-center rounded-full bg-brand-subtle">
					<MaterialIcons name="person-pin-circle" size={22} color={theme.brand.hover} />
				</View>
				<View className="min-w-0 flex-1 gap-[2px]">
					<Txt variant="bodyMStrong">{copy.vehicle.watchTitle}</Txt>
					<Txt variant="caption" className="text-fg-secondary">{copy.vehicle.watchBody}</Txt>
				</View>
				<Toggle
					value={watchingTripId === vehicle.tripId}
					onValueChange={() => toggleWatchingTrip(vehicle.tripId, { destination: vehicle.destination, plate: vehicle.plate_number })}
					accessibilityLabel={copy.vehicle.watchTitle}
				/>
			</View>
		</>
	)
}

/**
 * Everything a commuter checks once rather than watches: who is driving, how
 * long they have run this route, and what the vehicle actually is.
 */
export const DriverSheet = ({ vehicle, visible, onClose }) => {
	const copy = useCopy()
	const { theme } = useTheme()
	const insets = useSafeAreaInsets()

	if (!vehicle) return null

	return (
		<Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
			<Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
				{/* Swallows taps so pressing the card itself does not dismiss. */}
				<Pressable
					onPress={() => {}}
					style={{ paddingBottom: insets.bottom + 24 }}
					className="gap-5 rounded-t-2xl bg-surface px-6 pt-5"
				>
					<View className="flex-row items-center justify-between">
						<Txt variant="headingS">{copy.vehicle.driverSheetTitle}</Txt>
						<Pressable
							onPress={onClose}
							accessibilityRole="button"
							accessibilityLabel={copy.common.close}
							className="h-10 w-10 items-center justify-center rounded-full bg-surface-sunken active:opacity-70"
						>
							<MaterialIcons name="close" size={20} color={theme.icon.secondary} />
						</Pressable>
					</View>

					<View className="flex-row items-center gap-[14px]">
						<View className="h-14 w-14 items-center justify-center rounded-full bg-surface-sunken">
							<Txt variant="headingS" className="text-fg-secondary">{vehicle.driver_name?.charAt(0)}</Txt>
						</View>
						<View className="min-w-0 flex-1 gap-[2px]">
							<Txt variant="headingS" numberOfLines={1}>{vehicle.driver_name}</Txt>
							<Txt variant="caption" className="text-fg-secondary">
								{vehicle.is_verified
									? copy.vehicle.verifiedDriver(vehicle.driver_years)
									: copy.vehicle.unverifiedDriver(vehicle.driver_years)}
							</Txt>
						</View>
					</View>

					<View className="gap-3 rounded-lg bg-surface-sunken p-4">
						{[
							[copy.vehicle.typeLabel, VEHICLE_LABELS[vehicle.vehicle_type] ?? vehicle.vehicle_type],
							...(vehicle.operator ? [[copy.vehicle.operatorLabel, vehicle.operator]] : []),
							[copy.vehicle.plateLabel, vehicle.plate_number],
							// The model is the other half of "what am I looking for":
							// paint and shape from the photo, make and year from here.
							[copy.vehicle.modelLabel, vehicle.model || copy.vehicle.unknownModel],
							// Painted far larger than the plate, and what terminals and
							// dispatchers actually call a unit by.
							...(vehicle.body_number ? [[copy.vehicle.bodyLabel, vehicle.body_number]] : [])
						].map(([label, value]) => (
							<View key={label} className="flex-row items-center justify-between gap-4">
								<Txt variant="caption" className="text-fg-secondary">{label}</Txt>
								<Txt variant="bodyMStrong" numberOfLines={1} className="shrink text-right">{value}</Txt>
							</View>
						))}
					</View>
				</Pressable>
			</Pressable>
		</Modal>
	)
}
