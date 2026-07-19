// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	/** Baked in at build time by vite.config.ts — see appVersion() there. */
	const __APP_VERSION__: string;
}

export {};
