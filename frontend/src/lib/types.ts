// Shared row types mirroring the Supabase schema (supabase/schema.sql)

export type EventStatus = 'upcoming' | 'live' | 'final';

export interface Event {
	id: string;
	title: string;
	date: string; // ISO date (YYYY-MM-DD)
	course: string;
	holes: 9 | 18;
	status: EventStatus;
	created_by: string;
	share_code: string;
	created_at: string;
}

export interface Golfer {
	id: string;
	name: string;
	handicap: number;
	event_id: string;
}

export interface Team {
	id: string;
	name: string;
	event_id: string;
	player1_id: string | null;
	player2_id: string | null;
}

export interface Score {
	id: string;
	event_id: string;
	team_id: string;
	hole_number: number;
	score: number;
	notes: string | null;
}

export interface Highlight {
	id: string;
	event_id: string;
	hole_number: number | null;
	team_id: string | null;
	golfer_id: string | null;
	caption: string;
	image_url: string | null;
	created_at: string;
}

/** Everything the event pages need, fetched in one go. */
export interface EventBundle {
	event: Event;
	golfers: Golfer[];
	teams: Team[];
	scores: Score[];
	highlights: Highlight[];
}
