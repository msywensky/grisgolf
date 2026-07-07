// Rune-powered store shared by every /event/[code] page: one fetch,
// one realtime subscription, everybody re-renders when scores land.
import { fetchEventBundle, subscribeToEvent } from './supabase';
import type { EventBundle } from './types';

class EventStore {
	bundle = $state<EventBundle | null>(null);
	loading = $state(true);
	error = $state<string | null>(null);
	code = $state('');

	private unsubscribe: (() => void) | null = null;

	/** Load an event by share code and start listening for live changes. */
	async load(code: string): Promise<void> {
		if (this.code === code && this.bundle) return;
		this.stop();
		this.code = code;
		this.loading = true;
		this.error = null;
		this.bundle = null;
		try {
			const bundle = await fetchEventBundle(code);
			if (!bundle) {
				this.error = "Couldn't find that scramble. Wrong link, or someone drank the URL. 🍺";
				return;
			}
			this.bundle = bundle;
			this.unsubscribe = subscribeToEvent(bundle.event.id, () => this.refresh());
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Something went sideways loading the event.';
		} finally {
			this.loading = false;
		}
	}

	/** Silent refetch (realtime events, polling, or after our own writes). */
	async refresh(): Promise<void> {
		if (!this.code) return;
		try {
			const bundle = await fetchEventBundle(this.code);
			if (bundle) this.bundle = bundle;
		} catch {
			// transient — the poller will try again
		}
	}

	stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}
}

export const eventStore = new EventStore();
