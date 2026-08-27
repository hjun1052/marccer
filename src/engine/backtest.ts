// ============================================================
// WALK-FORWARD BACKTEST
// For each round, train team strengths only on matches strictly before that
// round, predict that round's matches, then compare against what actually
// happened. Never looks at a round's own results (or later rounds') when
// predicting it — this measures how well-calibrated the model has actually
// been this season, using only data we already have.
// ============================================================

import type { League, Team, Match, SimulationConfig, ResultType } from '../types/index.ts';
import { calculateTeamStrengths, calculateLeagueGoalAverages } from './ratings.ts';
import { predictMatch } from './predictions.ts';

export interface BacktestMatchResult {
  matchId: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  actual: ResultType;
  predictedCorrectly: boolean; // highest-probability outcome matched what happened
  brierScore: number; // 0 = perfect, 2 = maximally wrong (3-outcome Brier score)
}

export interface BacktestRoundSummary {
  round: number;
  matches: number;
  accuracy: number; // fraction where the top-probability outcome matched
  avgBrierScore: number;
}

export interface BacktestResult {
  startRound: number;
  matchResults: BacktestMatchResult[];
  roundSummaries: BacktestRoundSummary[];
  overall: {
    matches: number;
    accuracy: number;
    avgBrierScore: number;
    // A model that always predicted 33/33/33 (no information) has a fixed baseline
    // Brier score against real football's actual W/D/L base rates — this is what to beat.
    naiveBaselineBrierScore: number;
  };
}

function resultFor(homeScore: number, awayScore: number): ResultType {
  if (homeScore > awayScore) return 'W';
  if (homeScore === awayScore) return 'D';
  return 'L';
}

export function runBacktest(
  league: League,
  teams: Team[],
  matches: Match[],
  config: SimulationConfig,
  startRound: number
): BacktestResult {
  const completed = matches
    .filter((m) => m.status === 'completed' && m.homeScore !== null && m.awayScore !== null)
    .sort((a, b) => a.round - b.round);

  const rounds = Array.from(new Set(completed.map((m) => m.round))).sort((a, b) => a - b);
  const matchResults: BacktestMatchResult[] = [];

  for (const round of rounds) {
    if (round < startRound) continue;

    const trainMatches = completed.filter((m) => m.round < round);
    if (trainMatches.length === 0) continue;

    const strengths = calculateTeamStrengths(teams, trainMatches, league, config);
    const leagueGoalAverages = calculateLeagueGoalAverages(trainMatches);
    const roundMatches = completed.filter((m) => m.round === round);

    for (const match of roundMatches) {
      const pred = predictMatch(
        match, strengths, teams, league, config.formWeighting, leagueGoalAverages, config.homeAwayAdjustment, config.travelFatigue, config
      );
      if (!pred) continue;

      const actual = resultFor(match.homeScore!, match.awayScore!);
      const probs = { W: pred.homeWinProb, D: pred.drawProb, L: pred.awayWinProb };
      const predictedOutcome = (Object.keys(probs) as ResultType[]).reduce((a, b) => (probs[a] >= probs[b] ? a : b));

      const brierScore =
        (probs.W - (actual === 'W' ? 1 : 0)) ** 2 +
        (probs.D - (actual === 'D' ? 1 : 0)) ** 2 +
        (probs.L - (actual === 'L' ? 1 : 0)) ** 2;

      matchResults.push({
        matchId: match.id,
        round,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeWinProb: pred.homeWinProb,
        drawProb: pred.drawProb,
        awayWinProb: pred.awayWinProb,
        actual,
        predictedCorrectly: predictedOutcome === actual,
        brierScore,
      });
    }
  }

  const roundSummaries: BacktestRoundSummary[] = rounds
    .filter((r) => r >= startRound)
    .map((round) => {
      const rm = matchResults.filter((m) => m.round === round);
      if (rm.length === 0) return null;
      return {
        round,
        matches: rm.length,
        accuracy: rm.filter((m) => m.predictedCorrectly).length / rm.length,
        avgBrierScore: rm.reduce((sum, m) => sum + m.brierScore, 0) / rm.length,
      };
    })
    .filter((s): s is BacktestRoundSummary => s !== null);

  // Naive baseline: predict every match as the league's actual overall W/D/L rates
  // (not 33/33/33 — a fairer bar since home advantage alone beats uniform guessing).
  const rateW = completed.filter((m) => resultFor(m.homeScore!, m.awayScore!) === 'W').length / (completed.length || 1);
  const rateD = completed.filter((m) => resultFor(m.homeScore!, m.awayScore!) === 'D').length / (completed.length || 1);
  const rateL = completed.filter((m) => resultFor(m.homeScore!, m.awayScore!) === 'L').length / (completed.length || 1);
  const naiveBaselineBrierScore = matchResults.length === 0 ? 0 : matchResults.reduce((sum, m) => {
    return sum +
      (rateW - (m.actual === 'W' ? 1 : 0)) ** 2 +
      (rateD - (m.actual === 'D' ? 1 : 0)) ** 2 +
      (rateL - (m.actual === 'L' ? 1 : 0)) ** 2;
  }, 0) / matchResults.length;

  return {
    startRound,
    matchResults,
    roundSummaries,
    overall: {
      matches: matchResults.length,
      accuracy: matchResults.length === 0 ? 0 : matchResults.filter((m) => m.predictedCorrectly).length / matchResults.length,
      avgBrierScore: matchResults.length === 0 ? 0 : matchResults.reduce((sum, m) => sum + m.brierScore, 0) / matchResults.length,
      naiveBaselineBrierScore,
    },
  };
}
