import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Pinned explicitly: adapter-auto's bundled version lags behind
		// Vercel's build Node version and fails with "unsupported Node.js version".
		adapter: adapter({ runtime: 'nodejs20.x' })
	}
};

export default config;
