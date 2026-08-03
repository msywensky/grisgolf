<script lang="ts">
	// Commissioner HQ for a league. Gated by account: you must be signed in
	// AND on the league_managers list (verified again server-side via JWT).
	import { page } from '$app/state';
	import {
		createLeagueEvent,
		createSeason,
		leagueIcsUrl,
		setSeasonTeams,
		updateLeague,
		updateSeason,
		type SeasonTeamInput
	} from '$lib/api';
	import { authStore } from '$lib/auth.svelte';
	import CoursePicker from '$lib/components/CoursePicker.svelte';
	import { leagueStore } from '$lib/leagueStore.svelte';
	import type { ScoringMode, TeeGender } from '$lib/types';

	const code = $derived(page.params.code ?? '');
	const bundle = $derived(leagueStore.bundle);
	const isManager = $derived(
		!!authStore.userId && !!bundle?.managerIds.includes(authStore.userId)
	);
	const token = $derived(authStore.accessToken);

	const activeSeason = $derived(
		bundle ? ([...bundle.seasons].reverse().find((s) => s.status === 'active') ?? null) : null
	);
	const memberProfiles = $derived(
		bundle
			? bundle.members
					.map((m) => bundle.profiles.find((p) => p.id === m.user_id))
					.filter((p) => !!p)
			: []
	);

	let busy = $state(false);
	let errorMsg = $state<string | null>(null);
	let statusMsg = $state<string | null>(null);

	function flash(msg: string) {
		statusMsg = msg;
		setTimeout(() => (statusMsg = null), 3000);
	}

	async function run(action: () => Promise<unknown>, done: string) {
		busy = true;
		errorMsg = null;
		try {
			await action();
			await leagueStore.refresh();
			flash(done);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'That one found the water.';
		} finally {
			busy = false;
		}
	}

	// --- League settings ---
	let pointsText = $state('');
	const scoringModes: [ScoringMode, string, string][] = [
		['placement', '🏅 Placement', 'Points by finish each night'],
		['match_points', '🎯 Match points', 'Hole-by-hole points, summed'],
		['record', '📈 W–L–T', 'Win the night or go home']
	];

	function setMode(mode: ScoringMode) {
		if (!token) return;
		run(() => updateLeague(token, code, { scoring_mode: mode }), '⚖️ Scoring mode updated.');
	}

	function savePoints() {
		if (!token) return;
		const points = pointsText
			.split(',')
			.map((p) => Number(p.trim()))
			.filter((n) => Number.isFinite(n) && n >= 0);
		if (points.length === 0) return;
		run(
			() => updateLeague(token, code, { placement_points: points }),
			'🏅 Placement points updated.'
		);
	}

	// --- Seasons ---
	let newSeasonName = $state('');

	function addSeason(e: SubmitEvent) {
		e.preventDefault();
		if (!token) return;
		run(async () => {
			await createSeason(token, code, { name: newSeasonName.trim() });
			newSeasonName = '';
		}, '🌱 New season is live.');
	}

	function completeSeason(seasonId: string) {
		if (!token) return;
		run(
			() => updateSeason(token, code, seasonId, { status: 'complete' }),
			'🏁 Season wrapped. Hand out the trophies.'
		);
	}

	// --- Fixed pairs for the active season ---
	let editingTeams = $state(false);
	let draftTeams = $state<SeasonTeamInput[]>([]);

	function openTeamEditor() {
		draftTeams = (bundle?.seasonTeams ?? [])
			.filter((t) => t.season_id === activeSeason?.id)
			.map((t) => ({
				name: t.name,
				player1_user_id: t.player1_user_id,
				player2_user_id: t.player2_user_id
			}));
		if (draftTeams.length === 0) draftTeams = [{ name: '', player1_user_id: null, player2_user_id: null }];
		editingTeams = true;
	}

	function saveTeams() {
		if (!token || !activeSeason) return;
		const teams = draftTeams.filter((t) => t.name.trim());
		run(async () => {
			await setSeasonTeams(token, code, activeSeason.id, teams);
			editingTeams = false;
		}, '👯 Season pairs locked in.');
	}

	// --- Schedule a league night ---
	let evTitle = $state('');
	let evCourse = $state('');
	let evExternalId = $state<number | null>(null);
	let evTeeName = $state<string | null>(null);
	let evTeeGender = $state<TeeGender | null>(null);
	let evDate = $state(new Date().toISOString().slice(0, 10));
	let evHoles = $state<9 | 18>(9);
	let lastCreated = $state<string | null>(null);

	function scheduleNight(e: SubmitEvent) {
		e.preventDefault();
		if (!token || !activeSeason) return;
		run(async () => {
			const result = await createLeagueEvent(token, code, {
				season_id: activeSeason.id,
				title: evTitle.trim() || 'League Night',
				course: evCourse.trim() || 'TBD',
				date: evDate,
				holes: evHoles,
				...(evExternalId !== null
					? { external_course_id: evExternalId, tee_name: evTeeName, tee_gender: evTeeGender }
					: {})
			});
			lastCreated = result.share_code;
			evTitle = '';
		}, '🗓️ League night is on the tee sheet.');
	}
