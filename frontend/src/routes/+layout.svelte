<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-8">
	{@render children()}

	<footer class="mt-auto pt-10 text-center text-xs text-stone-400">
		🍺 Hold My Beer Scramble v{__APP_VERSION__} — drink responsibly, putt irresponsibly.
	</footer>
</div>
