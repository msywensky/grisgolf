<script lang="ts">
	// "My leagues" hub: everything you play in or run, plus Start a League.
	import { goto } from '$app/navigation';
	import { createLeague } from '$lib/api';
	import { authStore } from '$lib/auth.svelte';
	import { fetchMyLeagues, supabase } from '$lib/supabase';
	import type { League } from '$lib/types';

	let email = $state('');
	let linkSent = $state(false);
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);

	let myLeagues = $state<{ league: League; isManager: boolean }[]>([]);
	let leaguesLoaded = $state(false);

	$effect(() => {
		const uid = authStore.userId;
		if (!uid) {
			myLeagues = [];
			leaguesLoaded = false;
			return;
		}
		fetchMyLeagues(uid)
			.then((rows) => {
				myLeagues = rows;
				leaguesLoaded = true;
			})
			.catch(() => (leaguesLoaded = true));
	});

	async function sendLink(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		errorMsg = null;
		try {
			await authStore.signInWithEmail(email.trim());
			linkSent = true;
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not send the magic link.';
		} finally {
			busy = false;
		}
	}

	// Start a league
	let showForm = $state(false);
	let leagueName = $state('');
	let displayName = $state('');
	let handicap = $state(10);

	$effect(() => {
		const uid = authStore.userId;
		if (!uid || displayName) return;
		supabase()
			.from('profiles')
			.select('display_name, default_handicap')
			.eq('id', uid)
			.maybeSingle()
			.then(({ data }) => {
				if (data && !displayName) {
					displayName = data.display_name;
					handicap = Number(data.default_handicap);
				}
			});
	});

	async function create(e: SubmitEvent) {
		e.preventDefault();
		if (!authStore.accessToken) return;
		busy = true;
		errorMsg = null;
		try {
			const { share_code } = await createLeague(authStore.accessToken, {
				name: leagueName.trim(),
				display_name: displayName.trim(),
				handicap
			});
			await goto(`/league/${share_code}/admin`);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'League creation shanked it. Try again?';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>My Leagues · HMB Scramble</title>
</svelte:head>

<main class="wobble-in mx-auto w-full max-w-md flex-1 space-y-5 py-10">
	<div class="text-center">
		<a href="/" class="text-4xl">🍺⛳</a>
		<h1 class="font-display mt-2 text-3xl font-black text-white">Leagues</h1>
		<p class="mt-1 text-sm text-stone-300">
			Season standings, fixed teams, bragging rights that survive the winter.
		</p>
	</div>

	{#if authStore.loading}
		<div class="card p-6 text-center text-stone-300">Checking your tee time…</div>
	{:else if !authStore.session}
		{#if linkSent}
			<div class="card space-y-2 p-6 text-center">
				<div class="text-4xl">📬</div>
				<h2 class="text-xl font-bold text-white">Check your email</h2>
				<p class="text-sm text-stone-300">
					Magic link sent to <span class="font-bold text-white">{email}</span>. Tap it and you'll
					land back here signed in.
				</p>
			</div>
		{:else}
			<form class="card space-y-4 p-6" onsubmit={sendLink}>
				<p class="text-sm text-stone-400">
					Leagues need an account (it's how your record follows you). Casual scrambles never will.
				</p>
				<label class="block text-sm font-medium text-stone-300">
					Email
					<input
						type="email"
						required
						class="tap mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-stone-500"
						placeholder="you@example.com"
						bind:value={email}
					/>
				</label>
				{#if errorMsg}
					<p class="rounded-xl bg-red-900/50 px-4 py-3 text-sm text-red-200">{errorMsg}</p>
				{/if}
				<button
					type="submit"
					class="tap press-pop bg-brew-500 w-full rounded-2xl py-3.5 font-bold text-stone-900 disabled:opacity-50"
					disabled={busy || !email.trim()}
				>
					{busy ? 'Sending…' : '✉️ Send me a magic link'}
				</button>
			</form>
		{/if}
	{:else}
		<!-- My leagues -->
		<div class="card space-y-2 p-5">
			<h2 class="font-bold text-white">Your leagues</h2>
			{#if !leaguesLoaded}
				<p class="text-sm text-stone-400">Loading…</p>
			{:else if myLeagues.length === 0}
				<p class="text-sm text-stone-400">
					No leagues yet. Start one below, or ask your commissioner for an invite link.
				</p>
			{/if}
			{#each myLeagues as { league, isManager } (league.id)}
				<a
					href={`/league/${league.share_code}`}
					class="tap flex items-center justify-between rounded-xl bg-black/20 px-4 py-3 text-sm hover:bg-white/5"
				>
					<span class="font-bold text-white">{league.name}</span>
					{#if isManager}
						<span class="text-xs text-stone-400">👑 manager</span>
					{/if}
				</a>
			{/each}
		</div>

		{#if !showForm}
			<button
				class="tap press-pop bg-brew-500 w-full rounded-2xl px-8 py-4 text-lg font-bold text-stone-900 shadow-lg shadow-black/30"
				onclick={() => (showForm = true)}
			>
				🏆 Start a League
			</button>
		{:else}
			<form class="card wobble-in space-y-4 p-6" onsubmit={create}>
				<h2 class="text-xl font-bold text-white">Found your dynasty 🏆</h2>
				<label class="block text-sm font-medium text-stone-300">
					League name
					<input
						required
						class="tap mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-stone-500"
						placeholder="The Thirsty Thursday League"
						bind:value={leagueName}
					/>
				</label>
				<label class="block text-sm font-medium text-stone-300">
					Your name (commissioner + player)
					<input
						required
						class="tap mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-stone-500"
						placeholder="Commissioner Dale"
						bind:value={displayName}
					/>
				</label>
				<label class="block text-sm font-medium text-stone-300">
					Your handicap
					<input
						type="number"
						min="0"
						max="54"
						class="tap mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white"
						bind:value={handicap}
					/>
				</label>
				<p class="text-xs text-stone-500">
					Scoring mode and season setup live on the manage page — placement points out of the box.
				</p>
				{#if errorMsg}
					<p class="rounded-xl bg-red-900/50 px-4 py-3 text-sm text-red-200">{errorMsg}</p>
				{/if}
				<button
					type="submit"
					class="tap press-pop bg-brew-500 w-full rounded-2xl py-3.5 font-bold text-stone-900 disabled:opacity-50"
					disabled={busy || !leagueName.trim() || !displayName.trim()}
				>
					{busy ? 'Founding…' : 'Create League 🍺'}
				</button>
			</form>
		{/if}

		<button class="tap w-full text-center text-xs text-stone-500 underline" onclick={() => authStore.signOut()}>
			Sign out
		</button>
	{/if}
</main>
