<script lang="ts">
	// The on-course screen. Design goals: one thumb, bright sun, two beers deep.
	import { page } from '$app/state';
	import HighlightComposer from '$lib/components/HighlightComposer.svelte';
	import { NOTE_CHIPS } from '$lib/copy';
	import { eventStore } from '$lib/eventStore.svelte';
	import { buildLeaderboard, scoreReaction } from '$lib/scoring';
	import { getMyTeamId, setMyTeamId } from '$lib/session';
	import { supabase } from '$lib/supabase';

	const code = $derived(page.params.code ?? '');
	const bundle = $derived(eventStore.bundle);

	let teamId = $state<string | null>(null);
	let hole = $state(1);
	let notes = $state('');
	// Staged "whose shots counted" split for the current hole (0 = untagged).
	let p1Shots = $state(0);
	let p2Shots = $state(0);
	let saving = $state(false);
	let toast = $state<string | null>(null);
	let errorMsg = $state<string | null>(null);
	let composerOpen = $state(false);

	// Restore team choice; jump to the first unscored hole so resuming is instant.
	$effect(() => {
		if (!bundle || teamId) return;
		const remembered = getMyTeamId(code);
		if (remembered && bundle.teams.some((t) => t.id === remembered)) {
			teamId = remembered;
			gotoHole(firstOpenHole(remembered));
		}
	});

	const myTeam = $derived(bundle?.teams.find((t) => t.id === teamId) ?? null);
	const myScores = $derived((bundle?.scores ?? []).filter((s) => s.team_id === teamId));
	const currentEntry = $derived(myScores.find((s) => s.hole_number === hole) ?? null);
	const player1 = $derived(
		bundle?.golfers.find((g) => g.id === myTeam?.player1_id) ?? null
	);
	const player2 = $derived(
		bundle?.golfers.find((g) => g.id === myTeam?.player2_id) ?? null
	);
	const myRow = $derived.by(() => {
		if (!bundle || !teamId) return null;
		return (
			buildLeaderboard(bundle.event, bundle.teams, bundle.golfers, bundle.scores).find(
				(r) => r.team.id === teamId
			) ?? null
		);
	});

	function firstOpenHole(tid: string): number {
		if (!bundle) return 1;
		const scored = new Set(
			bundle.scores.filter((s) => s.team_id === tid).map((s) => s.hole_number)
		);
		for (let h = 1; h <= bundle.event.holes; h++) if (!scored.has(h)) return h;
		return bundle.event.holes;
	}

	function pickTeam(id: string) {
		teamId = id;
		setMyTeamId(code, id);
		gotoHole(firstOpenHole(id));
	}

	// Central hole switch: reset the staged note/split to what's saved there.
	function gotoHole(h: number) {
		hole = h;
		notes = '';
		const saved = (bundle?.scores ?? []).find(
			(s) => s.team_id === teamId && s.hole_number === h
		);
		p1Shots = saved?.player1_shots ?? 0;
		p2Shots = saved?.player2_shots ?? 0;
	}

	function moveHole(delta: number) {
		if (!bundle) return;
		gotoHole(Math.min(bundle.event.holes, Math.max(1, hole + delta)));
	}

	async function saveScore(value: number) {
		if (!bundle || !teamId || saving) return;
		saving = true;
		errorMsg = null;
		try {
			const { error } = await supabase()
				.from('scores')
				.upsert(
					{
						event_id: bundle.event.id,
						team_id: teamId,
						hole_number: hole,
						score: value,
						// An all-zero split means "not tracked", not "nobody hit anything".
						player1_shots: p1Shots || p2Shots ? p1Shots : null,
						player2_shots: p1Shots || p2Shots ? p2Shots : null,
						notes: notes.trim() || currentEntry?.notes || null
					},
					{ onConflict: 'event_id,team_id,hole_number' }
				);
			if (error) throw error;
			toast = scoreReaction(value);
			setTimeout(() => (toast = null), 2500);
			await eventStore.refresh();
			// Auto-advance so the flow is tap-score → walk to next tee.
			if (hole < bundle.event.holes) moveHole(1);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Score didn’t stick. One more time.';
		} finally {
			saving = false;
		}
	}

	// Tag whose ball got used. On a hole that's already saved, persist right away;
	// otherwise it stays staged and rides along with the next score tap.
	async function adjustShots(slot: 1 | 2, delta: number) {
		const next = Math.min(10, Math.max(0, (slot === 1 ? p1Shots : p2Shots) + delta));
		if (slot === 1) p1Shots = next;
		else p2Shots = next;
		if (!bundle || !teamId || !currentEntry) return;
		errorMsg = null;
		const { error } = await supabase()
			.from('scores')
			.upsert(
				{
					event_id: bundle.event.id,
					team_id: teamId,
					hole_number: hole,
					score: currentEntry.score,
					player1_shots: p1Shots || p2Shots ? p1Shots : null,
					player2_shots: p1Shots || p2Shots ? p2Shots : null,
					notes: currentEntry.notes
				},
				{ onConflict: 'event_id,team_id,hole_number' }
			);
		if (error) {
			errorMsg = error.message;
			return;
		}
		await eventStore.refresh();
	}
