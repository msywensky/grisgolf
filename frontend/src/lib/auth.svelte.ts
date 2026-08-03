// Rune-powered auth store. League mode only — casual scrambles never need
// an account. Magic-link redirects are handled by supabase-js itself
// (detectSessionInUrl), so any page can be the landing spot.
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

class AuthStore {
	session = $state<Session | null>(null);
	/** True until the initial getSession() resolves — gate UI on this. */
	loading = $state(true);

	private started = false;

	/** Idempotent; called from the root layout. */
	init(): void {
		if (this.started) return;
		this.started = true;
		const sb = supabase();
		sb.auth.getSession().then(({ data }) => {
			this.session = data.session;
			this.loading = false;
		});
		sb.auth.onAuthStateChange((_evt, session) => {
			this.session = session;
			this.loading = false;
		});
	}

	get userId(): string | null {
		return this.session?.user.id ?? null;
	}

	get accessToken(): string | null {
		return this.session?.access_token ?? null;
	}

	/** Send a magic link that lands the user back where they started. */
	async signInWithEmail(email: string): Promise<void> {
		const { error } = await supabase().auth.signInWithOtp({
			email,
			options: { emailRedirectTo: location.href }
		});
		if (error) throw error;
	}

	async signOut(): Promise<void> {
		await supabase().auth.signOut();
	}
}

export const authStore = new AuthStore();
