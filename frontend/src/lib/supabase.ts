import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import type { EventBundle } from './types';

let client: SupabaseClient | null = null;

/** Lazily create the Supabase client so a missing .env fails loudly but only when used. */
export function supabase(): SupabaseClient {
	if (!client) {
		const url = env.PUBLIC_SUPABASE_URL;
		const key = env.PUBLIC_SUPABASE_ANON_KEY;
		if (!url || !key) {
			throw new Error(
				'Supabase is not configured. Copy frontend/.env.example to frontend/.env and add your keys. 🍺'
			);
		}
		client = createClient(url, key);
	}
	return client;
}

/** Fetch an event and all of its children by share code. Returns null if not found. */
export async function fetchEventBundle(shareCode: string): Promise<EventBundle | null> {
	const sb = supabase();
	const { data: event, error } = await sb
		.from('events')
		.select('*')
		.eq('share_code', shareCode)
		.maybeSingle();
	if (error) throw error;
	if (!event) return null;

	const [golfers, teams, scores, highlights] = await Promise.all([
		sb.from('golfers').select('*').eq('event_id', event.id).order('name'),
		sb.from('teams').select('*').eq('event_id', event.id).order('created_at'),
		sb.from('scores').select('*').eq('event_id', event.id).order('hole_number'),
		sb.from('highlights').select('*').eq('event_id', event.id).order('created_at', { ascending: false })
	]);
	for (const res of [golfers, teams, scores, highlights]) {
		if (res.error) throw res.error;
	}

	return {
		event,
		golfers: golfers.data ?? [],
		teams: teams.data ?? [],
		scores: scores.data ?? [],
		highlights: highlights.data ?? []
	};
}

/**
 * Subscribe to live changes for an event. Uses Supabase realtime with a
 * 20s polling fallback so scores still flow on flaky course wifi.
 * Returns an unsubscribe function.
 */
export function subscribeToEvent(eventId: string, onChange: () => void): () => void {
	const sb = supabase();
	const topic = `event-${eventId}`;
	// supabase-js reuses an existing channel object for a topic that hasn't
	// been removed yet, and calling .on() on an already-subscribed channel
	// throws. Clear out any stale channel for this topic first.
	const stale = sb.getChannels().filter((c) => c.topic === `realtime:${topic}`);
	for (const c of stale) sb.removeChannel(c);

	const channel = sb
		.channel(topic)
		.on(
			'postgres_changes',
			{ event: '*', schema: 'public', filter: `event_id=eq.${eventId}`, table: 'scores' },
			onChange
		)
		.on(
			'postgres_changes',
			{ event: '*', schema: 'public', filter: `event_id=eq.${eventId}`, table: 'highlights' },
			onChange
		)
		.on(
			'postgres_changes',
			{ event: '*', schema: 'public', filter: `event_id=eq.${eventId}`, table: 'teams' },
			onChange
		)
		.on(
			'postgres_changes',
			{ event: '*', schema: 'public', filter: `event_id=eq.${eventId}`, table: 'golfers' },
			onChange
		)
		.subscribe();

	const poll = setInterval(onChange, 20_000);

	return () => {
		clearInterval(poll);
		sb.removeChannel(channel);
	};
}

/** Upload a highlight photo to the public `highlights` bucket, returns its public URL. */
export async function uploadHighlightPhoto(eventId: string, file: File): Promise<string> {
	const sb = supabase();
	const ext = file.name.split('.').pop() ?? 'jpg';
	const path = `${eventId}/${crypto.randomUUID()}.${ext}`;
	const { error } = await sb.storage.from('highlights').upload(path, file, {
		cacheControl: '3600',
		upsert: false
	});
	if (error) throw error;
	return sb.storage.from('highlights').getPublicUrl(path).data.publicUrl;
}
