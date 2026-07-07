<script lang="ts">
	import HighlightComposer from '$lib/components/HighlightComposer.svelte';
	import { page } from '$app/state';
	import { eventStore } from '$lib/eventStore.svelte';
	import { renderShareCard, shareCard } from '$lib/sharecard';
	import { getMyTeamId } from '$lib/session';
	import type { Highlight } from '$lib/types';

	const code = $derived(page.params.code ?? '');
	const bundle = $derived(eventStore.bundle);

	let composerOpen = $state(false);
	let sharingId = $state<string | null>(null);
	let sharedId = $state<string | null>(null);

	function teamName(h: Highlight): string {
		return bundle?.teams.find((t) => t.id === h.team_id)?.name ?? 'The Crew';
	}

	async function share(h: Highlight) {
		if (!bundle) return;
		sharingId = h.id;
		try {
			const blob = await renderShareCard(h, bundle.event, teamName(h));
			await shareCard(blob, `${bundle.event.title} highlight`, location.href);
			sharedId = h.id;
			setTimeout(() => (sharedId = null), 2000);
		} finally {
			sharingId = null;
		}
	}
</script>

{#if bundle}
	<div class="mb-4 flex items-center justify-between">
		<h2 class="text-lg font-bold text-white">The Glory Reel 📸</h2>
		<button
			class="tap press-pop bg-brew-500 hover:bg-brew-400 rounded-xl px-4 py-2 text-sm font-black text-stone-900"
			onclick={() => (composerOpen = true)}
		>
			⚡ Add highlight
		</button>
	</div>

	{#if bundle.highlights.length === 0}
		<div class="card p-10 text-center text-stone-300">
			<div class="text-5xl">🎬</div>
			<p class="mt-3 font-bold">No highlights yet.</p>
			<p class="text-sm text-stone-400">
				Surely <em>someone</em> has done something legendary (or legendarily bad) by now.
			</p>
		</div>
	{:else}
		<div class="space-y-4">
			{#each bundle.highlights as h (h.id)}
				<article class="card wobble-in overflow-hidden">
					{#if h.image_url}
						<img
							src={h.image_url}
							alt={h.caption}
							class="max-h-80 w-full object-cover"
							loading="lazy"
						/>
					{/if}
					<div class="space-y-2 p-4">
						<p class="text-lg font-bold text-white">“{h.caption}”</p>
						<p class="text-xs text-stone-400">
							{teamName(h)}
							{#if h.hole_number}
								· Hole {h.hole_number}
							{/if}
							· {new Date(h.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
						</p>
						<button
							class="tap press-pop card w-full rounded-xl py-2.5 text-sm font-bold text-stone-200"
							onclick={() => share(h)}
							disabled={sharingId === h.id}
						>
							{sharingId === h.id
								? 'Rendering card…'
								: sharedId === h.id
									? 'Sent! 🍻'
									: '📤 Share this masterpiece'}
						</button>
					</div>
				</article>
			{/each}
		</div>
	{/if}

	{#if composerOpen}
		<HighlightComposer
			{bundle}
			teamId={getMyTeamId(code)}
			hole={null}
			onclose={() => (composerOpen = false)}
		/>
	{/if}
{/if}