</script>

{#if bundle}
	{#if !myTeam}
		<!-- Team picker -->
		<div class="card wobble-in space-y-3 p-5">
			<h2 class="text-lg font-bold text-white">Whose card is this? 📋</h2>
			{#if bundle.teams.length === 0}
				<p class="text-sm text-stone-400">No teams yet — go join first!</p>
				<a
					href="/event/{code}/join"
					class="tap press-pop bg-brew-500 block rounded-2xl px-6 py-3.5 text-center font-bold text-stone-900"
				>
					🍻 Join the scramble
				</a>
			{:else}
				{#each bundle.teams as team (team.id)}
					<button
						class="tap press-pop w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3.5 text-left font-bold text-white hover:bg-white/10"
						onclick={() => pickTeam(team.id)}
					>
						{team.name}
					</button>
				{/each}
			{/if}
		</div>
	{:else}
		<div class="space-y-4">
			<!-- Running totals -->
			{#if myRow}
				<div class="card flex items-center justify-around p-3 text-center">
					<div>
						<p class="text-xl font-black text-white">{myRow.gross}</p>
						<p class="text-[10px] tracking-wide text-stone-400 uppercase">Gross</p>
					</div>
					<div>
						<p class="text-brew-300 text-xl font-black">{myRow.net}</p>
						<p class="text-[10px] tracking-wide text-stone-400 uppercase">Net</p>
					</div>
					<div>
						<p class="text-fairway-300 text-xl font-black">{myRow.matchPoints}</p>
						<p class="text-[10px] tracking-wide text-stone-400 uppercase">Pts</p>
					</div>
					<div>
						<p class="text-xl font-black text-white">{myRow.thru}/{bundle.event.holes}</p>
						<p class="text-[10px] tracking-wide text-stone-400 uppercase">Thru</p>
					</div>
				</div>
			{/if}

			<!-- Hole navigation -->
			<div class="flex items-center justify-between gap-2">
				<button
					class="tap press-pop card w-16 rounded-2xl py-3 text-2xl font-black text-stone-300 disabled:opacity-30"
					onclick={() => moveHole(-1)}
					disabled={hole <= 1}
				>
					←
				</button>
				<div class="text-center">
					<p class="text-xs font-bold tracking-widest text-stone-400 uppercase">{myTeam.name}</p>
					<p class="font-display text-4xl font-black text-white">Hole {hole}</p>
					{#if currentEntry}
						<p class="text-brew-300 text-xs font-bold">saved: {currentEntry.score}</p>
					{/if}
				</div>
				<button
					class="tap press-pop card w-16 rounded-2xl py-3 text-2xl font-black text-stone-300 disabled:opacity-30"
					onclick={() => moveHole(1)}
					disabled={hole >= bundle.event.holes}
				>
					→
				</button>
			</div>

			<!-- Score pad: one tap saves and advances -->
			<div class="grid grid-cols-5 gap-2">
				{#each Array.from({ length: 10 }, (_, i) => i + 1) as n (n)}
					<button
						class="tap press-pop aspect-square rounded-2xl text-2xl font-black shadow-md {currentEntry?.score === n
							? 'bg-brew-500 text-stone-900'
							: n <= 3
								? 'bg-fairway-600 text-white'
								: n <= 5
									? 'bg-fairway-800 text-white'
									: 'bg-white/10 text-stone-200'} disabled:opacity-50"
						onclick={() => saveScore(n)}
						disabled={saving}
					>
						{n}
					</button>
				{/each}
			</div>

			<!-- Whose shots counted -->
			{#if player1 || player2}
				<div class="card space-y-2.5 p-4">
					<div class="flex items-baseline justify-between">
						<p class="text-xs font-bold tracking-widest text-stone-400 uppercase">
							Whose shots counted?
						</p>
						{#if currentEntry}
							<p
								class="text-[11px] font-semibold {p1Shots + p2Shots === currentEntry.score
									? 'text-fairway-300'
									: 'text-stone-500'}"
							>
								{p1Shots + p2Shots}/{currentEntry.score} tagged
							</p>
						{/if}
					</div>
					{#each [{ slot: 1 as const, golfer: player1, count: p1Shots }, { slot: 2 as const, golfer: player2, count: p2Shots }] as row (row.slot)}
						{#if row.golfer}
							<div class="flex items-center justify-between gap-3">
								<p class="min-w-0 truncate font-bold text-white">{row.golfer.name}</p>
								<div class="flex items-center gap-1.5">
									<button
										class="tap press-pop h-11 w-11 rounded-xl bg-white/10 text-xl font-black text-stone-200 disabled:opacity-30"
										onclick={() => adjustShots(row.slot, -1)}
										disabled={row.count <= 0}
										aria-label="Fewer shots for {row.golfer.name}"
									>
										−
									</button>
									<span class="w-9 text-center text-xl font-black text-white">{row.count}</span>
									<button
										class="tap press-pop h-11 w-11 rounded-xl bg-white/10 text-xl font-black text-stone-200 disabled:opacity-30"
										onclick={() => adjustShots(row.slot, 1)}
										disabled={row.count >= 10}
										aria-label="More shots for {row.golfer.name}"
									>
										+
									</button>
								</div>
							</div>
						{/if}
					{/each}
					{#if !currentEntry}
						<p class="text-[11px] text-stone-500">Saves with the score when you tap a number.</p>
					{/if}
				</div>
			{/if}

			<!-- Note chips -->
			<div class="flex flex-wrap gap-2">
				{#each NOTE_CHIPS as chip (chip)}
					<button
						class="tap press-pop rounded-full px-3 py-1.5 text-xs font-bold {notes === chip
							? 'bg-brew-500 text-stone-900'
							: 'card text-stone-300'}"
						onclick={() => (notes = notes === chip ? '' : chip)}
					>
						{chip}
					</button>
				{/each}
			</div>
			<input
				class="tap w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-stone-500"
				placeholder="…or type your own hole note"
				bind:value={notes}
			/>

			{#if errorMsg}
				<p class="rounded-xl bg-red-900/50 px-4 py-3 text-sm text-red-200">{errorMsg}</p>
			{/if}

			<!-- Epic Shot -->
			<button
				class="tap press-pop w-full rounded-2xl bg-gradient-to-r from-brew-500 to-brew-600 py-4 text-lg font-black text-stone-900 shadow-lg shadow-black/30"
				onclick={() => (composerOpen = true)}
			>
				⚡ EPIC SHOT — make it a highlight
			</button>

			<button
				class="tap w-full py-2 text-center text-xs font-semibold text-stone-500 underline"
				onclick={() => (teamId = null)}
			>
				Scoring for a different team?
			</button>
		</div>

		{#if toast}
			<div
				class="wobble-in pointer-events-none fixed inset-x-0 bottom-24 z-30 mx-auto w-fit max-w-[90%] rounded-2xl bg-stone-900/95 px-5 py-3 text-center font-bold text-white shadow-xl"
			>
				{toast}
			</div>
		{/if}

		{#if composerOpen}
			<HighlightComposer {bundle} {teamId} {hole} onclose={() => (composerOpen = false)} />
		{/if}
	{/if}
{/if}
