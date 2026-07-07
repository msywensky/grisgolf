// Thin wrapper around the FastAPI backend (custom logic: event creation,
// admin auth, cloning, ICS export). Everything else talks to Supabase directly.
import { env } from '$env/dynamic/public';

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
	patch: Partial<{ title: string; course: string; date: string; status: string }>
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
