<script lang="ts">
	import { buildLeaderboard, type LeaderboardRow } from '$lib/scoring';
	import type { EventBundle } from '$lib/types';

	let { bundle }: { bundle: EventBundle } = $props();

	type SortKey = 'net' | 'gross' | 'points';
	let sortBy = $state<SortKey>('net');

	const rows = $derived.by(() => {
		const base = buildLeaderboard(bundle.event, bundle.teams, bundle.golfers, bundle.scores);
		if (sortBy === 'net') return base; // already ranked by net
		const sorted = [...base];
		if (sortBy === 'gross') sorted.sort((a, b) => (a.thru === 0 ? 1 : b.thru === 0 ? -1 : a.gross - b.gross));
		if (sortBy === 'points') sorted.sort((a, b) => b.matchPoints - a.matchPoints);
		return sorted;
	});

	function medal(row: LeaderboardRow): string {
		if (row.thru === 0) return '💤';
		return ['🥇', '🥈', '🥉'][row.position - 1] ?? `${row.position}`;
	}

	/** "Rick 12 · Tommy 9" — shots-used totals matched back to roster slots. */
	function shotsLine(row: LeaderboardRow): string | null {
		if (!row.shotsUsed) return null;
		const name = (id: string | null) =>
			row.players.find((p) => p.id === id)?.name.split(' ')[0] ?? '?';
		return `${name(row.team.player1_id)} ${row.shotsUsed.p1} · ${name(row.team.player2_id)} ${row.shotsUsed.p2}`;
	}

	const sortButtons: { key: SortKey; label: string }[] = [
		{ key: 'net', label: 'Net' },
		{ key: 'gross', label: 'Gross' },
		{ key: 'points', label: 'Points' }
	];
</script>

{#if rows.length === 0}
	<div class="card p-8 text-center text-stone-300">
		<div class="text-4xl">🦗</div>
		<p class="mt-2 font-semibold">No teams yet — it's quiet out here.</p>
		<p class="text-sm text-stone-400">Hit “Join” and bring a buddy.</p>
	</div>
{:else}
	<div class="mb-3 flex items-center justify-between">
		<h2 class="text-lg font-bold text-white">Leaderboard</h2>
		<div class="flex gap-1 text-xs">
			{#each sortButtons as sb (sb.key)}
				<button
					class="tap press-pop rounded-lg px-3 py-1.5 font-bold {sortBy === sb.key
						? 'bg-brew-500 text-stone-900'
						: 'card text-stone-300'}"
					onclick={() => (sortBy = sb.key)}
				>
					{sb.label}
				</button>
			{/each}
		</div>
	</div>

	<ol class="space-y-2">
		{#each rows as row (row.team.id)}
			<li class="card wobble-in flex items-center gap-3 p-3">
				<div class="w-9 text-center text-2xl font-black">{medal(row)}</div>
				<div class="min-w-0 flex-1">
					<p class="truncate font-bold text-white">{row.team.name}</p>
					<p class="truncate text-xs text-stone-400">
						{row.players.map((p) => p.name).join(' & ') || 'Roster TBD'}
						{#if row.thru > 0}
							· thru {row.thru}
						{/if}
					</p>
					{#if shotsLine(row)}
						<p class="text-brew-300/80 truncate text-[11px] font-semibold">
							🏌️ {shotsLine(row)} shots used
						</p>
					{/if}
				</div>
				<div class="flex gap-4 text-center">
					<div>
						<p class="text-lg font-black text-white">{row.thru ? row.gross : '–'}</p>
						<p class="text-[10px] tracking-wide text-stone-400 uppercase">Gross</p>
					</div>
					<div>
						<p class="text-brew-300 text-lg font-black">{row.thru ? row.net : '–'}</p>
						<p class="text-[10px] tracking-wide text-stone-400 uppercase">Net</p>
					</div>
					<div>
						<p class="text-fairway-300 text-lg font-black">{row.matchPoints}</p>
						<p class="text-[10px] tracking-wide text-stone-400 uppercase">
							{row.record.w}-{row.record.l}-{row.record.t}
						</p>
					</div>
				</div>
			</li>
		{/each}
	</ol>
	<p class="mt-2 text-right text-[11px] text-stone-500">
		Net = gross − 35% combined handicap (prorated) · W-L-T = holes vs the field
	</p>
{/if}
