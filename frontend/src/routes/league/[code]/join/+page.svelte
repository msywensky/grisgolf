<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { joinLeague } from '$lib/api';
	import { authStore } from '$lib/auth.svelte';
	import { leagueStore } from '$lib/leagueStore.svelte';
	import { supabase } from '$lib/supabase';

	const code = $derived(page.params.code ?? '');
	const bundle = $derived(leagueStore.bundle);
	const isMember = $derived(
		!!authStore.userId && !!bundle?.members.some((m) => m.user_id === authStore.userId)
	);

	let email = $state('');
	let linkSent = $state(false);
	let displayName = $state('');
	let handicap = $state(10);
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);

	// Returning players: pre-fill from their existing profile.
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

	async function join(e: SubmitEvent) {
		e.preventDefault();
		if (!authStore.accessToken) return;
		busy = true;
		errorMsg = null;
		try {
			await joinLeague(authStore.accessToken, code, {
				display_name: displayName.trim(),
				handicap
			});
			await leagueStore.refresh();
			await goto(`/league/${code}`);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Join shanked it OB. Try again?';
		} finally {
			busy = false;
		}
	}
</script>

<div class="wobble-in mx-auto w-full max-w-sm space-y-4">
	{#if authStore.loading}
		<div class="card p-6 text-center text-stone-300">Checking your tee time…</div>
	{:else if !authStore.session}
		{#if linkSent}
			<div class="card space-y-2 p-6 text-center">
				<div class="text-4xl">📬</div>
				<h2 class="text-xl font-bold text-white">Check your email</h2>
				<p class="text-sm text-stone-300">
					We sent a magic link to <span class="font-bold text-white">{email}</span>. Tap it on this
					device and you'll land right back here — no password, no tears.
				</p>
			</div>
		{:else}
			<form class="card space-y-4 p-6" onsubmit={sendLink}>
				<h2 class="text-xl font-bold text-white">⛳ Join the league</h2>
				<p class="text-sm text-stone-400">
					League play needs an account so your record follows you all season. One email, zero
					passwords.
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
	{:else if isMember}
		<div class="card space-y-3 p-6 text-center">
			<div class="text-4xl">🍻</div>
			<h2 class="text-xl font-bold text-white">You're already on the roster!</h2>
			<a
				href={`/league/${code}`}
				class="tap press-pop bg-fairway-600 block w-full rounded-2xl py-3.5 font-bold text-white"
			>
				To the standings →
			</a>
		</div>
	{:else}
		<form class="card space-y-4 p-6" onsubmit={join}>
			<h2 class="text-xl font-bold text-white">Almost there 🍺</h2>
			<label class="block text-sm font-medium text-stone-300">
				Your name
				<input
					required
					class="tap mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-stone-500"
					placeholder="Tommy Two-Putts"
					bind:value={displayName}
				/>
			</label>
			<label class="block text-sm font-medium text-stone-300">
				Handicap (be honest)
				<input
					type="number"
					min="0"
					max="54"
					class="tap mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white"
					bind:value={handicap}
				/>
			</label>
			{#if errorMsg}
				<p class="rounded-xl bg-red-900/50 px-4 py-3 text-sm text-red-200">{errorMsg}</p>
			{/if}
			<button
				type="submit"
				class="tap press-pop bg-brew-500 w-full rounded-2xl py-3.5 font-bold text-stone-900 disabled:opacity-50"
				disabled={busy || !displayName.trim()}
			>
				{busy ? 'Joining…' : 'Join the league 🏌️'}
			</button>
		</form>
	{/if}
</div>
