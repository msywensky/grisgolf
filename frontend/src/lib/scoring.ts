import type { Event, Golfer, Score, Team } from './types';

export interface LeaderboardRow {
	team: Team;
	players: Golfer[];
	/** Holes with a score recorded */
	thru: number;
	gross: number;
	/** Gross minus prorated scramble handicap allowance */
	net: number;
	/** 1 pt per hole won outright vs the field, 0.5 per tie for low */
	matchPoints: number;
	record: { w: number; l: number; t: number };
	position: number;
	/**
	 * Total strokes attributed to each roster slot (player1/player2) across
	 * holes where the split was recorded; null if no hole has one yet.
	 */
	shotsUsed: { p1: number; p2: number } | null;
}

/**
 * Scramble handicap allowance: 35% of the team's combined handicap
 * (a common 2-person scramble convention), scaled to the number of holes.
 */
export function teamAllowance(players: Golfer[], holes: number): number {
	const combined = players.reduce((sum, p) => sum + (p.handicap ?? 0), 0);
	return (combined * 0.35 * holes) / 18;
}

/** Build the live leaderboard from raw rows. Pure function — easy to test, easy to trust. */
export function buildLeaderboard(
	event: Event,
	teams: Team[],
	golfers: Golfer[],
	scores: Score[]
): LeaderboardRow[] {
	const golferById = new Map(golfers.map((g) => [g.id, g]));

	// score lookup: hole -> team_id -> score
	const byHole = new Map<number, Map<string, number>>();
	for (const s of scores) {
		if (!byHole.has(s.hole_number)) byHole.set(s.hole_number, new Map());
		byHole.get(s.hole_number)!.set(s.team_id, s.score);
	}

	const rows: LeaderboardRow[] = teams.map((team) => {
		const players = [team.player1_id, team.player2_id]
			.map((id) => (id ? golferById.get(id) : undefined))
			.filter((g): g is Golfer => !!g);

		const teamScores = scores.filter((s) => s.team_id === team.id);
		const thru = teamScores.length;
		const gross = teamScores.reduce((sum, s) => sum + s.score, 0);

		// Shots-used split, summed over holes that recorded one.
		const splitScores = teamScores.filter(
			(s) => s.player1_shots !== null || s.player2_shots !== null
		);
		const shotsUsed =
			splitScores.length > 0
				? {
						p1: splitScores.reduce((sum, s) => sum + (s.player1_shots ?? 0), 0),
						p2: splitScores.reduce((sum, s) => sum + (s.player2_shots ?? 0), 0)
					}
				: null;

		// Prorate the allowance by holes played so mid-round net is meaningful.
		const allowance = teamAllowance(players, event.holes);
		const net = thru > 0 ? Math.round((gross - (allowance * thru) / event.holes) * 10) / 10 : 0;

		// Match points: hole-by-hole vs the whole field (needs 2+ teams on the hole).
		let w = 0,
			l = 0,
			t = 0;
		for (const [, holeScores] of byHole) {
			const mine = holeScores.get(team.id);
			if (mine === undefined || holeScores.size < 2) continue;
			const best = Math.min(...holeScores.values());
			const winners = [...holeScores.values()].filter((v) => v === best).length;
			if (mine > best) l++;
			else if (winners === 1) w++;
			else t++;
		}

		return {
			team,
			players,
			thru,
			gross,
			net,
			matchPoints: w + t * 0.5,
			record: { w, l, t },
			position: 0,
			shotsUsed
		};
	});

	// Rank: teams with scores first (by net, then gross), empty scorecards last.
	rows.sort((a, b) => {
		if (a.thru === 0 && b.thru === 0) return a.team.name.localeCompare(b.team.name);
		if (a.thru === 0) return 1;
		if (b.thru === 0) return -1;
		return a.net - b.net || a.gross - b.gross || b.matchPoints - a.matchPoints;
	});
	rows.forEach((row, i) => {
		// Share position on exact net+gross ties
		const prev = rows[i - 1];
		row.position =
			prev && row.thru > 0 && prev.net === row.net && prev.gross === row.gross
				? prev.position
				: i + 1;
	});
	return rows;
}

const ACE_REACTIONS = [
	'HOLE IN ONE! The clubhouse is on fire 🔥',
	'Ace! Your team just won every bar tab until Tuesday.',
	'The ball did not even see the fairway. Straight to the cup.',
	'Your team owes the field a keg. At minimum.',
	'The pin just filed for early retirement.',
	'Call the news. Call your mom. Call everyone.',
	'That is not a scramble anymore, that is a miracle.',
	'The green is still processing what just happened.',
	'Ace! The course just added this hole to its resume.',
	'Your handicap just evaporated on the spot.',
	'The ball had one job and it absolutely nailed it.',
	'Even the cart is jealous right now.',
	'Ace! The group chat will never recover from this.',
	'Your teammates are questioning the laws of physics.',
	'The cup just got the best text of its life.',
	'That tee shot had a first-class ticket and no return.',
	'Ace! The cart girl just put you on her speed dial.',
	'Ace! The cart girl is already driving to your table with a round.',
	'Ace! The cart girl already named a drink after you.',
	'Ace! Legend status achieved. The cart girl is the witness.'
];

