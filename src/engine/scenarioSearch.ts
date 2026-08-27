// ============================================================
// TITLE SCENARIO SEARCH (reverse search)
// Instead of "what if this one match goes X", enumerate every W/D/L combo
// across the target's remaining matches and report, for each distinct
// win/draw/loss split, how many combinations produce it and what title
// probability that split carries.
// ============================================================

import type { League, Team, Match, TeamStrength, SimulationConfig } from '../types/index.ts';
import { simulateWithLockedOutcomes } from './simulation.ts';

export interface TitleScenarioBucket {
  wins: number;
  draws: number;
  losses: number;
  points: number;
  // Distinct match-by-match assignments (which specific games are wins vs
  // draws vs losses) that produce this exact wins/draws/losses split.
  comboCount: number;
  // Real simulated title probability for one representative assignment of
  // this split across the target's actual remaining opponents (wins applied
  // to the earliest matches, then draws, then losses) — not averaged across
  // every permutation, since who you beat matters a little too.
  titleProbability: number;
}

export interface TitleScenarioSearchResult {
  targetMatches: Match[];
  totalCombinations: number;
  buckets: TitleScenarioBucket[];
}

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function multinomial(n: number, wins: number, draws: number): number {
  return factorial(n) / (factorial(wins) * factorial(draws) * factorial(n - wins - draws));
}

export function searchTitleScenarios(
  league: League,
  teams: Team[],
  matches: Match[],
  strengths: Map<string, TeamStrength>,
  config: SimulationConfig,
  subSimCount = 300
): TitleScenarioSearchResult {
  const targetMatches = matches
    .filter(
      (m) =>
        m.status === 'scheduled' &&
        (m.homeTeamId === league.targetTeamId || m.awayTeamId === league.targetTeamId)
    )
    .sort((a, b) => a.round - b.round);

  const n = targetMatches.length;
  if (n === 0) {
    return { targetMatches, totalCombinations: 0, buckets: [] };
  }

  const completedMatches = matches.filter((m) => m.status === 'completed');
  const futureMatches = matches.filter((m) => m.status === 'scheduled');
  const subConfig: SimulationConfig = { ...config, count: Math.min(config.count, subSimCount) };

  const buckets: TitleScenarioBucket[] = [];

  for (let wins = 0; wins <= n; wins++) {
    for (let draws = 0; draws <= n - wins; draws++) {
      const losses = n - wins - draws;
      const points = wins * league.rules.winPoints + draws * league.rules.drawPoints + losses * league.rules.lossPoints;

      const lockedMatches = targetMatches.map((match, i) => {
        const isHome = match.homeTeamId === league.targetTeamId;
        const targetResult: 'W' | 'D' | 'L' = i < wins ? 'W' : i < wins + draws ? 'D' : 'L';
        const outcome: 'home_win' | 'draw' | 'away_win' =
          targetResult === 'D' ? 'draw'
          : targetResult === 'W' ? (isHome ? 'home_win' : 'away_win')
          : (isHome ? 'away_win' : 'home_win');
        return { match, outcome };
      });

      const titleProbability = simulateWithLockedOutcomes(
        league, teams, completedMatches, futureMatches, lockedMatches, strengths, subConfig
      );

      buckets.push({
        wins,
        draws,
        losses,
        points,
        comboCount: multinomial(n, wins, draws),
        titleProbability,
      });
    }
  }

  buckets.sort((a, b) => b.points - a.points);

  return {
    targetMatches,
    totalCombinations: Math.pow(3, n),
    buckets,
  };
}
