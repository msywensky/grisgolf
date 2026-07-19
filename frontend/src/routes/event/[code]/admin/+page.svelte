<script lang="ts">
	// Organizer HQ. Guarded by a 4-digit pin (shown once at creation).
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { cloneEvent, icsUrl, updateEvent, verifyAdmin } from '$lib/api';
	import CoursePicker from '$lib/components/CoursePicker.svelte';
	import { eventStore } from '$lib/eventStore.svelte';
	import { getAdminPin, setAdminPin } from '$lib/session';
	import type { TeeGender } from '$lib/types';

	const code = $derived(page.params.code ?? '');
	const bundle = $derived(eventStore.bundle);
	const isFresh = $derived(page.url.searchParams.get('fresh') === '1');

	let pin = $state('');
	let unlocked = $state(false);
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);
	let cloneResult = $state<{ share_code: string; date: string } | null>(null);
	let statusMsg = $state<string | null>(null);

	// Auto-unlock if we created this event on this phone.
	$effect(() => {
		if (unlocked || !code) return;
		const remembered = getAdminPin(code);
		if (remembered) {
			pin = remembered;
			unlock();
		}
	});

	async function unlock(e?: SubmitEvent) {
		e?.preventDefault();
		busy = true;
		errorMsg = null;
		try {
			const { ok } = await verifyAdmin(code, pin);
			if (!ok) throw new Error('Wrong pin. Nice try, sandbagger. 🕵️');
			setAdminPin(code, pin);
			unlocked = true;
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Could not verify pin.';
		} finally {
			busy = false;
		}
	}

	async function setStatus(status: 'upcoming' | 'live' | 'final') {
		busy = true;
		errorMsg = null;
		try {
			await updateEvent(code, pin, { status });
			await eventStore.refresh();
			statusMsg =
				status === 'live'
					? '🔴 We are LIVE. Shotgun start!'
					: status === 'final'
						? '🏁 Round is final. Settle your bets.'
						: '📅 Back to upcoming.';
			setTimeout(() => (statusMsg = null), 3000);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Status update failed.';
		} finally {
			busy = false;
		}
	}

	async function clone() {
		busy = true;
		errorMsg = null;
		try {
			cloneResult = await cloneEvent(code, pin);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Clone shanked it.';
		} finally {
			busy = false;
		}
	}

	// Course editing (real-course picker or free text)
	let editingCourse = $state(false);
	let courseText = $state('');
	let courseExternalId = $state<number | null>(null);
	let courseTeeName = $state<string | null>(null);
	let courseTeeGender = $state<TeeGender | null>(null);

	function openCourseEditor() {
		courseText = '';
		courseExternalId = null;
		courseTeeName = null;
		courseTeeGender = null;
		editingCourse = true;
	}

	async function saveCourse() {
		if (!bundle) return;
		busy = true;
		errorMsg = null;
		try {
			await updateEvent(
				code,
				pin,
				courseExternalId !== null
					? {
							external_course_id: courseExternalId,
							tee_name: courseTeeName,
							tee_gender: courseTeeGender
						}
					: {
							course: courseText.trim() || bundle.event.course,
							unlink_course: true
						}
			);
			await eventStore.refresh();
			editingCourse = false;
			statusMsg = '📍 Course updated. New pin location, same bad swings.';
			setTimeout(() => (statusMsg = null), 3000);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Course update hit the water.';
		} finally {
			busy = false;
		}
	}
</script>

