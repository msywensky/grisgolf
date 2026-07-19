// Featherweight "auth": we remember who you are per-event in localStorage.
// Good enough for a beer-league MVP — no passwords, no tears.

const key = (code: string, what: string) => `hmb:${code}:${what}`;

export function getMyGolferId(code: string): string | null {
	return localStorage.getItem(key(code, 'golfer'));
}

export function setMyGolferId(code: string, id: string): void {
	localStorage.setItem(key(code, 'golfer'), id);
}

export function getMyTeamId(code: string): string | null {
	return localStorage.getItem(key(code, 'team'));
}

export function setMyTeamId(code: string, id: string): void {
	localStorage.setItem(key(code, 'team'), id);
}

export function getAdminPin(code: string): string | null {
	return localStorage.getItem(key(code, 'pin'));
}

export function setAdminPin(code: string, pin: string): void {
	localStorage.setItem(key(code, 'pin'), pin);
}

// Global (not per-event) prefs — the crew crosses state lines, so the course
// search remembers the last state they picked.

const PREF_STATE_KEY = 'hmb:prefs:state';

export function getPrefState(): string | null {
	return localStorage.getItem(PREF_STATE_KEY);
}

export function setPrefState(state: string): void {
	localStorage.setItem(PREF_STATE_KEY, state);
}
