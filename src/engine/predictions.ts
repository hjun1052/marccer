// ============================================================
// MATCH PREDICTION ENGINE
// Poisson-style goal model with team strength and home advantage
// ============================================================

import type {
  Match,
  MatchPrediction,
  TeamStrength,
  Team,
  League,
  SimulationConfig,
} from '../types/index.ts';
import { calculateLeagueGoalAverages, type LeagueGoalAverages } from './ratings.ts';
import { haversineKm } from '../utils/geo.ts';

const MAX_GOALS = 8;
const MODEL_VERSION = '0.5.0';
// Fallback weights, used only when no config is supplied. Real callers should
// pass the current SimulationConfig so MODEL WEIGHTS tab adjustments apply.
const DEFAULT_DIXON_COLES_RHO = -0.13;
const DEFAULT_TRAVEL_FATIGUE_REFERENCE_KM = 200;
const DEFAULT_TRAVEL_FATIGUE_MAX_PENALTY = 0.1;
const FALLBACK_GOAL_AVERAGES: LeagueGoalAverages = { avgHomeGoals: 1.5, avgAwayGoals: 1.15 };

export function predictMatch(
  match: Match,
  strengths: Map<string, TeamStrength>,
  teams: Team[],
  _league: League,
  formWeight: number = 0.3,
  leagueGoalAverages: LeagueGoalAverages = FALLBACK_GOAL_AVERAGES,
  homeAwayAdjustment: boolean = true,
  travelFatigue: boolean = false,
  weightsConfig?: SimulationConfig
): MatchPrediction | null {
  const DIXON_COLES_RHO = weightsConfig?.dixonColesRho ?? DEFAULT_DIXON_COLES_RHO;
  const TRAVEL_FATIGUE_REFERENCE_KM = weightsConfig?.travelFatigueReferenceKm ?? DEFAULT_TRAVEL_FATIGUE_REFERENCE_KM;
  const TRAVEL_FATIGUE_MAX_PENALTY = weightsConfig?.travelFatigueMaxPenalty ?? DEFAULT_TRAVEL_FATIGUE_MAX_PENALTY;

  const homeStr = strengths.get(match.homeTeamId);
  const awayStr = strengths.get(match.awayTeamId);
  if (!homeStr || !awayStr) return null;

  // Blend overall strength with form
  const homeAttack = blendWithForm(
    homeStr.attack,
    homeStr.formRating,
    formWeight
  );
  const homeDefense = blendWithForm(
    homeStr.defense,
    homeStr.formRating,
    formWeight
  );
  const awayAttack = blendWithForm(
    awayStr.attack,
    awayStr.formRating,
    formWeight
  );
  const awayDefense = blendWithForm(
    awayStr.defense,
    awayStr.formRating,
    formWeight
  );

  // Expected goals: real season home/away scoring baselines (not a guessed constant),
  // scaled by attack/defense strength and by each team's own home/away split rating
  // (homeStrength/awayStrength) so a team that specifically over/under-performs by
  // venue shows up here, on top of the league-wide home advantage. Toggle this off
  // to treat every match as neutral-venue (same baseline goals, no venue factor).
  const neutralGoals = (leagueGoalAverages.avgHomeGoals + leagueGoalAverages.avgAwayGoals) / 2;
  const avgHomeGoals = homeAwayAdjustment ? leagueGoalAverages.avgHomeGoals : neutralGoals;
  const avgAwayGoals = homeAwayAdjustment ? leagueGoalAverages.avgAwayGoals : neutralGoals;
  const homeVenueFactor = homeAwayAdjustment ? homeStr.homeStrength / 50 : 1;
  const awayVenueFactor = homeAwayAdjustment ? awayStr.awayStrength / 50 : 1;

  const homeAttackFactor = (homeAttack / 50) * avgHomeGoals * homeVenueFactor;
  const awayDefenseFactor = 1 - (awayDefense - 50) / 200;
  let expectedHomeGoals = Math.max(
    0.1,
    homeAttackFactor * awayDefenseFactor
  );

  const awayAttackFactor = (awayAttack / 50) * avgAwayGoals * awayVenueFactor;
  const homeDefenseFactor = 1 - (homeDefense - 50) / 200;
  let expectedAwayGoals = Math.max(
    0.1,
    awayAttackFactor * homeDefenseFactor
  );

  // Travel fatigue: the away team's legs are heavier the further they had to
  // travel from their own ground — suppresses their attack a little and gives
  // the (fresher) home side a small boost, scaled by how far the trip was.
  if (travelFatigue) {
    const homeTeam = teams.find((t) => t.id === match.homeTeamId);
    const awayTeam = teams.find((t) => t.id === match.awayTeamId);
    if (homeTeam?.venue && awayTeam?.venue) {
      const distanceKm = haversineKm(
        homeTeam.venue.lat, homeTeam.venue.lng,
        awayTeam.venue.lat, awayTeam.venue.lng
      );
      const fatigue = Math.min(1, distanceKm / TRAVEL_FATIGUE_REFERENCE_KM) * TRAVEL_FATIGUE_MAX_PENALTY;
      expectedAwayGoals = Math.max(0.1, expectedAwayGoals * (1 - fatigue));
      expectedHomeGoals = Math.max(0.1, expectedHomeGoals * (1 + fatigue * 0.5));
    }
  }

  // Poisson probability distribution
  const homeDist = poissonDistribution(expectedHomeGoals, MAX_GOALS);
  const awayDist = poissonDistribution(expectedAwayGoals, MAX_GOALS);

  // Calculate win/draw/loss probabilities, with the Dixon-Coles correction applied
  // to the four low-score cells before summing (then renormalized to sum to 1).
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;
  let total = 0;

  for (let hg = 0; hg <= MAX_GOALS; hg++) {
    for (let ag = 0; ag <= MAX_GOALS; ag++) {
      const prob = homeDist[hg] * awayDist[ag] * dixonColesTau(hg, ag, expectedHomeGoals, expectedAwayGoals, DIXON_COLES_RHO);
      total += prob;
      if (hg > ag) homeWinProb += prob;
      else if (hg === ag) drawProb += prob;
      else awayWinProb += prob;
    }
  }

  if (total > 0) {
    homeWinProb /= total;
    drawProb /= total;
    awayWinProb /= total;
  }

  // Match difficulty for target team (assume we'll set this later)
  const strengthDiff = Math.abs(homeStr.overall - awayStr.overall);
  const matchDifficulty = Math.min(100, strengthDiff + 20);

  // Prediction confidence based on strength uncertainty
  const avgUncertainty =
    (homeStr.uncertainty + awayStr.uncertainty) / 2;
  const confidence = Math.max(20, 100 - avgUncertainty * 3);

  return {
    matchId: match.id,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeWinProb: round4(homeWinProb),
    drawProb: round4(drawProb),
    awayWinProb: round4(awayWinProb),
    expectedHomeGoals: round4(expectedHomeGoals),
    expectedAwayGoals: round4(expectedAwayGoals),
    matchDifficulty,
    predictionConfidence: round4(confidence),
    modelVersion: MODEL_VERSION,
  };
}