{#if bundle}
	{#if !unlocked}
		<form class="card wobble-in mx-auto max-w-sm space-y-4 p-6" onsubmit={unlock}>
			<h2 class="text-xl font-bold text-white">🔐 Commissioner's Office</h2>
			<p class="text-sm text-stone-400">Enter the admin pin for this event.</p>
			<input
				class="tap w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-center text-2xl font-black tracking-[0.5em] text-white"
				inputmode="numeric"
				maxlength="4"
				placeholder="••••"
				bind:value={pin}
			/>
			{#if errorMsg}
				<p class="rounded-xl bg-red-900/50 px-4 py-3 text-sm text-red-200">{errorMsg}</p>
			{/if}
			<button
				type="submit"
				class="tap press-pop bg-brew-500 w-full rounded-2xl py-3.5 font-bold text-stone-900 disabled:opacity-50"
				disabled={busy || pin.length < 4}
			>
				{busy ? 'Checking…' : 'Unlock'}
			</button>
		</form>
	{:else}
		<div class="wobble-in space-y-5">
			{#if isFresh}
				<div class="card border-brew-500/40 space-y-2 p-5 text-center">
					<div class="text-4xl">🎉</div>
					<h2 class="text-xl font-black text-white">Your scramble is on the tee!</h2>
					<p class="text-sm text-stone-300">
						Admin pin: <span class="text-brew-300 text-xl font-black tracking-widest">{pin}</span>
						<br />Screenshot it. Tattoo it. Don't lose it.
					</p>
					<button
						class="tap press-pop bg-brew-500 w-full rounded-2xl py-3.5 font-bold text-stone-900"
						onclick={() => navigator.clipboard.writeText(`${location.origin}/event/${code}`)}
					>
						🔗 Copy invite link for the crew
					</button>
				</div>
			{/if}

			{#if statusMsg}
				<p class="card bg-fairway-800/60 p-4 text-center font-bold text-white">{statusMsg}</p>
			{/if}

			<!-- Round status -->
			<div class="card space-y-3 p-5">
				<h3 class="font-bold text-white">Round status</h3>
				<div class="grid grid-cols-3 gap-2">
					{#each [['upcoming', '📅 Upcoming'], ['live', '🔴 Live'], ['final', '🏁 Final']] as [value, label] (value)}
						<button
							class="tap press-pop rounded-xl py-3 text-sm font-bold {bundle.event.status === value
								? 'bg-fairway-600 text-white'
								: 'card text-stone-300'} disabled:opacity-50"
							onclick={() => setStatus(value as 'upcoming' | 'live' | 'final')}
							disabled={busy}
						>
							{label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Course -->
			<div class="card space-y-3 p-5">
				<div class="flex items-center justify-between">
					<h3 class="font-bold text-white">📍 Course</h3>
					{#if !editingCourse}
						<button
							class="tap text-xs font-semibold text-stone-400 underline"
							onclick={openCourseEditor}
						>
							Change course
						</button>
					{/if}
				</div>
				{#if !editingCourse}
					<p class="text-sm text-stone-300">
						<span class="font-bold text-white">{bundle.event.course}</span>
						{#if bundle.event.course_id}
							<span class="bg-fairway-800 text-fairway-200 ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold">
								⛳ linked
							</span>
						{/if}
						{#if bundle.event.tee_name}
							<span class="block text-xs text-stone-400">
								Playing the {bundle.event.tee_name} tees
							</span>
						{/if}
					</p>
				{:else}
					<CoursePicker
						bind:courseName={courseText}
						bind:externalId={courseExternalId}
						bind:teeName={courseTeeName}
						bind:teeGender={courseTeeGender}
					/>
					<div class="flex gap-2">
						<button
							class="tap press-pop bg-brew-500 flex-1 rounded-xl py-3 font-bold text-stone-900 disabled:opacity-50"
							onclick={saveCourse}
							disabled={busy || (courseExternalId === null && !courseText.trim())}
						>
							{busy ? 'Saving…' : 'Save course'}
						</button>
						<button
							class="tap card rounded-xl px-4 py-3 text-sm font-bold text-stone-300"
							onclick={() => (editingCourse = false)}
							disabled={busy}
						>
							Cancel
						</button>
					</div>
				{/if}
			</div>

			<!-- The delightful clone button -->
			<div class="card border-brew-500/30 space-y-3 p-5 text-center">
				{#if !cloneResult}
					<h3 class="text-lg font-black text-white">Same time next week? 🔁</h3>
					<p class="text-sm text-stone-400">
						One tap copies the teams, the crew, the course — everything but the hangover.
					</p>
					<button
						class="tap press-pop from-brew-500 to-brew-600 w-full rounded-2xl bg-gradient-to-r py-4 text-lg font-black text-stone-900 shadow-lg shadow-black/30 disabled:opacity-50"
						onclick={clone}
						disabled={busy}
					>
						{busy ? '🍺 Pouring next weekend…' : '🍺 Clone for Next Weekend'}
					</button>
				{:else}
					<div class="text-4xl">🗓️🍻</div>
					<h3 class="text-lg font-black text-white">Next weekend is booked!</h3>
					<p class="text-sm text-stone-300">
						{new Date(cloneResult.date + 'T12:00:00').toLocaleDateString(undefined, {
							weekday: 'long',
							month: 'long',
							day: 'numeric'
						})} — same crew, same teams, fresh scorecards.
					</p>
					<button
						class="tap press-pop bg-fairway-600 w-full rounded-2xl py-3.5 font-bold text-white"
						onclick={() => goto(`/event/${cloneResult!.share_code}`)}
					>
						Go to next weekend's event →
					</button>
				{/if}
				<a
					href={icsUrl(code)}
					class="tap card press-pop block rounded-xl py-3 text-sm font-bold text-stone-200"
					download
				>
					📆 Add the weekly series to your calendar (.ics)
				</a>
			</div>

			<!-- Roster overview -->
			<div class="card space-y-2 p-5">
				<h3 class="font-bold text-white">The field</h3>
				{#if bundle.teams.length === 0}
					<p class="text-sm text-stone-400">Nobody has joined yet. Share the link!</p>
				{/if}
				{#each bundle.teams as team (team.id)}
					<div class="flex items-center justify-between rounded-xl bg-black/20 px-4 py-2.5 text-sm">
						<span class="font-bold text-white">{team.name}</span>
						<span class="text-stone-400">
							{[team.player1_id, team.player2_id]
								.map((id) => bundle.golfers.find((g) => g.id === id)?.name)
								.filter(Boolean)
								.join(' & ') || 'empty cart'}
						</span>
					</div>
				{/each}
			</div>

			{#if errorMsg}
				<p class="rounded-xl bg-red-900/50 px-4 py-3 text-sm text-red-200">{errorMsg}</p>
			{/if}
		</div>
	{/if}
{/if}
