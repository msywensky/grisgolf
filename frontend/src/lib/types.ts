// Shared row types mirroring the Supabase schema (supabase/schema.sql)

export type EventStatus = 'upcoming' | 'live' | 'final';
export type TeeGender = 'male' | 'female';

export interface Event {
	id: string;
	title: string;
	date: string; // ISO date (YYYY-MM-DD)
	course: string; // display name, always set (free text or derived from the linked course)
	course_id: string | null; // linked cached course, when picked from the real-course search
	tee_name: string | null;
	tee_gender: TeeGender | null;
	holes: 9 | 18;
	status: EventStatus;
	created_by: string;
	share_code: string;
	created_at: string;
}

/** One tee box from GolfCourseAPI, stored inside courses.tees jsonb. */
export interface TeeBox {
	tee_name: string;
	course_rating: number;
	slope_rating: number;
	total_yards: number;
	par_total: number;
	number_of_holes: number;
	holes?: { par: number; yardage: number; handicap?: number }[];
}

/** A real course cached from GolfCourseAPI (courses table). */
export interface Course {
	id: string;
	external_id: number;
	club_name: string;
	course_name: string;
	address: string | null;
	city: string | null;
	state: string | null;
	country: string | null;
	latitude: number | null;
	longitude: number | null;
	tees: { male?: TeeBox[]; female?: TeeBox[] };
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
	/** Strokes attributed to the golfer in the team's player1/player2 slot (optional split). */
	player1_shots: number | null;
	player2_shots: number | null;
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
	course: Course | null; // the linked real course, when the event has one
	golfers: Golfer[];
	teams: Team[];
	scores: Score[];
	highlights: Highlight[];
}
