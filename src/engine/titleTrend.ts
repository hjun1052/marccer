// ============================================================
// TITLE PROBABILITY TREND (retroactive)
// No stored snapshots — for each past round, rebuilds team strengths
// from only the matches known by that point (same walk-forward idea as
// backtest.ts) and re-simulates the season from there, giving the title
// probability the model *would* have shown at that point in time.
// ============================================================

import type { League, Team, Match, SimulationConfig } from '../types/index.ts';
import { calculateTeamStrengths } from './ratings.ts';
import { simulateSeason } from './simulation.ts';

export interface TitleTrendPoint {
  round: number;
  titleProbability: number;
}

// Freezes the season as it looked right after `round`: matches through
// that round keep their real result, everything later is reset to
// scheduled/unplayed so simulateSeason projects forward from there.
// Exported for the site-wide "time machine" view (useData.tsx) — same
// snapshot idea, applied to everything instead of just this trend chart.
export function snapshotAsOfRound(matches: Match[], round: number): Match[] {
  return matches.map((m) => {
    if (m.round <= round && m.status === 'completed') return m;
    return { ...m, status: 'scheduled' as const, homeScore: null, awayScore: null };
  });
}

export function completedRoundsSoFar(matches: Match[]): number[] {
  return Array.from(new Set(matches.filter((m) => m.status === 'completed').map((m) => m.round))).sort((a, b) => a - b);
}

// One point at a time — the caller (UI) batches these across ticks so a
// several-round trend doesn't block the page while it computes.
export function computeTitleProbabilityAtRound(
  league: League,
  teams: Team[],
  matches: Match[],
  config: SimulationConfig,
  targetTeamId: string,
  round: number
): TitleTrendPoint {
  const snapshot = snapshotAsOfRound(matches, round);
  const trainMatches = snapshot.filter((m) => m.status === 'completed');
  const strengths = calculateTeamStrengths(teams, trainMatches, league, config);
  const output = simulateSeason(league, teams, snapshot, strengths, config);
  const targetResult = output.results.find((r) => r.teamId === targetTeamId);
  return { round, titleProbability: targetResult?.titleProbability ?? 0 };
}

export function computeTitleProbabilityTrend(
  league: League,
  teams: Team[],
  matches: Match[],
  config: SimulationConfig,
  targetTeamId: string
): TitleTrendPoint[] {
  return completedRoundsSoFar(matches).map((round) =>
    computeTitleProbabilityAtRound(league, teams, matches, config, targetTeamId, round)
  );
}
