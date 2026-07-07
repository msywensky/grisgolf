<script lang="ts">
	// Bottom-sheet composer for "Epic Shot" moments: caption + optional photo,
	// saved to Supabase, then an instant share card for the group chat.
	import { randomHighlightPrompt } from '$lib/copy';
	import { renderShareCard, shareCard } from '$lib/sharecard';
	import { supabase, uploadHighlightPhoto } from '$lib/supabase';
	import type { EventBundle, Highlight } from '$lib/types';

	let {
		bundle,
		teamId,
		hole,
		onclose
	}: {
		bundle: EventBundle;
		teamId: string | null;
		hole: number | null;
		onclose: () => void;
	} = $props();

	let caption = $state('');
	let file = $state<File | null>(null);
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);
	let saved = $state<Highlight | null>(null);
	let shareState = $state<'idle' | 'working' | 'shared' | 'downloaded' | 'copied'>('idle');

	const placeholder = randomHighlightPrompt();
	const teamName = $derived(bundle.teams.find((t) => t.id === teamId)?.name ?? 'The Crew');

	function onFileChange(e: Event) {
		file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!caption.trim()) return;
		busy = true;
		errorMsg = null;
		try {
			let imageUrl: string | null = null;
			if (file) imageUrl = await uploadHighlightPhoto(bundle.event.id, file);
			const { data, error } = await supabase()
				.from('highlights')
				.insert({
					event_id: bundle.event.id,
					hole_number: hole,
					team_id: teamId,
					caption: caption.trim(),
					image_url: imageUrl
				})
				.select()
				.single();
			if (error) throw error;
			saved = data;
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Highlight got lost in the rough.';
		} finally {
			busy = false;
		}
	}

	async function doShare() {
		if (!saved) return;
		shareState = 'working';
		try {
			const blob = await renderShareCard(saved, bundle.event, teamName);
			const url = `${location.origin}/event/${bundle.event.share_code}/highlights`;
			shareState = await shareCard(blob, `${bundle.event.title} highlight`, url);
		} catch {
			shareState = 'idle';
			errorMsg = 'Card generator whiffed. Try again?';
		}
	}

	async function copyLink() {
		await navigator.clipboard.writeText(
			`${location.origin}/event/${bundle.event.share_code}/highlights`
		);
		shareState = 'copied';
	}
</script>

<!-- Backdrop -->
<div
	class="fixed inset-0 z-40 bg-black/60"
	onclick={onclose}
	onkeydown={(e) => e.key === 'Escape' && onclose()}
	role="button"
	tabindex="-1"
	aria-label="Close"
></div>

<!-- Sheet -->
<div class="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-3xl">
	<div class="wobble-in rounded-t-3xl border border-white/10 bg-fairway-900 p-6 pb-10 shadow-2xl">
		{#if !saved}
			<form class="space-y-4" onsubmit={save}>
				<h2 class="text-xl font-black text-white">
					⚡ Epic Shot{hole ? ` · Hole ${hole}` : ''}
				</h2>
				<textarea
					class="tap w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-white placeholder:text-stone-500"
					rows="3"
					{placeholder}
					bind:value={caption}
					required
				></textarea>
				<label
					class="tap press-pop card flex cursor-pointer items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-stone-200"
				>
					📷 {file ? file.name : 'Add a photo (optional)'}
					<input type="file" accept="image/*" capture="environment" class="hidden" onchange={onFileChange} />
				</label>
				{#if errorMsg}
					<p class="rounded-xl bg-red-900/50 px-4 py-3 text-sm text-red-200">{errorMsg}</p>
				{/if}
				<div class="flex gap-3">
					<button
						type="button"
						class="tap press-pop card flex-1 rounded-2xl py-3.5 font-bold text-stone-300"
						onclick={onclose}
					>
						Never mind
					</button>
					<button
						type="submit"
						class="tap press-pop bg-brew-500 hover:bg-brew-400 flex-1 rounded-2xl py-3.5 font-bold text-stone-900 disabled:opacity-50"
						disabled={busy || !caption.trim()}
					>
						{busy ? 'Engraving…' : 'Save highlight 🏆'}
					</button>
				</div>
			</form>
		{:else}
			<div class="space-y-4 text-center">
				<div class="text-5xl">🎉</div>
				<h2 class="text-xl font-black text-white">Immortalized!</h2>
				<p class="text-sm text-stone-300">Now flex on the group chat:</p>
				<div class="flex gap-3">
					<button
						class="tap press-pop bg-brew-500 hover:bg-brew-400 flex-1 rounded-2xl py-3.5 font-bold text-stone-900"
						onclick={doShare}
						disabled={shareState === 'working'}
					>
						{shareState === 'working'
							? 'Rendering…'
							: shareState === 'shared'
								? 'Shared! 🍻'
								: shareState === 'downloaded'
									? 'Card saved! 📥'
									: '📸 Share card'}
					</button>
					<button class="tap press-pop card flex-1 rounded-2xl py-3.5 font-bold text-stone-200" onclick={copyLink}>
						{shareState === 'copied' ? 'Copied! ✅' : '🔗 Copy link'}
					</button>
				</div>
				<button class="tap text-sm font-semibold text-stone-400 underline" onclick={onclose}>
					Back to golf
				</button>
			</div>
		{/if}
	</div>
</div>
