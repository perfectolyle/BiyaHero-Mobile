import { client, fetchRealtimeConfig } from './api'

/**
 * The live socket, and what to do when there isn't one.
 *
 * Polling put two delays in series: the driver's ping interval, and every
 * commuter's own poll on top of it. This removes the second — the server pushes
 * a position the moment it lands.
 *
 * It is an OPTIMISATION, never a dependency. Every screen still polls, so a
 * refused connection, a sleeping socket service, or an old build pointed at a
 * server without Reverb all degrade to exactly the behaviour that shipped
 * before any of this. Nothing here may throw into a caller.
 *
 * The Pusher protocol is spoken directly rather than through pusher-js: its
 * React Native build pulls in @react-native-community/netinfo, a native module
 * Expo Go may not carry, and its browser build reaches for `document` at import
 * time and kills the app on launch. The protocol is a handshake, a subscribe
 * frame and a ping reply — React Native already has WebSocket.
 */
const PROTOCOL = 7
const RECONNECT_MIN_MS = 2000
const RECONNECT_MAX_MS = 30_000

let socket = null
let config = null
let socketId = null
let reconnectDelay = RECONNECT_MIN_MS
let reconnectTimer = null
let closedOnPurpose = false
let activityTimer = null
let lastFrameAt = 0
let awaitingPong = false

/** channel name -> Set of { event, handler } */
const listeners = {}

/**
 * Who wants to know when the socket comes up or goes down.
 *
 * The store polls the listing on a cadence that depends on this: every 8 s
 * while the socket is down, because the poll is then the only source of
 * movement, and rarely while it is up, because the socket already carries
 * every move and a poll can only re-download what the phone is holding.
 */
const stateListeners = new Set()
const announce = state => stateListeners.forEach(cb => cb(state))
/** Channels confirmed by the server, so a reconnect knows what to re-join. */
const joined = new Set()

const send = frame => {
	if (socket?.readyState === 1) socket.send(JSON.stringify(frame))
}

/**
 * Private channels are authorised by the API with the driver's bearer token —
 * the same credential the HTTP read uses, so the socket can never be the
 * weaker way in.
 */
const join = async channel => {
	if (!socketId) return

	if (!channel.startsWith('private-') && !channel.startsWith('presence-')) {
		return send({ event: 'pusher:subscribe', data: { channel } })
	}

	try {
		const { data } = await client.post('/broadcasting/auth', {
			socket_id: socketId,
			channel_name: channel
		})
		send({ event: 'pusher:subscribe', data: { channel, auth: data.auth } })
	} catch {
		// Not this driver's trip, or no session. Their screen keeps polling.
	}
}

/**
 * A phone that loses signal mid-trip gets a HALF-OPEN socket: the connection is
 * gone but nothing tells this end, so onclose never fires, the reconnect never
 * runs, and the map quietly stops updating while still looking connected. The
 * protocol's own answer is to ping into the silence and give up if nothing
 * comes back.
 */
const watchForSilence = timeoutMs => {
	stopWatchingForSilence()
	lastFrameAt = Date.now()

	activityTimer = setInterval(() => {
		const quiet = Date.now() - lastFrameAt

		// A full activity_timeout to answer, not half of one. The server sends
		// that value as 30 s, so half was 15 s — and a pong is processed on the
		// JS thread, so a phone drawing two maps at once, or a Reverb sharing a
		// tenth of a CPU with the API, could miss that window with the
		// connection perfectly healthy. Closing then is what "losing connection
		// when I open a vehicle" actually was.
		if (awaitingPong && quiet > timeoutMs) return socket?.close()

		if (quiet > timeoutMs) {
			awaitingPong = true
			send({ event: 'pusher:ping', data: {} })
		}
	}, Math.max(5000, Math.round(timeoutMs / 4)))
}

const stopWatchingForSilence = () => {
	if (activityTimer) {
		clearInterval(activityTimer)
		activityTimer = null
	}
	awaitingPong = false
}