export function predictAllFutureMatches(
  matches: Match[],
  strengths: Map<string, TeamStrength>,
  teams: Team[],
  league: League,
  formWeight: number = 0.3,
  homeAwayAdjustment: boolean = true,
  travelFatigue: boolean = false,
  weightsConfig?: SimulationConfig
): MatchPrediction[] {
  const future = matches.filter((m) => m.status === 'scheduled');
  const leagueGoalAverages = calculateLeagueGoalAverages(matches);
  const predictions: MatchPrediction[] = [];

  for (const match of future) {
    const pred = predictMatch(match, strengths, teams, league, formWeight, leagueGoalAverages, homeAwayAdjustment, travelFatigue, weightsConfig);
    if (pred) predictions.push(pred);
  }

  return predictions;
}

// P(0,0) is scaled down (or up), P(1,0)/P(0,1) and P(1,1) shift the other way,
// so the joint distribution better matches football's real low-score frequencies.
function dixonColesTau(
  homeGoals: number,
  awayGoals: number,
  lambda: number,
  mu: number,
  rho: number
): number {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambda * mu * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambda * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + mu * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

function poissonDistribution(
  lambda: number,
  maxGoals: number
): number[] {
  const dist: number[] = [];
  for (let k = 0; k <= maxGoals; k++) {
    dist.push(poissonPMF(k, lambda));
  }
  return dist;
}

function poissonPMF(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function blendWithForm(
  baseRating: number,
  formRating: number,
  weight: number
): number {
  return baseRating * (1 - weight) + formRating * weight;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
