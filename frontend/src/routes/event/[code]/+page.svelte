<script lang="ts">
	import { page } from '$app/state';
	import Leaderboard from '$lib/components/Leaderboard.svelte';
	import { eventStore } from '$lib/eventStore.svelte';
	import { getMyGolferId } from '$lib/session';

	const code = $derived(page.params.code ?? '');
	const bundle = $derived(eventStore.bundle);
	const joined = $derived.by(() => {
		void code;
		try {
			return !!getMyGolferId(code);
		} catch {
			return false;
		}
	});

	// Scorecard grid: hole -> team_id -> score/notes
	const scoreFor = $derived.by(() => {
		const map = new Map<string, { score: number; notes: string | null }>();
		for (const s of bundle?.scores ?? []) {
			map.set(`${s.hole_number}:${s.team_id}`, { score: s.score, notes: s.notes });
		}
		return map;
	});

	const holeNumbers = $derived(
		bundle ? Array.from({ length: bundle.event.holes }, (_, i) => i + 1) : []
	);
</script>

{#if bundle}
	{#if !joined && bundle.event.status !== 'final'}
		<a
			href="/event/{code}/join"
			class="tap press-pop bg-brew-500 hover:bg-brew-400 mb-5 block rounded-2xl px-6 py-4 text-center text-lg font-bold text-stone-900 shadow-lg shadow-black/30"
		>
			🍻 Join this scramble
		</a>
	{/if}

	<Leaderboard {bundle} />

	{#if bundle.teams.length > 0}
		<h2 class="mt-8 mb-3 text-lg font-bold text-white">Scorecard</h2>
		<div class="card overflow-x-auto p-2">
			<table class="w-full min-w-max text-sm">
				<thead>
					<tr class="text-stone-400">
						<th class="sticky left-0 bg-fairway-950/90 px-2 py-2 text-left font-semibold">Hole</th>
						{#each bundle.teams as team (team.id)}
							<th class="max-w-28 truncate px-2 py-2 text-center font-semibold" title={team.name}>
								{team.name}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each holeNumbers as hole (hole)}
						<tr class="border-t border-white/5">
							<td class="sticky left-0 bg-fairway-950/90 px-2 py-1.5 font-bold text-stone-300">
								{hole}
							</td>
							{#each bundle.teams as team (team.id)}
								{@const cell = scoreFor.get(`${hole}:${team.id}`)}
								<td class="px-2 py-1.5 text-center">
									{#if cell}
										<span
											class="inline-block min-w-7 rounded-lg px-1.5 py-0.5 font-bold {cell.score <= 3
												? 'bg-fairway-600 text-white'
												: cell.score >= 6
													? 'bg-red-900/60 text-red-200'
													: 'text-stone-200'}"
											title={cell.notes ?? ''}
										>
											{cell.score}{cell.notes ? '*' : ''}
										</span>
									{:else}
										<span class="text-stone-600">·</span>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="mt-2 text-right text-[11px] text-stone-500">* has a note — tap/hover to read the lore</p>
	{/if}

	{#if bundle.highlights.length > 0}
		<a
			href="/event/{code}/highlights"
			class="card press-pop mt-6 flex items-center justify-between p-4 hover:bg-white/10"
		>
			<span class="font-bold text-white">📸 {bundle.highlights.length} highlight{bundle.highlights.length === 1 ? '' : 's'} so far</span>
			<span class="text-brew-300 font-semibold">See the glory →</span>
		</a>
	{/if}
{/if}
