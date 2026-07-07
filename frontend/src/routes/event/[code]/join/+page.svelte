<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { randomTeamName } from '$lib/copy';
	import { eventStore } from '$lib/eventStore.svelte';
	import { setMyGolferId, setMyTeamId } from '$lib/session';
	import { supabase } from '$lib/supabase';
	import type { Team } from '$lib/types';

	const code = $derived(page.params.code ?? '');
	const bundle = $derived(eventStore.bundle);

	// Step 1: who are you? Step 2: whose cart are you riding in?
	let step = $state<1 | 2>(1);
	let name = $state('');
	let handicap = $state<number | ''>('');
	let myGolferId = $state<string | null>(null);

	let teamName = $state(randomTeamName());
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);

	// Teams with an open seat
	const openTeams = $derived(
		(bundle?.teams ?? []).filter((t) => !t.player1_id || !t.player2_id)
	);

	function golferName(id: string | null): string {
		return bundle?.golfers.find((g) => g.id === id)?.name ?? '???';
	}

	async function registerGolfer(e: SubmitEvent) {
		e.preventDefault();
		if (!bundle || !name.trim()) return;
		busy = true;
		errorMsg = null;
		try {
			const { data, error } = await supabase()
				.from('golfers')
				.insert({
					name: name.trim(),
					handicap: handicap === '' ? 0 : Number(handicap),
					event_id: bundle.event.id
				})
				.select()
				.single();
			if (error) throw error;
			myGolferId = data.id;
			setMyGolferId(code, data.id);
			step = 2;
			eventStore.refresh();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not sign you in. Weird.';
		} finally {
			busy = false;
		}
	}

	async function joinTeam(team: Team) {
		if (!myGolferId) return;
		busy = true;
		errorMsg = null;
		try {
			const seat = team.player1_id ? 'player2_id' : 'player1_id';
			const { error } = await supabase()
				.from('teams')
				.update({ [seat]: myGolferId })
				.eq('id', team.id);
			if (error) throw error;
			setMyTeamId(code, team.id);
			await eventStore.refresh();
			await goto(`/event/${code}/score`);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'That seat got taken. Try another!';
		} finally {
			busy = false;
		}
	}

	async function createTeam(e: SubmitEvent) {
		e.preventDefault();
		if (!bundle || !myGolferId) return;
		busy = true;
		errorMsg = null;
		try {
			const { data, error } = await supabase()
				.from('teams')
				.insert({
					name: teamName.trim() || randomTeamName(),
					event_id: bundle.event.id,
					player1_id: myGolferId
				})
				.select()
				.single();
			if (error) throw error;
			setMyTeamId(code, data.id);
			await eventStore.refresh();
			await goto(`/event/${code}/score`);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Team creation went in the water.';
		} finally {
			busy = false;
		}
	}
</script>

{#if bundle}
	{#if step === 1}
		<form class="card wobble-in space-y-4 p-6" onsubmit={registerGolfer}>
			<h2 class="text-xl font-bold text-white">Who's teeing off? 🏌️</h2>
			<label class="block text-sm font-medium text-stone-300">
				Your name
				<input
					class="tap mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-stone-500"
					placeholder="Tommy Two-Putts"
					bind:value={name}
					required
				/>
			</label>
			<label class="block text-sm font-medium text-stone-300">
				Handicap <span class="text-stone-500">(optional — be honest, sandbagger)</span>
				<input
					type="number"
					min="0"
					max="54"
					class="tap mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-stone-500"
					placeholder="18"
					bind:value={handicap}
				/>
			</label>
			{#if errorMsg}
				<p class="rounded-xl bg-red-900/50 px-4 py-3 text-sm text-red-200">{errorMsg}</p>
			{/if}
			<button
				type="submit"
				class="tap press-pop bg-brew-500 hover:bg-brew-400 w-full rounded-2xl px-6 py-4 text-lg font-bold text-stone-900 disabled:opacity-50"
				disabled={busy}
			>
				{busy ? 'Checking you in…' : "Let's go 🍺"}
			</button>
		</form>
	{:else}
		<div class="wobble-in space-y-5">
			{#if openTeams.length > 0}
				<div class="card space-y-2 p-5">
					<h2 class="text-lg font-bold text-white">Grab an open seat 🛺</h2>
					{#each openTeams as team (team.id)}
						<button
							class="tap press-pop flex w-full items-center justify-between rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-left hover:bg-white/10 disabled:opacity-50"
							onclick={() => joinTeam(team)}
							disabled={busy}
						>
							<span>
								<span class="font-bold text-white">{team.name}</span>
								<span class="block text-xs text-stone-400">
									riding with {golferName(team.player1_id ?? team.player2_id)}
								</span>
							</span>
							<span class="text-brew-300 font-bold">Join →</span>
						</button>
					{/each}
				</div>
				<p class="text-center text-sm text-stone-500">— or —</p>
			{/if}

			<form class="card space-y-3 p-5" onsubmit={createTeam}>
				<h2 class="text-lg font-bold text-white">Start a new team 🚩</h2>
				<div class="flex gap-2">
					<input
						class="tap min-w-0 flex-1 rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white"
						bind:value={teamName}
					/>
					<button
						type="button"
						class="tap press-pop card px-4 text-xl"
						title="Brew me a new name"
						onclick={() => (teamName = randomTeamName())}
					>
						🎲
					</button>
				</div>
				{#if errorMsg}
					<p class="rounded-xl bg-red-900/50 px-4 py-3 text-sm text-red-200">{errorMsg}</p>
				{/if}
				<button
					type="submit"
					class="tap press-pop bg-fairway-600 hover:bg-fairway-500 w-full rounded-2xl px-6 py-4 text-lg font-bold text-white disabled:opacity-50"
					disabled={busy}
				>
					{busy ? 'Painting the flag…' : 'Create team & start scoring'}
				</button>
			</form>
			<p class="text-center text-xs text-stone-500">
				Your partner joins from the same event link and grabs your open seat.
			</p>
		</div>
	{/if}
{/if}
