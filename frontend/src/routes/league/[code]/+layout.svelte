<script lang="ts">
	import { page } from '$app/state';
	import { authStore } from '$lib/auth.svelte';
	import { leagueStore } from '$lib/leagueStore.svelte';
	import { randomLoadingLine } from '$lib/copy';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const code = $derived(page.params.code ?? '');
	const path = $derived(page.url.pathname);

	let copied = $state(false);

	$effect(() => {
		leagueStore.load(code);
	});

	const isManager = $derived(
		!!authStore.userId && !!leagueStore.bundle?.managerIds.includes(authStore.userId)
	);
	const isMember = $derived(
		!!authStore.userId &&
			!!leagueStore.bundle?.members.some((m) => m.user_id === authStore.userId)
	);

	async function shareLeague() {
		const url = `${location.origin}/league/${code}`;
		const title = leagueStore.bundle?.league.name ?? 'Golf League';
		if (navigator.share) {
			try {
				await navigator.share({ title, url });
				return;
			} catch {
				// cancelled — fall through to clipboard
			}
		}
		await navigator.clipboard.writeText(url);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<svelte:head>
	<title>{leagueStore.bundle?.league.name ?? 'League'} · HMB Scramble</title>
</svelte:head>

{#if leagueStore.loading}
	<div class="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-stone-300">
		<div class="animate-bounce text-5xl">🍺</div>
		<p>{randomLoadingLine()}</p>
	</div>
{:else if leagueStore.error}
	<div class="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
		<div class="text-5xl">🔍⛳</div>
		<p class="max-w-sm text-stone-300">{leagueStore.error}</p>
		<a href="/" class="tap press-pop bg-brew-500 rounded-xl px-6 py-3 font-bold text-stone-900">
			Back to the clubhouse
		</a>
	</div>
{:else if leagueStore.bundle}
	{@const league = leagueStore.bundle.league}
	<header class="pt-6 pb-4">
		<div class="flex items-start justify-between gap-3">
			<a href="/" class="text-2xl" title="Home">🍺⛳</a>
			<div class="flex gap-2">
				<button class="tap press-pop card px-4 py-2 text-sm font-semibold" onclick={shareLeague}>
					{copied ? '✅ Link copied!' : '🔗 Share'}
				</button>
				{#if isManager}
					<a
						href={`/league/${code}/admin`}
						class="tap press-pop card px-4 py-2 text-sm font-semibold"
					>
						🛠️ Manage
					</a>
				{:else if !isMember}
					<a
						href={`/league/${code}/join`}
						class="tap press-pop bg-brew-500 rounded-xl px-4 py-2 text-sm font-bold text-stone-900"
					>
						Join league
					</a>
				{/if}
			</div>
		</div>
		<h1 class="font-display mt-2 text-3xl font-black text-white">{league.name}</h1>
		<p class="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-300">
			<span class="bg-fairway-700 text-fairway-100 rounded-full px-2.5 py-0.5 text-xs font-bold">
				🏆 LEAGUE
			</span>
			<span>{leagueStore.bundle.members.length} players</span>
			<span>·</span>
			<span>
				{league.scoring_mode === 'placement'
					? 'Placement points'
					: league.scoring_mode === 'match_points'
						? 'Match points'
						: 'Win–loss record'}
			</span>
		</p>
	</header>

	{@render children()}
{/if}