</script>

{#if bundle}
	{#if authStore.loading}
		<div class="card p-6 text-center text-stone-300">Checking your credentials…</div>
	{:else if !authStore.session}
		<div class="card wobble-in mx-auto max-w-sm space-y-3 p-6 text-center">
			<h2 class="text-xl font-bold text-white">🔐 Commissioner's Office</h2>
			<p class="text-sm text-stone-400">Sign in to manage this league.</p>
			<a
				href={`/league/${code}/join`}
				class="tap press-pop bg-brew-500 block w-full rounded-2xl py-3.5 font-bold text-stone-900"
			>
				Sign in →
			</a>
		</div>
	{:else if !isManager}
		<div class="card wobble-in mx-auto max-w-sm space-y-2 p-6 text-center">
			<div class="text-4xl">🚫🛺</div>
			<p class="text-stone-300">Managers only back here. Nice try, sandbagger.</p>
		</div>
	{:else}
		<div class="wobble-in space-y-5">
			{#if statusMsg}
				<p class="card bg-fairway-800/60 p-4 text-center font-bold text-white">{statusMsg}</p>
			{/if}

			<!-- Invite -->
			<div class="card space-y-2 p-5">
				<h3 class="font-bold text-white">📨 Invite players</h3>
				<p class="text-sm text-stone-400">
					Anyone with the link can watch. Joining the roster takes one email — no passwords.
				</p>
				<button
					class="tap press-pop bg-brew-500 w-full rounded-2xl py-3 font-bold text-stone-900"
					onclick={() =>
						navigator.clipboard.writeText(`${location.origin}/league/${code}/join`).then(() =>
							flash('🔗 Invite link copied.')
						)}
				>
					🔗 Copy invite link
				</button>
			</div>

			<!-- Scoring settings -->
			<div class="card space-y-3 p-5">
				<h3 class="font-bold text-white">⚖️ Season scoring</h3>
				<div class="grid grid-cols-3 gap-2">
					{#each scoringModes as [mode, label, blurb] (mode)}
						<button
							class="tap press-pop rounded-xl px-2 py-3 text-sm font-bold {bundle.league
								.scoring_mode === mode
								? 'bg-fairway-600 text-white'
								: 'card text-stone-300'} disabled:opacity-50"
							onclick={() => setMode(mode)}
							disabled={busy}
							title={blurb}
						>
							{label}
						</button>
					{/each}
				</div>
				{#if bundle.league.scoring_mode === 'placement'}
					<label class="block text-sm font-medium text-stone-300">
						Points by finish (1st, 2nd, …)
						<div class="mt-1 flex gap-2">
							<input
								class="tap w-full rounded-xl border border-white/15 bg-black/20 px-4 py-2.5 text-white"
								placeholder={bundle.league.placement_points.join(', ')}
								bind:value={pointsText}
							/>
							<button
								class="tap press-pop card rounded-xl px-4 text-sm font-bold text-stone-200 disabled:opacity-50"
								onclick={savePoints}
								disabled={busy || !pointsText.trim()}
							>
								Save
							</button>
						</div>
					</label>
				{/if}
			</div>

			<!-- Seasons -->
			<div class="card space-y-3 p-5">
				<h3 class="font-bold text-white">🌱 Seasons</h3>
				{#each bundle.seasons as s (s.id)}
					<div class="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2.5 text-sm">
						<span class="font-bold text-white">{s.name}</span>
						{#if s.status === 'active'}
							<button
								class="tap text-xs font-semibold text-stone-400 underline disabled:opacity-50"
								onclick={() => completeSeason(s.id)}
								disabled={busy}
							>
								🏁 Wrap up season
							</button>
						{:else}
							<span class="text-xs text-stone-500">complete</span>
						{/if}
					</div>
				{/each}
				{#if !activeSeason}
					<form class="flex gap-2" onsubmit={addSeason}>
						<input
							class="tap w-full rounded-xl border border-white/15 bg-black/20 px-4 py-2.5 text-white placeholder:text-stone-500"
							placeholder="Summer 2026"
							bind:value={newSeasonName}
						/>
						<button
							type="submit"
							class="tap press-pop bg-brew-500 rounded-xl px-4 text-sm font-bold text-stone-900 disabled:opacity-50"
							disabled={busy || !newSeasonName.trim()}
						>
							Start
						</button>
					</form>
				{/if}
			</div>

			{#if activeSeason}
				<!-- Fixed pairs -->
				<div class="card space-y-3 p-5">
					<div class="flex items-center justify-between">
						<h3 class="font-bold text-white">👯 {activeSeason.name} pairs</h3>
						{#if !editingTeams}
							<button class="tap text-xs font-semibold text-stone-400 underline" onclick={openTeamEditor}>
								Edit pairs
							</button>
						{/if}
					</div>
					{#if !editingTeams}
						{#each bundle.seasonTeams.filter((t) => t.season_id === activeSeason.id) as t (t.id)}
							<div class="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2.5 text-sm">
								<span class="font-bold text-white">{t.name}</span>
								<span class="text-stone-400">
									{[t.player1_user_id, t.player2_user_id]
										.map((id) => bundle.profiles.find((p) => p.id === id)?.display_name)
										.filter(Boolean)
										.join(' & ') || 'empty cart'}
								</span>
							</div>
						{:else}
							<p class="text-sm text-stone-400">No pairs yet — lock in the teams for the season.</p>
						{/each}
					{:else}
						{#each draftTeams as team, i (i)}
							<div class="space-y-2 rounded-xl bg-black/20 p-3">
								<input
									class="tap w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm font-bold text-white placeholder:text-stone-500"
									placeholder="Team name"
									bind:value={team.name}
								/>
								<div class="grid grid-cols-2 gap-2">
									{#each ['player1_user_id', 'player2_user_id'] as const as slot (slot)}
										<select
											class="tap rounded-lg border border-white/15 bg-black/20 px-2 py-2 text-sm text-white"
											bind:value={team[slot]}
										>
											<option value={null}>— open seat —</option>
											{#each memberProfiles as p (p.id)}
												<option value={p.id}>{p.display_name}</option>
											{/each}
										</select>
									{/each}
								</div>
							</div>
						{/each}
						<button
							class="tap card w-full rounded-xl py-2.5 text-sm font-bold text-stone-300"
							onclick={() =>
								(draftTeams = [...draftTeams, { name: '', player1_user_id: null, player2_user_id: null }])}
						>
							＋ Add a pair
						</button>
						<div class="flex gap-2">
							<button
								class="tap press-pop bg-brew-500 flex-1 rounded-xl py-3 font-bold text-stone-900 disabled:opacity-50"
								onclick={saveTeams}
								disabled={busy}
							>
								{busy ? 'Saving…' : 'Save pairs'}
							</button>
							<button
								class="tap card rounded-xl px-4 py-3 text-sm font-bold text-stone-300"
								onclick={() => (editingTeams = false)}
								disabled={busy}
							>
								Cancel
							</button>
						</div>
					{/if}
				</div>

				<!-- Schedule a league night -->
				<div class="card space-y-3 p-5">
					<h3 class="font-bold text-white">🗓️ Schedule a league night</h3>
					<form class="space-y-3" onsubmit={scheduleNight}>
						<input
							class="tap w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-stone-500"
							placeholder="League Night 3"
							bind:value={evTitle}
						/>
						<CoursePicker
							bind:courseName={evCourse}
							bind:externalId={evExternalId}
							bind:teeName={evTeeName}
							bind:teeGender={evTeeGender}
						/>
						<div class="flex gap-3">
							<label class="block flex-1 text-sm font-medium text-stone-300">
								Date
								<input
									type="date"
									class="tap mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white"
									bind:value={evDate}
								/>
							</label>
							<div class="text-sm font-medium text-stone-300">
								Holes
								<div class="mt-1 flex overflow-hidden rounded-xl border border-white/15">
									{#each [9, 18] as h (h)}
										<button
											type="button"
											class="tap px-5 py-3 font-bold {evHoles === h
												? 'bg-fairway-600 text-white'
												: 'bg-black/20 text-stone-400'}"
											onclick={() => (evHoles = h as 9 | 18)}
										>
											{h}
										</button>
									{/each}
								</div>
							</div>
						</div>
						<button
							type="submit"
							class="tap press-pop bg-brew-500 w-full rounded-2xl py-3.5 font-bold text-stone-900 disabled:opacity-50"
							disabled={busy}
						>
							{busy ? 'Booking…' : '🍺 Put it on the tee sheet'}
						</button>
					</form>
					{#if lastCreated}
						<a
							href={`/event/${lastCreated}`}
							class="tap press-pop bg-fairway-600 block w-full rounded-2xl py-3 text-center font-bold text-white"
						>
							Go to the new league night →
						</a>
					{/if}
					<a
						href={leagueIcsUrl(code)}
						class="tap card press-pop block rounded-xl py-3 text-center text-sm font-bold text-stone-200"
						download
					>
						📆 Full season calendar (.ics)
					</a>
				</div>
			{/if}

			<!-- Roster -->
			<div class="card space-y-2 p-5">
				<h3 class="font-bold text-white">👥 Roster</h3>
				{#if memberProfiles.length === 0}
					<p class="text-sm text-stone-400">Nobody has joined yet. Share the invite link!</p>
				{/if}
				{#each memberProfiles as p (p.id)}
					<div class="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2.5 text-sm">
						<span class="font-bold text-white">
							{p.display_name}
							{#if bundle.managerIds.includes(p.id)}
								<span title="League manager"> 👑</span>
							{/if}
						</span>
						<span class="text-stone-400">HCP {Number(p.default_handicap)}</span>
					</div>
				{/each}
			</div>

			{#if errorMsg}
				<p class="rounded-xl bg-red-900/50 px-4 py-3 text-sm text-red-200">{errorMsg}</p>
			{/if}
		</div>
	{/if}
{/if}