const REACTIONS: Record<string, string[]> = {
	'-3': [
		'Albatross! The rarest bird in golf 🦅',
		'The clubhouse is buying you drinks.',
		'Your team just won the hole, the round, and the bar tab.',
		'That is a hole-in-one with extra steps.',
		'Golf gods have smiled upon you.',
		'The scorecard needs a fact check.',
		'Your opponents are requesting a drug test.',
		'The pin just filed a complaint.',
		'You owe exactly zero apologies for this.',
		'The ball had its own GPS.',
		'This is what legends are made of.',
		'Your swing just went viral.',
		'The cart path is jealous.',
		'Even the sand traps are impressed.',
		'Your handicap just dropped in real time.',
		'The course record is sweating.',
		'The cart girl is already pouring your victory lap.',
		'The cart girl counted every step of that albatross.',
		'The cart girl filed a commendation for this shot.',
		'The cart girl already told the next tee about this.'
	],
	'-2': [
		'Eagle! Someone check that scorecard 🦅',
		'Two under! The bar tab just got interesting.',
		'Your team is buying the first round.',
		'The green is still processing that.',
		'Eagle energy detected. Proceed with celebration.',
		'Your handicap is crying tears of joy.',
		'The cup was magnetized, admit it.',
		'That is not a scramble, that is a demolition.',
		'Your opponents need a moment.',
		'The golf ball had a personal vendetta against par.',
		'Even the trees are applauding.',
		'Your swing just paid for dinner.',
		'The scorecard needs a reality check.',
		'You just broke the group chat.',
		'The hole owes YOU money now.',
		'Your teammates are questioning their life choices.',
		'The cart girl already checked the scorecard.',
		'The cart girl is already running your tab.',
		'The cart girl brought the broom for this demolition.',
		'The cart girl took receipts on that one.'
	],
	'-1': [
		'Birdie juice! First round is on you 🍹',
		'Birdie! The weekend warriors approve.',
		'One under! Your team is feeling dangerous.',
		'The green is still recovering.',
		'Birdie! Time to update the group chat.',
		'Your handicap just got a little more confident.',
		'The cup said thank you.',
		'That is how you start a rivalry.',
		'Birdie! The beer cart is taking notice.',
		'Your swing just bought a round.',
		'The hole never stood a chance.',
		'Par is looking nervous.',
		'Your teammates are nodding in approval.',
		'The ball had a one-way ticket to the bottom.',
		'Birdie! The weekend just got interesting.',
		'Your golf game is showing off.',
		'The cart girl is already mixing your birdie juice.',
		'The cart girl called it from the fairway.',
		'The cart girl is pouring your victory round.',
		'The cart girl just stole your heart with that birdie.'
	],
	'0': [
		'Par. Respectable. Hydrate accordingly 🍺',
		'Par! The steady hand of a weekend warrior.',
		'Even par. The golf gods are neither pleased nor angry.',
		'Par. The course accepts your offering.',
		'Solid par. Nothing to see here, move along.',
		'Par! Your team is keeping the ship steady.',
		'The hole and you have reached an understanding.',
		'Par. The beer cart respects this.',
		'Even steven. The leaderboard holds its breath.',
		'Par! The most underrated score in golf.',
		'The green says thanks for not making it weird.',
		'Par. Your handicap is neither rising nor falling.',
		'The hole gave you exactly what you deserved.',
		'Par! The backbone of any good scramble.',
		'The scorecard nods and moves on.',
		'Par. Your team is still in the game.',
		'The cart girl agrees with this par.',
		'The cart girl is keeping the drinks cold for you.',
		'The cart girl holds your drink while you hold par.',
		'The cart girl accepts your order without judgment.'
	],
	'1': [
		'Bogey. The beer cart heard that one 😅',
		'Bogey. Your team is still alive.',
		'One over! The hole fought back.',
		'Bogey. The leaderboard barely noticed.',
		'One over par. The weekend continues.',
		'Bogey. Your handicap is raising an eyebrow.',
		'The green is not impressed but not devastated.',
		'Bogey. The cup was slightly smaller than usual.',
		'One over! Your team owes the field a drink.',
		'Bogey. The most common score in golf, honestly.',
		'The hole won this round. Fair enough.',
		'Bogey. Your swing needs a timeout.',
		'One over. The leaderboard shrugs.',
		'Bogey. The course collects its tax.',
		'The ball took the scenic route.',
		'Bogey. Your team is still in it.',
		'The cart girl heard that bogey too.',
		'The cart girl says your glass is still full.',
		'The cart girl is still in your corner.',
		'The cart girl says time to reorder.'
	],
	'2': [
		'Double. Shake it off, champ 🫡',
		'Double bogey. The hole just scored on you.',
		'Two over! Your team owes the field two drinks.',
		'Double bogey. The green is laughing.',
		'Two over par. The leaderboard is concerned.',
		'Double bogey. Your handicap is filing a report.',
		'The hole just put up a billboard about this.',
		'Double bogey. The cup moved, obviously.',
		'Two over! Your team needs a pep talk.',
		'Double bogey. The course is collecting rent.',
		'The ball took a detour through three zip codes.',
		'Double bogey. Your swing is on probation.',
		'Two over. The green had a personal vendetta.',
		'Double bogey. The leaderboard side-eyes you.',
		'The hole just wrote a memoir about this.',
		'Double bogey. Your team is in damage control.',
		'The cart girl is shaking her head at this one.',
		'The cart girl scored your tab while you scored double.',
		'The cart girl has a personal tab ready for you.',
		'The cart girl just filed your next round.'
	],
	'3': [
		'Triple. That hole owes you an apology 🙈',
		'Triple bogey. The course is charging extra.',
		'Three over! Your team needs an intervention.',
		'Triple bogey. The green is writing a book about this.',
		'Three over par. The leaderboard is judging you.',
		'Triple bogey. Your handicap is crying.',
		'The hole just put your name on a warning sign.',
		'Triple bogey. The cup filed a complaint.',
		'Three over! Your team owes the field a case.',
		'Triple bogey. The course is collecting damages.',
		'The ball took a tour of the entire property.',
		'Triple bogey. Your swing needs therapy.',
		'Three over. The green had a trap door AND a moat.',
		'Triple bogey. The leaderboard is concerned for you.',
		'The hole just retired your ball.',
		'Triple bogey. Your team is in crisis mode.',
		'The cart girl owes you a free one for this.',
		'The cart girl is comping your next round.',
		'The cart girl put your name on the VIP list anyway.',
		'The cart girl called the bartender for you.'
	],
	'4': [
		'Quadruple. The hole just ended you 💀',
		'Four over! Your team needs a new sport.',
		'Quadruple bogey. The course is billing you hourly.',
		'The green is now your legal enemy.',
		'Four over par. The leaderboard filed a missing persons report.',
		'Quadruple bogey. Your handicap just quit.',
		'The hole just wrote you a strongly worded letter.',
		'Four over! The cup called the cops.',
		'Quadruple bogey. The course is charging emotional damages.',
		'The ball is still looking for the green.',
		'Four over. Your team needs a witness protection program.',
		'Quadruple bogey. The leaderboard is concerned for your wellbeing.',
		'The green just put up a memorial plaque.',
		'Four over! Your swing needs a restraining order.',
		'Quadruple bogey. The hole just won a Nobel Prize.',
		'The course is now your landlord.',
		'The cart girl is writing your obituary.',
		'The cart girl called the bartender for emergency support.',
		'The cart girl just put up a memorial tab.',
		'The cart girl says time to consider another round.'
	]
};