const scheduleReconnect = () => {
	if (closedOnPurpose || reconnectTimer) return

	reconnectTimer = setTimeout(() => {
		reconnectTimer = null
		open()
	}, reconnectDelay)

	// Backed off, because a server that is down stays down for a while and a
	// phone retrying every two seconds all night is a battery complaint.
	reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 2)
}

const open = async () => {
	if (socket || closedOnPurpose) return

	// A server that answered "no socket" is a settled answer. A request that
	// FAILED is not — a cold start or a dead spot at launch would otherwise
	// disable real-time for the whole session.
	if (!config) {
		config = await fetchRealtimeConfig().catch(() => null)
		if (!config) return scheduleReconnect()
	}

	if (!config.enabled || !config.key) return

	const scheme = config.scheme === 'https' ? 'wss' : 'ws'
	const url = `${scheme}://${config.host}:${config.port}/app/${config.key}?protocol=${PROTOCOL}&client=biyahero&version=1.0`

	let ws
	try {
		ws = new WebSocket(url)
	} catch {
		return scheduleReconnect()
	}

	socket = ws

	ws.onmessage = event => {
		lastFrameAt = Date.now()
		awaitingPong = false

		let frame
		try {
			frame = JSON.parse(event.data)
		} catch {
			return
		}

		if (frame.event === 'pusher:connection_established') {
			const payload = typeof frame.data === 'string' ? JSON.parse(frame.data) : frame.data
			socketId = payload.socket_id
			reconnectDelay = RECONNECT_MIN_MS
			watchForSilence((payload.activity_timeout ?? 120) * 1000)
			// Re-join everything: after a drop the server remembers nothing.
			Object.keys(listeners).forEach(join)
			announce('up')
			return
		}

		if (frame.event === 'pusher:ping') return send({ event: 'pusher:pong', data: {} })

		if (frame.event === 'pusher_internal:subscription_succeeded') {
			joined.add(frame.channel)
			return
		}

		const bound = listeners[frame.channel]
		if (!bound) return

		const data = typeof frame.data === 'string' ? JSON.parse(frame.data) : frame.data
		bound.forEach(entry => {
			if (entry.event === frame.event) entry.handler(data)
		})
	}

	ws.onclose = () => {
		socket = null
		socketId = null
		joined.clear()
		stopWatchingForSilence()
		announce('down')
		scheduleReconnect()
	}

	// A socket error is followed by a close, which is what schedules the retry.
	ws.onerror = () => {}
}

/**
 * Listen for one event on one channel.
 *
 * Returns an unsubscribe that is always safe to call, including when the socket
 * never connected — a caller should not have to ask whether the feature is on
 * before cleaning up after it.
 */
export const subscribe = (channel, event, handler) => {
	const entry = { event, handler }

	listeners[channel] = listeners[channel] ?? new Set()
	listeners[channel].add(entry)

	closedOnPurpose = false

	if (socketId && !joined.has(channel)) join(channel)
	else open()

	return () => {
		listeners[channel]?.delete(entry)

		if (listeners[channel]?.size === 0) {
			delete listeners[channel]
			joined.delete(channel)
			send({ event: 'pusher:unsubscribe', data: { channel } })
		}
	}
}

/**
 * Be told when the socket comes up ('up') or goes down ('down').
 *
 * Fires immediately with the current state, so a caller never has to guess
 * what happened before it asked. Returns an unsubscribe.
 */
export const onRealtimeState = cb => {
	stateListeners.add(cb)
	cb(socketId ? 'up' : 'down')

	return () => stateListeners.delete(cb)
}

/**
 * Drop the connection — on logout, or when the API base changes.
 *
 * Listeners go too: a private subscription authorised with a token that no
 * longer exists would keep failing to re-join for as long as the app is open.
 */
export const disconnectRealtime = () => {
	closedOnPurpose = true

	if (reconnectTimer) {
		clearTimeout(reconnectTimer)
		reconnectTimer = null
	}

	stopWatchingForSilence()
	Object.keys(listeners).forEach(name => delete listeners[name])
	joined.clear()
	socketId = null
	config = null

	if (socket) {
		socket.close()
		socket = null
	}
}
