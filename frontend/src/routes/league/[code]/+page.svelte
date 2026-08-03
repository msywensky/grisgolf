<script lang="ts">
	import { leagueStore } from '$lib/leagueStore.svelte';
	import { buildStandings } from '$lib/standings';
	import type { Season } from '$lib/types';

	const bundle = $derived(leagueStore.bundle);

	// Default to the most recent active season, else the newest one.
	let pickedSeasonId = $state<string | null>(null);
	const season = $derived.by((): Season | null => {
		if (!bundle) return null;
		if (pickedSeasonId) return bundle.seasons.find((s) => s.id === pickedSeasonId) ?? null;
		return (
			[...bundle.seasons].reverse().find((s) => s.status === 'active') ??
			bundle.seasons.at(-1) ??
			null
		);
	});

	const standings = $derived(
		bundle && season
			? buildStandings(
					bundle.league,
					season,
					bundle.seasonTeams,
					bundle.events,
					bundle.teams,
					bundle.golfers,
					bundle.scores
				)
			: []
	);

	const profileName = $derived((id: string | null) =>
		id ? (bundle?.profiles.find((p) => p.id === id)?.display_name ?? '?') : null
	);

	const seasonEvents = $derived(
		bundle && season ? bundle.events.filter((e) => e.season_id === season.id) : []
	);
	const upcoming = $derived(seasonEvents.filter((e) => e.status !== 'final'));
	const past = $derived(seasonEvents.filter((e) => e.status === 'final').reverse());

	function fmtDate(iso: string): string {
		return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	function fmtPoints(n: number): string {
		return Number.isInteger(n) ? String(n) : n.toFixed(1);
	}
</script>

{#if bundle}
	<div class="wobble-in space-y-5">
		{#if bundle.seasons.length === 0}
			<div class="card space-y-2 p-6 text-center">
				<div class="text-4xl">🌱</div>
				<p class="text-stone-300">No seasons yet. The commissioner needs to tee one up.</p>
			</div>
		{:else}
			{#if bundle.seasons.length > 1}
				<div class="flex flex-wrap gap-2">
					{#each bundle.seasons as s (s.id)}
						<button
							class="tap rounded-xl px-4 py-2 text-sm font-bold {season?.id === s.id
								? 'bg-fairway-600 text-white'
								: 'card text-stone-300'}"
							onclick={() => (pickedSeasonId = s.id)}
						>
							{s.name}
						</button>
					{/each}
				</div>
			{/if}

			<!-- Season standings -->
			<div class="card overflow-hidden">
				<div class="flex items-center justify-between px-5 pt-4 pb-2">
					<h2 class="font-bold text-white">🏆 {season?.name} standings</h2>
					{#if season?.status === 'complete'}
						<span class="rounded-full bg-stone-600 px-2.5 py-0.5 text-xs font-bold text-white">
							🏁 FINAL
						</span>
					{/if}
				</div>
				{#if standings.length === 0}
					<p class="px-5 pb-5 text-sm text-stone-400">
						No teams yet — standings show up once the season has pairs and a finished night.
					</p>
				{:else}
					<table class="w-full text-sm">
						<thead>
							<tr class="text-left text-xs text-stone-400 uppercase">
								<th class="py-2 pl-5">#</th>
								<th class="py-2">Team</th>
								<th class="py-2 text-center">Nights</th>
								<th class="py-2 pr-5 text-right">
									{bundle.league.scoring_mode === 'record' ? 'W–L–T' : 'Pts'}
								</th>
							</tr>
						</thead>
						<tbody>
							{#each standings as row (row.seasonTeam.id)}
								<tr class="border-t border-white/5">
									<td class="py-3 pl-5 font-black {row.position === 1 ? 'text-brew-300' : 'text-stone-400'}">
										{row.position === 1 ? '🥇' : row.position}
									</td>
									<td class="py-3">
										<span class="font-bold text-white">{row.seasonTeam.name}</span>
										<span class="block text-xs text-stone-400">
											{[profileName(row.seasonTeam.player1_user_id), profileName(row.seasonTeam.player2_user_id)]
												.filter(Boolean)
												.join(' & ') || 'empty cart'}
										</span>
									</td>
									<td class="py-3 text-center text-stone-300">{row.played}</td>
									<td class="py-3 pr-5 text-right font-black text-white">
										{#if bundle.league.scoring_mode === 'record'}
											{row.record.w}–{row.record.l}–{row.record.t}
										{:else}
											{fmtPoints(row.points)}
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>

			<!-- Schedule -->
			<div class="card space-y-2 p-5">
				<h2 class="font-bold text-white">📅 Schedule</h2>
				{#if seasonEvents.length === 0}
					<p class="text-sm text-stone-400">Nothing on the tee sheet yet.</p>
				{/if}
				{#each upcoming as ev (ev.id)}
					<a
						href={`/event/${ev.share_code}`}
						class="tap flex items-center justify-between rounded-xl bg-black/20 px-4 py-3 text-sm hover:bg-white/5"
					>
						<span>
							<span class="font-bold text-white">{ev.title}</span>
							<span class="block text-xs text-stone-400">📍 {ev.course}</span>
						</span>
						<span class="text-right text-stone-300">
							{fmtDate(ev.date)}
							{#if ev.status === 'live'}
								<span class="block text-xs font-bold text-red-400">🔴 LIVE</span>
							{/if}
						</span>
					</a>
				{/each}
				{#each past as ev (ev.id)}
					<a
						href={`/event/${ev.share_code}`}
						class="tap flex items-center justify-between rounded-xl bg-black/10 px-4 py-3 text-sm opacity-80 hover:bg-white/5"
					>
						<span class="font-semibold text-stone-300">🏁 {ev.title}</span>
						<span class="text-stone-400">{fmtDate(ev.date)}</span>
					</a>
				{/each}
			</div>
		{/if}

		<!-- Season lore -->
		{#if bundle.highlights.length > 0}
			<div class="card space-y-3 p-5">
				<h2 class="font-bold text-white">📸 League lore</h2>
				{#each bundle.highlights.slice(0, 6) as h (h.id)}
					{@const ev = bundle.events.find((e) => e.id === h.event_id)}
					<div class="rounded-xl bg-black/20 px-4 py-3 text-sm">
						<p class="text-stone-200">“{h.caption}”</p>
						<p class="mt-1 text-xs text-stone-500">
							{ev?.title ?? 'League night'}{h.hole_number ? ` · hole ${h.hole_number}` : ''}
						</p>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}
