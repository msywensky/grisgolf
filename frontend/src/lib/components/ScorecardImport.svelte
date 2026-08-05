<script lang="ts">
	// Import a course from a scorecard photo: capture -> AI-read review
	// (editable before saving) -> persist as a real, searchable course row.
	import { importCourse, scanScorecard, type CourseResult } from '$lib/api';
	import { downscaleToDataUrl } from '$lib/images';
	import { getPrefState, setPrefState } from '$lib/session';
	import { US_STATES } from '$lib/courses';

	let { onimported, oncancel }: { onimported: (result: CourseResult) => void; oncancel: () => void } = $props();

	let step = $state<'capture' | 'review'>('capture');
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);

	let clubName = $state('');
	let address = $state('');
	let city = $state('');
	let usState = $state(getPrefState() ?? 'PA');
	let holes = $state<{ par: number; handicap: number | null }[]>([]);

	const parTotal = $derived(holes.reduce((sum, h) => sum + (h.par || 0), 0));
	const canSave = $derived(clubName.trim().length > 0 && usState.trim().length === 2 && holes.length > 0);

	async function onFileChange(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		busy = true;
		errorMsg = null;
		try {
			const { base64, mediaType } = await downscaleToDataUrl(file, 2000);
			const result = await scanScorecard(base64, mediaType);
			clubName = result.club_name;
			holes = result.holes.map((h) => ({ par: h.par, handicap: h.handicap }));
			step = 'review';
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : "Couldn't read that scorecard.";
		} finally {
			busy = false;
		}
	}

	async function save() {
		if (!canSave) return;
		busy = true;
		errorMsg = null;
		try {
			const result = await importCourse({
				club_name: clubName.trim(),
				address: address.trim(),
				city: city.trim(),
				state: usState.trim().toUpperCase(),
				holes: holes.map((h) => ({ par: h.par, handicap: h.handicap }))
			});
			setPrefState(usState.trim().toUpperCase());
			onimported(result);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not save that course.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="space-y-3">
	{#if step === 'capture'}
		<label
			class="tap press-pop flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/20 px-4 py-6 text-sm font-semibold text-stone-200"
		>
			📸 {busy ? 'Reading scorecard…' : 'Take or choose a photo of the scorecard'}
			<input
				type="file"
				accept="image/*"
				capture="environment"
				class="hidden"
				onchange={onFileChange}
				disabled={busy}
			/>
		</label>
		{#if errorMsg}
			<p class="rounded-xl bg-red-900/50 px-4 py-3 text-sm text-red-200">{errorMsg}</p>
		{/if}
		<button type="button" class="tap text-xs font-semibold text-stone-500 underline" onclick={oncancel}>
			Never mind
		</button>
	{:else}
		<p class="text-xs text-stone-400">
			Double-check the pars below — anything we couldn't read clearly is flagged in red.
		</p>
		<div class="max-h-64 space-y-1.5 overflow-y-auto pr-1">
			{#each holes as hole, i (i)}
				<div class="flex items-center gap-2 rounded-xl border border-white/15 bg-black/20 px-3 py-2">
					<span class="w-14 shrink-0 text-xs font-bold text-stone-400">Hole {i + 1}</span>
					<label class="flex flex-1 items-center gap-1.5 text-xs text-stone-400">
						Par
						<input
							type="number"
							min="3"
							max="6"
							class="tap w-14 rounded-lg border px-2 py-1 text-center text-white {hole.par
								? 'border-white/15 bg-black/20'
								: 'border-red-500 bg-red-950/40'}"
							bind:value={hole.par}
						/>
					</label>
					<label class="flex flex-1 items-center gap-1.5 text-xs text-stone-400">
						HDCP
						<input
							type="number"
							min="1"
							max={holes.length}
							class="tap w-14 rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-center text-white"
							bind:value={hole.handicap}
						/>
					</label>
				</div>
			{/each}
		</div>
		<p class="text-xs font-semibold text-stone-400">Total par: {parTotal}</p>

		<div class="space-y-2 pt-1">
			<input
				class="tap w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-stone-500"
				placeholder="Course name"
				bind:value={clubName}
			/>
			<input
				class="tap w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-stone-500"
				placeholder="Address (optional)"
				bind:value={address}
			/>
			<div class="flex gap-2">
				<input
					class="tap min-w-0 flex-1 rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-stone-500"
					placeholder="City"
					bind:value={city}
				/>
				<select
					class="tap shrink-0 rounded-xl border border-white/15 bg-black/20 px-3 py-3 font-bold text-white"
					bind:value={usState}
					aria-label="State"
				>
					{#each US_STATES as st (st.code)}
						<option value={st.code} class="bg-stone-900">{st.code}</option>
					{/each}
				</select>
			</div>
		</div>

		{#if errorMsg}
			<p class="rounded-xl bg-red-900/50 px-4 py-3 text-sm text-red-200">{errorMsg}</p>
		{/if}

		<div class="flex gap-3 pt-1">
			<button
				type="button"
				class="tap press-pop flex-1 rounded-2xl border border-white/15 bg-black/20 py-3 font-bold text-stone-300"
				onclick={() => (step = 'capture')}
				disabled={busy}
			>
				Retake photo
			</button>
			<button
				type="button"
				class="tap press-pop flex-1 rounded-2xl bg-fairway-600 py-3 font-bold text-white hover:bg-fairway-500 disabled:opacity-50"
				onclick={save}
				disabled={busy || !canSave}
			>
				{busy ? 'Saving…' : 'Save course ⛳'}
			</button>
		</div>
	{/if}
</div>
