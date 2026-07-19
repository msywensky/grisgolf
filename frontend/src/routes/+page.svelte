<script lang="ts">
	import { goto } from '$app/navigation';
	import { createEvent } from '$lib/api';
	import CoursePicker from '$lib/components/CoursePicker.svelte';
	import { setAdminPin } from '$lib/session';
	import type { TeeGender } from '$lib/types';

	// Default to next Saturday — because that's when scrambles happen.
	function nextSaturday(): string {
		const d = new Date();
		d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
		return d.toISOString().slice(0, 10);
	}

	let title = $state('');
	let course = $state('');
	let externalCourseId = $state<number | null>(null);
	let teeName = $state<string | null>(null);
	let teeGender = $state<TeeGender | null>(null);
	let date = $state(nextSaturday());
	let holes = $state<9 | 18>(18);
	let createdBy = $state('');
	let creating = $state(false);
	let errorMsg = $state<string | null>(null);
	let showForm = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		creating = true;
		errorMsg = null;
		try {
			const result = await createEvent({
				title: title.trim() || 'Saturday Scramble',
				course: course.trim() || 'TBD (wherever has the cheapest cart beers)',
				date,
				holes,
				created_by: createdBy.trim() || 'The Commissioner',
				...(externalCourseId !== null
					? { external_course_id: externalCourseId, tee_name: teeName, tee_gender: teeGender }
					: {})
			});
			// Remember the pin locally and show it once on the admin page.
			setAdminPin(result.share_code, result.admin_pin);
			await goto(`/event/${result.share_code}/admin?fresh=1`);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Event creation shanked it OB. Try again?';
		} finally {
			creating = false;
		}
	}
</script>

<svelte:head>
	<title>Hold My Beer Golf Scramble</title>
	<meta name="description" content="Dead-simple 2v2 golf scramble tracking for your weekend crew." />
</svelte:head>

<main class="flex flex-1 flex-col items-center justify-center gap-8 py-12 text-center">
	<div class="wobble-in">
		<div class="text-7xl">🍺⛳</div>
		<h1 class="font-display mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
			Hold My Beer <span class="text-brew-400">Scramble</span>
		</h1>
		<p class="mx-auto mt-3 max-w-md text-lg text-stone-300">
			2v2 scramble scoring for crews who take golf <em>almost</em> as seriously as the cooler.
			Live leaderboard, shareable highlights, zero sign-ups.
		</p>
	</div>

	{#if !showForm}
		<div class="flex w-full max-w-sm flex-col gap-3">
			<button
				class="tap press-pop bg-brew-500 hover:bg-brew-400 rounded-2xl px-8 py-4 text-xl font-bold text-stone-900 shadow-lg shadow-black/30"
				onclick={() => (showForm = true)}
			>
				🏌️ Start a Scramble
			</button>
			<a
				class="tap press-pop card flex items-center justify-center px-8 py-4 text-lg font-semibold text-stone-100 hover:bg-white/10"
				href="/event/demo1234"
			>
				👀 Peek at a live demo event
			</a>
		</div>
	{:else}
		<form class="card wobble-in w-full max-w-sm space-y-4 p-6 text-left" onsubmit={submit}>
			<h2 class="text-xl font-bold">Tee it up 🍻</h2>

			<label class="block text-sm font-medium text-stone-300">
				Event name
				<input
					class="tap mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-stone-500"
					placeholder="The Saturday Slice Open"
					bind:value={title}
				/>
			</label>

			<CoursePicker
				bind:courseName={course}
				bind:externalId={externalCourseId}
				bind:teeName
				bind:teeGender
			/>

			<div class="flex gap-3">
				<label class="block flex-1 text-sm font-medium text-stone-300">
					Date
					<input
						type="date"
						class="tap mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white"
						bind:value={date}
					/>
				</label>
				<div class="text-sm font-medium text-stone-300">
					Holes
					<div class="mt-1 flex overflow-hidden rounded-xl border border-white/15">
						{#each [9, 18] as h (h)}
							<button
								type="button"
								class="tap px-5 py-3 font-bold {holes === h
									? 'bg-fairway-600 text-white'
									: 'bg-black/20 text-stone-400'}"
								onclick={() => (holes = h as 9 | 18)}
							>
								{h}
							</button>
						{/each}
					</div>
				</div>
			</div>

			<label class="block text-sm font-medium text-stone-300">
				Your name (the organizer)
				<input
					class="tap mt-1 w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-stone-500"
					placeholder="Commissioner Chad"
					bind:value={createdBy}
				/>
			</label>

			{#if errorMsg}
				<p class="rounded-xl bg-red-900/50 px-4 py-3 text-sm text-red-200">{errorMsg}</p>
			{/if}

			<button
				type="submit"
				class="tap press-pop bg-brew-500 hover:bg-brew-400 w-full rounded-2xl px-6 py-4 text-lg font-bold text-stone-900 disabled:opacity-50"
				disabled={creating}
			>
				{creating ? 'Pouring…' : 'Create Event 🍺'}
			</button>
		</form>
	{/if}

	<ul class="grid max-w-md gap-2 text-sm text-stone-400">
		<li>✅ Share one link — everyone sees the live leaderboard</li>
		<li>✅ Big buttons, fast scoring, works one-handed (beer in the other)</li>
		<li>✅ Epic Shot highlights → instant share cards for the group chat</li>
		<li>✅ One tap clones the whole thing for next weekend</li>
	</ul>
</main>