const DEFAULT_REACTIONS = [
	'The scorecard just filed for workers comp.',
	'Golf is hard. Beer is easy. You need a LOT of beer.',
	'That is a story for the 19th hole. A very sad story.',
	'Your team needs a new sport. And a new team.',
	'The course just won this round. By a landslide.',
	'Your swing is filing for unemployment AND alimony.',
	'That hole just scored on you. Repeatedly.',
	'The leaderboard is concerned. And slightly amused.',
	'Your handicap is weeping into its whiskey.',
	'The green is writing a book about this. As a cautionary tale.',
	'The ball took a scenic route through three counties.',
	'Your team owes the field a round. And an apology.',
	'The cup moved. Obviously. It was running away.',
	'Golf: the only sport where you can pay $200 to suffer like this.',
	'The course is collecting rent. And charging late fees.',
	'Your swing needs a timeout. And a therapist.',
	'The hole just put up a billboard: "Warning: This Team Plays Here."',
	'The green had a personal vendetta. And it won.',
	'The leaderboard side-eyes you. Then looks away in pity.',
	'The ball took a detour through three zip codes and a time zone.',
	'Your handicap just changed its name and moved to another state.',
	'The scorecard needs a support group.',
	'Even the water hazard felt bad for you.',
	'Your team just invented a new score. It is called "nope."',
	'The course architect called. They want their par back.',
	'Your golf game just got downgraded to "participation."',
	'The cart girl filed for hazard pay after watching this.',
	'The cart girl agrees you need a LOT of beer.',
	'The cart girl is already telling this story at the 19th hole.',
	'The cart girl needs a new customer after this round.'
];

/** Fun copy for a score vs par. Defaults to par 4 when the hole's real par is unknown. */
export function scoreReaction(score: number, par = 4): string {
	if (score === 1) {
		const pool = ACE_REACTIONS;
		return pool[Math.floor(Math.random() * pool.length)];
	}
	const diff = score - par;
	const key = String(diff);
	const pool = REACTIONS[key] ?? DEFAULT_REACTIONS;
	return pool[Math.floor(Math.random() * pool.length)];
}
