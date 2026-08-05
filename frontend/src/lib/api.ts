// Thin wrapper around the FastAPI backend (custom logic: event creation,
// admin auth, cloning, ICS export, course search). Everything else talks to
// Supabase directly.
import { env } from '$env/dynamic/public';
import type { ScoringMode, Season, TeeBox, TeeGender } from './types';

const API = () => env.PUBLIC_API_URL ?? 'http://localhost:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`${API()}${path}`, {
			...init,
			headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
		});
	} catch {
		throw new Error("Can't reach the clubhouse (backend). Is the FastAPI server running? 🍺");
	}
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.detail ?? `Request failed (${res.status})`);
	}
	return res.json();
}

export interface CreateEventInput {
	title: string;
	date: string;
	course: string;
	holes: 9 | 18;
	created_by: string;
	admin_pin?: string;
	// Link a real course (GolfCourseAPI id) + chosen tee, when picked from search.
	external_course_id?: string;
	tee_name?: string | null;
	tee_gender?: TeeGender | null;
}

export interface CreateEventResult {
	share_code: string;
	admin_pin: string;
}

export function createEvent(input: CreateEventInput): Promise<CreateEventResult> {
	return request('/api/events', { method: 'POST', body: JSON.stringify(input) });
}

export function verifyAdmin(shareCode: string, pin: string): Promise<{ ok: boolean }> {
	return request(`/api/events/${shareCode}/verify-admin`, {
		method: 'POST',
		body: JSON.stringify({ pin })
	});
}

export function updateEvent(
	shareCode: string,
	pin: string,
	patch: Partial<{
		title: string;
		course: string;
		date: string;
		status: string;
		external_course_id: string;
		tee_name: string | null;
		tee_gender: TeeGender | null;
		unlink_course: boolean;
	}>
): Promise<{ ok: boolean }> {
	return request(`/api/events/${shareCode}`, {
		method: 'PATCH',
		headers: { 'X-Admin-Pin': pin },
		body: JSON.stringify(patch)
	});
}

/** The star of the show: copy this weekend's event to next weekend. */
export function cloneEvent(shareCode: string, pin: string): Promise<CreateEventResult & { date: string }> {
	return request(`/api/events/${shareCode}/clone`, {
		method: 'POST',
		headers: { 'X-Admin-Pin': pin }
	});
}

/** URL for the recurring-series calendar file (ICS). */
export function icsUrl(shareCode: string): string {
	return `${API()}/api/events/${shareCode}/ics`;
}

/** One hit from the real-course search (backend proxy over GolfCourseAPI). */
export interface CourseResult {
	external_id: string;
	club_name: string;
	course_name: string;
	city: string;
	state: string;
	tees: { male?: TeeBox[]; female?: TeeBox[] };
}

// ---------- League mode (JWT-authed routes) ----------

/** Same request helper, plus the caller's Supabase access token. */
function authed(token: string): { Authorization: string } {
	return { Authorization: `Bearer ${token}` };
}

export interface CreateLeagueInput {
	name: string;
	scoring_mode?: ScoringMode;
	placement_points?: number[];
	display_name: string;
	handicap?: number;
}

export function createLeague(
	token: string,
	input: CreateLeagueInput
): Promise<{ share_code: string }> {
	return request('/api/leagues', {
		method: 'POST',
		headers: authed(token),
		body: JSON.stringify(input)
	});
}

export function updateLeague(
	token: string,
	code: string,
	patch: Partial<{ name: string; scoring_mode: ScoringMode; placement_points: number[] }>
): Promise<{ ok: boolean }> {
	return request(`/api/leagues/${code}`, {
		method: 'PATCH',
		headers: authed(token),
		body: JSON.stringify(patch)
	});
}

export function joinLeague(
	token: string,
	code: string,
	input: { display_name?: string; handicap?: number }
): Promise<{ ok: boolean }> {
	return request(`/api/leagues/${code}/join`, {
		method: 'POST',
		headers: authed(token),
		body: JSON.stringify(input)
	});
}

export function createSeason(
	token: string,
	code: string,
	input: { name: string; starts_on?: string; ends_on?: string }
): Promise<Season> {
	return request(`/api/leagues/${code}/seasons`, {
		method: 'POST',
		headers: authed(token),
		body: JSON.stringify(input)
	});
}

export function updateSeason(
	token: string,
	code: string,
	seasonId: string,
	patch: Partial<{ name: string; status: 'active' | 'complete' }>
): Promise<{ ok: boolean }> {
	return request(`/api/leagues/${code}/seasons/${seasonId}`, {
		method: 'PATCH',
		headers: authed(token),
		body: JSON.stringify(patch)
	});
}

export interface SeasonTeamInput {
	name: string;
	player1_user_id: string | null;
	player2_user_id: string | null;
}

/** Replace the season's fixed pairs wholesale. */
export function setSeasonTeams(
	token: string,
	code: string,
	seasonId: string,
	teams: SeasonTeamInput[]
): Promise<{ ok: boolean }> {
	return request(`/api/leagues/${code}/seasons/${seasonId}/teams`, {
		method: 'PUT',
		headers: authed(token),
		body: JSON.stringify({ teams })
	});
}

export interface CreateLeagueEventInput {
	season_id: string;
	title: string;
	course: string;
	date: string;
	holes: 9 | 18;
	external_course_id?: string;
	tee_name?: string | null;
	tee_gender?: TeeGender | null;
}

/** Schedule a league night — teams come pre-loaded from the season pairs. */
export function createLeagueEvent(
	token: string,
	code: string,
	input: CreateLeagueEventInput
): Promise<CreateEventResult & { date: string }> {
	return request(`/api/leagues/${code}/events`, {
		method: 'POST',
		headers: authed(token),
		body: JSON.stringify(input)
	});
}

/** URL for the league's full-schedule calendar file (ICS). */
export function leagueIcsUrl(code: string): string {
	return `${API()}/api/leagues/${code}/ics`;
}

/** degraded=true means the external API was unreachable — cached courses only. */
export function searchCourses(
	q: string,
	state: string
): Promise<{ results: CourseResult[]; degraded: boolean }> {
	return request(`/api/courses/search?q=${encodeURIComponent(q)}&state=${encodeURIComponent(state)}`);
}

// ---------- Scorecard import ----------

export interface ScanHole {
	number: number;
	par: number;
	handicap: number | null;
}

export interface ScanResult {
	club_name: string;
	holes: ScanHole[];
}

/** Reads pars + stroke index off a scorecard photo. No DB write. */
export function scanScorecard(imageBase64: string, mediaType: string): Promise<ScanResult> {
	return request('/api/courses/scan', {
		method: 'POST',
		body: JSON.stringify({ image_base64: imageBase64, media_type: mediaType })
	});
}

export interface ImportCourseInput {
	club_name: string;
	course_name?: string;
	address?: string;
	city?: string;
	state: string;
	holes: { par: number; handicap: number | null }[];
}

/** Persists a scorecard-derived course as a real, searchable `courses` row. */
export function importCourse(input: ImportCourseInput): Promise<CourseResult> {
	return request('/api/courses/import', { method: 'POST', body: JSON.stringify(input) });
}
