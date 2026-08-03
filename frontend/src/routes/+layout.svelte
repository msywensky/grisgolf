<script lang="ts">
	import '../app.css';
	import { authStore } from '$lib/auth.svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	// League-mode sessions (magic links land anywhere; supabase-js picks the
	// token out of the URL). Casual scramble pages never look at this.
	authStore.init();
</script>

<div class="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-8">
	{@render children()}

	<footer class="mt-auto pt-10 text-center text-xs text-stone-400">
		🍺 Hold My Beer Scramble v{__APP_VERSION__} — drink responsibly, putt irresponsibly.
	</footer>
</div>
