// Rune-powered store shared by every /league/[code] page. League pages are
// standings/schedule views, not mid-swing scoreboards, so there's no realtime
// subscription — callers refresh() after their own writes (the live action
// happens on the event pages, which have their own store).
import { fetchLeagueBundle } from './supabase';
import type { LeagueBundle } from './types';

class LeagueStore {
	bundle = $state<LeagueBundle | null>(null);
	loading = $state(true);
	error = $state<string | null>(null);
	code = $state('');

	private loadToken = 0;

	async load(code: string): Promise<void> {
		if (this.code === code && this.bundle) return;
		this.code = code;
		this.loading = true;
		this.error = null;
		this.bundle = null;
		const token = ++this.loadToken;
		try {
			const bundle = await fetchLeagueBundle(code);
			if (token !== this.loadToken) return; // superseded by a newer load()
			if (!bundle) {
				this.error = "Couldn't find that league. Wrong link, or the season got rained out. 🍺";
				return;
			}
			this.bundle = bundle;
		} catch (e) {
			if (token !== this.loadToken) return;
			this.error = e instanceof Error ? e.message : 'Something went sideways loading the league.';
		} finally {
			if (token === this.loadToken) this.loading = false;
		}
	}

	/** Silent refetch after our own writes. */
	async refresh(): Promise<void> {
		if (!this.code) return;
		try {
			const bundle = await fetchLeagueBundle(this.code);
			if (bundle) this.bundle = bundle;
		} catch {
			// transient — the next navigation will retry
		}
	}
}

export const leagueStore = new LeagueStore();
