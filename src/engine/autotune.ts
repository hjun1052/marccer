// ============================================================
// MODEL WEIGHT AUTO-TUNE (experimental)
// Random search over the core rating/prediction weights, scored by the same
// walk-forward backtest as the BACKTEST tab (avg Brier score, lower=better).
// Deliberately a plain random search, not a real optimizer — with this little
// data a fancier method would just fit noise more confidently.
// ============================================================

import type { League, Team, Match, SimulationConfig } from '../types/index.ts';
import { runBacktest } from './backtest.ts';

export type TunableWeightKey =
  | 'kFactor' | 'homeAdvantage' | 'attackWeight' | 'defenseWeight' | 'venueWeight'
  | 'regressionPriorGames' | 'dixonColesRho';

interface WeightRange {
  key: TunableWeightKey;
  min: number;
  max: number;
}

// Travel fatigue and the count/seed/assumption fields are left alone — this
// only searches the weights that actually drive rating/prediction accuracy.
export const TUNABLE_RANGES: WeightRange[] = [
  { key: 'kFactor', min: 10, max: 50 },
  { key: 'homeAdvantage', min: 0, max: 100 },
  { key: 'attackWeight', min: 0.1, max: 0.7 },
  { key: 'defenseWeight', min: 0.1, max: 0.6 },
  { key: 'venueWeight', min: 0.1, max: 0.8 },
  { key: 'regressionPriorGames', min: 1, max: 12 },
  { key: 'dixonColesRho', min: -0.25, max: 0.05 },
];

// Below this many graded (walk-forward-testable) matches, auto-tune is
// disabled outright — with only a handful of data points, "the best" weights
// found are essentially random and would just be overfit to noise.
export const MIN_BACKTEST_MATCHES = 20;

// Need at least this many distinct graded rounds to carve off a held-out
// validation slice — otherwise there's nothing left to search with.
const MIN_ROUNDS_FOR_SPLIT = 3;

export function randomWeights(base: SimulationConfig, rng: () => number): SimulationConfig {
  const next = { ...base };
  for (const r of TUNABLE_RANGES) {
    (next as unknown as Record<TunableWeightKey, number>)[r.key] = r.min + rng() * (r.max - r.min);
  }
  return next;
}

export function scoreWeights(
  league: League,
  teams: Team[],
  matches: Match[],
  config: SimulationConfig,
  startRound: number,
  endRound: number = Infinity
): number {
  const result = runBacktest(league, teams, matches, config, startRound, endRound);
  return result.overall.matches === 0 ? Infinity : result.overall.avgBrierScore;
}

export interface TrainValidationSplit {
  searchStartRound: number;
  searchEndRound: number;
  holdoutStartRound: number;
  holdoutEndRound: number;
  searchMatches: number;
  holdoutMatches: number;
}

// Last ~30% of graded rounds (min 1) held out as validation; everything
// before that is fair game for the search. Round-based, not match-based, so
// no round ever leaks between the two sets.
export function planTrainValidationSplit(
  league: League,
  teams: Team[],
  matches: Match[],
  config: SimulationConfig,
  startRound: number
): TrainValidationSplit | null {
  const full = runBacktest(league, teams, matches, config, startRound);
  const rounds = full.roundSummaries.map((r) => r.round);
  if (rounds.length < MIN_ROUNDS_FOR_SPLIT) return null;

  const holdoutCount = Math.max(1, Math.floor(rounds.length * 0.3));
  const searchRounds = rounds.slice(0, rounds.length - holdoutCount);
  const holdoutRounds = rounds.slice(rounds.length - holdoutCount);

  return {
    searchStartRound: searchRounds[0],
    searchEndRound: searchRounds[searchRounds.length - 1],
    holdoutStartRound: holdoutRounds[0],
    holdoutEndRound: holdoutRounds[holdoutRounds.length - 1],
    searchMatches: full.roundSummaries.filter((r) => searchRounds.includes(r.round)).reduce((s, r) => s + r.matches, 0),
    holdoutMatches: full.roundSummaries.filter((r) => holdoutRounds.includes(r.round)).reduce((s, r) => s + r.matches, 0),
  };
}

// Simple mulberry32-style PRNG so a tuning run is reproducible from a seed.
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
