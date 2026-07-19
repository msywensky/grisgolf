// Thin wrapper around the FastAPI backend (custom logic: event creation,
// admin auth, cloning, ICS export, course search). Everything else talks to
// Supabase directly.
import { env } from '$env/dynamic/public';
import type { TeeBox, TeeGender } from './types';

const API = () => env.PUBLIC_API_URL ?? 'http://localhost:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`${API()}${path}`, {
			headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
			...init
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
	external_course_id?: number;
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
		external_course_id: number;
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
	external_id: number;
	club_name: string;
	course_name: string;
	city: string;
	state: string;
	tees: { male?: TeeBox[]; female?: TeeBox[] };
}

/** degraded=true means the external API was unreachable — cached courses only. */
export function searchCourses(
	q: string,
	state: string
): Promise<{ results: CourseResult[]; degraded: boolean }> {
	return request(`/api/courses/search?q=${encodeURIComponent(q)}&state=${encodeURIComponent(state)}`);
}
