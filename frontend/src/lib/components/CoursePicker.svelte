<script lang="ts">
	// Course search-and-pick: real courses via the backend proxy (state dropdown
	// always visible — the crew crosses the PA/NJ line), with a free-text escape
	// hatch so an unlisted course never blocks creating the event.
	import { searchCourses, type CourseResult } from '$lib/api';
	import { courseDisplayName, teeOptions, US_STATES } from '$lib/courses';
	import { getPrefState, setPrefState } from '$lib/session';
	import type { TeeGender } from '$lib/types';

	let {
		courseName = $bindable(''),
		externalId = $bindable<number | null>(null),
		teeName = $bindable<string | null>(null),
		teeGender = $bindable<TeeGender | null>(null)
	}: {
		courseName?: string;
		externalId?: number | null;
		teeName?: string | null;
		teeGender?: TeeGender | null;
	} = $props();

	let mode = $state<'search' | 'text'>('search');
	let query = $state('');
	let usState = $state(getPrefState() ?? 'PA');
	let results = $state<CourseResult[]>([]);
	let searching = $state(false);
	let degraded = $state(false);
	let searchFailed = $state(false);
	let selected = $state<CourseResult | null>(null);

	const tees = $derived(selected ? teeOptions(selected) : []);

	// Debounced search; the counter guards against stale responses landing late.
	let seq = 0;
	$effect(() => {
		const q = query.trim();
		const st = usState;
		if (mode !== 'search' || selected || q.length < 3) {
			results = [];
			searching = false;
			return;
		}
		const mySeq = ++seq;
		const timer = setTimeout(async () => {
			searching = true;
			try {
				const res = await searchCourses(q, st);
				if (mySeq !== seq) return;
				results = res.results;
				degraded = res.degraded;
				searchFailed = false;
			} catch {
				if (mySeq !== seq) return;
				searchFailed = true;
				results = [];
			} finally {
				if (mySeq === seq) searching = false;
			}
		}, 350);
		return () => clearTimeout(timer);
	});

	function pickState(st: string) {
		usState = st;
		setPrefState(st);
	}

	function pickCourse(r: CourseResult) {
		selected = r;
		externalId = r.external_id;
		courseName = courseDisplayName(r);
		teeName = null;
		teeGender = null;
		results = [];
	}

	function clearCourse() {
		selected = null;
		externalId = null;
		teeName = null;
		teeGender = null;
	}

	function useFreeText() {
		mode = 'text';
		clearCourse();
	}

	function pickTee(name: string | null, gender: TeeGender | null) {
		teeName = name;
		teeGender = gender;
	}
</script>

<div class="space-y-2 text-sm font-medium text-stone-300">
	<span class="block">Course</span>

	{#if mode === 'text'}
		<input
			class="tap w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-stone-500"
			placeholder="Sunny Pines Muni"
			bind:value={courseName}
		/>
		<button type="button" class="tap text-xs font-semibold text-stone-500 underline" onclick={() => (mode = 'search')}>
			🔍 Search real courses instead
		</button>
	{:else if selected}
		<!-- Picked course summary -->
		<div class="rounded-xl border border-fairway-600/50 bg-fairway-900/30 px-4 py-3">
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<p class="font-bold text-white">{courseDisplayName(selected)}</p>
					<p class="text-xs text-stone-400">
						📍 {[selected.city, selected.state].filter(Boolean).join(', ')}
					</p>
				</div>
				<button type="button" class="tap shrink-0 text-xs font-semibold text-stone-400 underline" onclick={clearCourse}>
					Change
				</button>
			</div>
		</div>

		{#if tees.length > 0}
			<span class="block pt-1">Tee box</span>
			<div class="space-y-1.5">
				{#each tees as opt (`${opt.gender}:${opt.tee.tee_name}`)}
					<button
						type="button"
						class="tap press-pop flex w-full items-baseline justify-between gap-2 rounded-xl border px-3 py-2.5 text-left {teeName ===
							opt.tee.tee_name && teeGender === opt.gender
							? 'border-fairway-500 bg-fairway-600 text-white'
							: 'border-white/15 bg-black/20 text-stone-300'}"
						onclick={() => pickTee(opt.tee.tee_name, opt.gender)}
					>
						<span class="font-bold">
							{opt.tee.tee_name}
							<span class="text-xs font-semibold opacity-70">({opt.gender === 'male' ? 'M' : 'W'})</span>
						</span>
						<span class="text-xs">
							{opt.tee.total_yards} yds · Par {opt.tee.par_total} · {opt.tee.course_rating}/{opt.tee.slope_rating}
						</span>
					</button>
				{/each}
				<button
					type="button"
					class="tap w-full rounded-xl border px-3 py-2 text-left text-xs font-semibold {teeName === null
						? 'border-white/30 bg-white/10 text-stone-200'
						: 'border-white/15 bg-black/20 text-stone-500'}"
					onclick={() => pickTee(null, null)}
				>
					Skip the tee box (we play from wherever)
				</button>
			</div>
		{/if}
	{:else}
		<!-- Search input + always-visible state dropdown -->
		<div class="flex gap-2">
			<input
				class="tap min-w-0 flex-1 rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-white placeholder:text-stone-500"
				placeholder="Search courses (3+ letters)"
				bind:value={query}
			/>
			<select
				class="tap shrink-0 rounded-xl border border-white/15 bg-black/20 px-3 py-3 font-bold text-white"
				value={usState}
				onchange={(e) => pickState(e.currentTarget.value)}
				aria-label="State"
			>
				{#each US_STATES as st (st.code)}
					<option value={st.code} class="bg-stone-900">{st.code}</option>
				{/each}
			</select>
		</div>

		{#if searching}
			<p class="text-xs text-stone-500">Searching {usState} courses…</p>
		{:else if results.length > 0}
			<div class="space-y-1.5">
				{#each results as r (r.external_id)}
					<button
						type="button"
						class="tap press-pop w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2.5 text-left hover:bg-white/10"
						onclick={() => pickCourse(r)}
					>
						<p class="font-bold text-white">{courseDisplayName(r)}</p>
						<p class="text-xs text-stone-400">📍 {[r.city, r.state].filter(Boolean).join(', ')}</p>
					</button>
				{/each}
			</div>
		{:else if query.trim().length >= 3}
			<p class="text-xs text-stone-500">
				{searchFailed || degraded
					? "Course search is having a rough round — cached courses only right now."
					: `No ${usState} courses match — try fewer words, or another state.`}
			</p>
		{/if}
		<button type="button" class="tap text-xs font-semibold text-stone-500 underline" onclick={useFreeText}>
			Can't find it? Just type the name
		</button>
	{/if}
</div>
