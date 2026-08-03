// Season standings: fold per-night leaderboards (scoring.ts) into season
// points for the fixed pairs. Pure function, same spirit as buildLeaderboard.
import { buildLeaderboard } from './scoring';
import type { Event, Golfer, League, Score, Season, SeasonTeam, Team } from './types';

export interface StandingsRow {
	seasonTeam: SeasonTeam;
	/** Season total under the league's scoring_mode (for 'record', w + t/2 as the sort key). */
	points: number;
	/** Won-the-night record — tracked in every mode, displayed in 'record'. */
	record: { w: number; l: number; t: number };
	/** Final league nights this pair appeared in. */
	played: number;
	position: number;
}

/** Standings for one season. Only events marked 'final' count. */
export function buildStandings(
	league: League,
	season: Season,
	seasonTeams: SeasonTeam[],
	events: Event[],
	teams: Team[],
	golfers: Golfer[],
	scores: Score[]
): StandingsRow[] {
	const rows = new Map<string, StandingsRow>(
		seasonTeams
			.filter((st) => st.season_id === season.id)
			.map((st) => [
				st.id,
				{ seasonTeam: st, points: 0, record: { w: 0, l: 0, t: 0 }, played: 0, position: 0 }
			])
	);

	const finals = events.filter((e) => e.season_id === season.id && e.status === 'final');
	for (const event of finals) {
		const evTeams = teams.filter((t) => t.event_id === event.id);
		const leaderboard = buildLeaderboard(
			event,
			evTeams,
			golfers.filter((g) => g.event_id === event.id),
			scores.filter((s) => s.event_id === event.id)
		).filter((r) => r.thru > 0);

		const nightWinners = leaderboard.filter((r) => r.position === 1).length;
		for (const nightRow of leaderboard) {
			const row = nightRow.team.season_team_id
				? rows.get(nightRow.team.season_team_id)
				: undefined;
			if (!row) continue;
			row.played++;

			if (nightRow.position === 1) {
				if (nightWinners > 1) row.record.t++;
				else row.record.w++;
			} else {
				row.record.l++;
			}

			if (league.scoring_mode === 'placement') {
				// Ties share a position, so tied pairs share its points.
				row.points += league.placement_points[nightRow.position - 1] ?? 0;
			} else if (league.scoring_mode === 'match_points') {
				row.points += nightRow.matchPoints;
			} else {
				row.points = row.record.w + row.record.t * 0.5;
			}
		}
	}

	const sorted = [...rows.values()].sort(
		(a, b) =>
			b.points - a.points || b.record.w - a.record.w || a.seasonTeam.name.localeCompare(b.seasonTeam.name)
	);
	sorted.forEach((row, i) => {
		const prev = sorted[i - 1];
		row.position = prev && prev.points === row.points ? prev.position : i + 1;
	});
	return sorted;
}
