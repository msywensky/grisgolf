<script lang="ts">
	import { page } from '$app/state';
	import { eventStore } from '$lib/eventStore.svelte';
	import { randomLoadingLine } from '$lib/copy';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	const code = $derived(page.params.code ?? '');
	const path = $derived(page.url.pathname);

	let copied = $state(false);

	$effect(() => {
		eventStore.load(code);
		return () => eventStore.stop();
	});

	const tabs = $derived([
		{ href: `/event/${code}`, label: '🏆 Leaderboard', active: path === `/event/${code}` },
		{ href: `/event/${code}/score`, label: '✏️ Score', active: path.includes('/score') },
		{ href: `/event/${code}/highlights`, label: '📸 Highlights', active: path.includes('/highlights') }
	]);

	async function shareEvent() {
		const url = `${location.origin}/event/${code}`;
		const title = eventStore.bundle?.event.title ?? 'Golf Scramble';
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

	function statusBadge(status: string): { label: string; cls: string } {
		if (status === 'live') return { label: '🔴 LIVE', cls: 'bg-red-600/80 text-white' };
		if (status === 'final') return { label: '🏁 FINAL', cls: 'bg-stone-600 text-white' };
		return { label: '📅 UPCOMING', cls: 'bg-fairway-700 text-fairway-100' };
	}
</script>

<svelte:head>
	<title>{eventStore.bundle?.event.title ?? 'Scramble'} · HMB Scramble</title>
</svelte:head>

{#if eventStore.loading}
	<div class="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-stone-300">
		<div class="animate-bounce text-5xl">🍺</div>
		<p>{randomLoadingLine()}</p>
	</div>
{:else if eventStore.error}
	<div class="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
		<div class="text-5xl">🔍⛳</div>
		<p class="max-w-sm text-stone-300">{eventStore.error}</p>
		<a href="/" class="tap press-pop bg-brew-500 rounded-xl px-6 py-3 font-bold text-stone-900">
			Back to the clubhouse
		</a>
	</div>
{:else if eventStore.bundle}
	{@const ev = eventStore.bundle.event}
	{@const badge = statusBadge(ev.status)}
	<header class="pt-6 pb-4">
		<div class="flex items-start justify-between gap-3">
			<a href="/" class="text-2xl" title="Home">🍺⛳</a>
			<button
				class="tap press-pop card px-4 py-2 text-sm font-semibold"
				onclick={shareEvent}
			>
				{copied ? '✅ Link copied!' : '🔗 Share'}
			</button>
		</div>
		<h1 class="font-display mt-2 text-3xl font-black text-white">{ev.title}</h1>
		<p class="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-300">
			<span class="rounded-full px-2.5 py-0.5 text-xs font-bold {badge.cls}">{badge.label}</span>
			<span>📍 {ev.course}</span>
			<span>·</span>
			<span>{new Date(ev.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
			<span>·</span>
			<span>{ev.holes} holes</span>
		</p>
	</header>

	<nav class="card sticky top-2 z-10 mb-5 flex overflow-hidden !rounded-2xl p-1">
		{#each tabs as tab (tab.href)}
			<a
				href={tab.href}
				class="tap flex-1 rounded-xl py-2.5 text-center text-sm font-bold transition-colors {tab.active
					? 'bg-fairway-600 text-white'
					: 'text-stone-300 hover:bg-white/5'}"
			>
				{tab.label}
			</a>
		{/each}
	</nav>

	{@render children()}
{/if}
