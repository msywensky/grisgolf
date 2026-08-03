import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';
import type { EventBundle, League, LeagueBundle } from './types';

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

	const [golfers, teams, scores, highlights, course, league] = await Promise.all([
		sb.from('golfers').select('*').eq('event_id', event.id).order('name'),
		sb.from('teams').select('*').eq('event_id', event.id).order('created_at'),
		sb.from('scores').select('*').eq('event_id', event.id).order('hole_number'),
		sb.from('highlights').select('*').eq('event_id', event.id).order('created_at', { ascending: false }),
		event.course_id
			? sb.from('courses').select('*').eq('id', event.course_id).maybeSingle()
			: Promise.resolve(null),
		event.league_id
			? sb.from('leagues').select('*').eq('id', event.league_id).maybeSingle()
			: Promise.resolve(null)
	]);
	for (const res of [golfers, teams, scores, highlights]) {
		if (res.error) throw res.error;
	}

	return {
		event,
		course: course?.data ?? null,
		league: league?.data ?? null,
		golfers: golfers.data ?? [],
		teams: teams.data ?? [],
		scores: scores.data ?? [],
		highlights: highlights.data ?? []
	};
}

/** Fetch a league and everything its pages need by share code. Null if not found. */
export async function fetchLeagueBundle(shareCode: string): Promise<LeagueBundle | null> {
	const sb = supabase();
	const { data: league, error } = await sb
		.from('leagues')
		.select('*')
		.eq('share_code', shareCode)
		.maybeSingle();
	if (error) throw error;
	if (!league) return null;

	const [managers, members, seasons, events] = await Promise.all([
		sb.from('league_managers').select('user_id').eq('league_id', league.id),
		sb.from('league_members').select('*').eq('league_id', league.id).order('joined_at'),
		sb.from('seasons').select('*').eq('league_id', league.id).order('created_at'),
		sb.from('events').select('*').eq('league_id', league.id).order('date')
	]);
	for (const res of [managers, members, seasons, events]) {
		if (res.error) throw res.error;
	}

	const seasonIds = (seasons.data ?? []).map((s) => s.id);
	const eventIds = (events.data ?? []).map((e) => e.id);
	const [seasonTeams, teams, golfers, scores, highlights] = await Promise.all([
		seasonIds.length
			? sb.from('season_teams').select('*').in('season_id', seasonIds).order('created_at')
			: Promise.resolve({ data: [], error: null }),
		eventIds.length
			? sb.from('teams').select('*').in('event_id', eventIds)
			: Promise.resolve({ data: [], error: null }),
		eventIds.length
			? sb.from('golfers').select('*').in('event_id', eventIds)
			: Promise.resolve({ data: [], error: null }),
		eventIds.length
			? sb.from('scores').select('*').in('event_id', eventIds)
			: Promise.resolve({ data: [], error: null }),
		eventIds.length
			? sb
					.from('highlights')
					.select('*')
					.in('event_id', eventIds)
					.order('created_at', { ascending: false })
					.limit(20)
			: Promise.resolve({ data: [], error: null })
	]);
	for (const res of [seasonTeams, teams, golfers, scores, highlights]) {
		if (res.error) throw res.error;
	}

	// Profiles for everyone on the roster or in a season pair.
	const userIds = new Set<string>();
	for (const m of members.data ?? []) userIds.add(m.user_id);
	for (const t of seasonTeams.data ?? []) {
		if (t.player1_user_id) userIds.add(t.player1_user_id);
		if (t.player2_user_id) userIds.add(t.player2_user_id);
	}
	const profiles = userIds.size
		? await sb.from('profiles').select('*').in('id', [...userIds])
		: { data: [], error: null };
	if (profiles.error) throw profiles.error;

	return {
		league,
		managerIds: (managers.data ?? []).map((m) => m.user_id),
		members: members.data ?? [],
		profiles: profiles.data ?? [],
		seasons: seasons.data ?? [],
		seasonTeams: seasonTeams.data ?? [],
		events: events.data ?? [],
		teams: teams.data ?? [],
		golfers: golfers.data ?? [],
		scores: scores.data ?? [],
		highlights: highlights.data ?? []
	};
}

/** Leagues a signed-in user belongs to or manages (for the /leagues page). */
export async function fetchMyLeagues(
	userId: string
): Promise<{ league: League; isManager: boolean }[]> {
	const sb = supabase();
	const [memberships, managed] = await Promise.all([
		sb.from('league_members').select('league_id').eq('user_id', userId),
		sb.from('league_managers').select('league_id').eq('user_id', userId)
	]);
	if (memberships.error) throw memberships.error;
	if (managed.error) throw managed.error;

	const managedIds = new Set((managed.data ?? []).map((m) => m.league_id));
	const allIds = [...new Set([...(memberships.data ?? []).map((m) => m.league_id), ...managedIds])];
	if (allIds.length === 0) return [];

	const { data: leagues, error } = await sb.from('leagues').select('*').in('id', allIds).order('name');
	if (error) throw error;
	return (leagues ?? []).map((league) => ({ league, isManager: managedIds.has(league.id) }));
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
