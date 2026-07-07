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
			position: 0
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

/** Par-ish label for a score relative to a par-4 assumption, purely for fun copy. */
export function scoreReaction(score: number): string {
	if (score <= 2) return 'EAGLE?! Someone check that scorecard 🦅';
	if (score === 3) return 'Birdie juice! First round is on you 🍹';
	if (score === 4) return 'Par. Respectable. Hydrate accordingly 🍺';
	if (score === 5) return 'Bogey. The beer cart heard that one 😅';
	if (score === 6) return 'Double. Shake it off, champ 🫡';
	return 'That hole owes you an apology 🙈';
}
