// ============================================================
// MONTE CARLO SEASON SIMULATION
// Seeded RNG, configurable assumptions, final position tracking
// ============================================================

import type {
  Match,
  League,
  Team,
  SimulationConfig,
  SimulationResult,
  SimulationOutput,
  TeamStrength,
  CriticalMatch,
  ForecastAssumption,
} from '../types/index.ts';
import { calculateStandings } from './standings.ts';
import { predictMatch } from './predictions.ts';
import { calculateLeagueGoalAverages } from './ratings.ts';

// Seeded PRNG (mulberry32)
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateSeason(
  league: League,
  teams: Team[],
  matches: Match[],
  strengths: Map<string, TeamStrength>,
  config: SimulationConfig
): SimulationOutput {
  const rng = mulberry32(config.seed);

  const completedMatches = matches.filter((m) => m.status === 'completed');
  const futureMatches = matches.filter((m) => m.status === 'scheduled');

  // Results accumulator per team
  const positionCounts = new Map<string, Record<number, number>>();
  const pointsSums = new Map<string, number>();
  const gdSums = new Map<string, number>();

  for (const team of teams) {
    positionCounts.set(team.id, {});
    pointsSums.set(team.id, 0);
    gdSums.set(team.id, 0);
  }

  const adjustedStrengths = adjustStrengthsForAssumption(
    strengths,
    config.assumptions,
    config.formWeighting,
    teams
  );

  // Predictions don't depend on the RNG, so compute each future match's
  // probabilities once instead of re-deriving them on every simulation.
  const leagueGoalAverages = calculateLeagueGoalAverages(matches);
  const predictionsByMatch = new Map(
    futureMatches
      .map((match) => [match.id, predictMatch(match, adjustedStrengths, teams, league, config.formWeighting, leagueGoalAverages, config.homeAwayAdjustment, config.travelFatigue, config)] as const)
      .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => entry[1] !== null)
  );

  for (let sim = 0; sim < config.count; sim++) {
    // Clone completed matches
    const simMatches: Match[] = completedMatches.map((m) => ({ ...m }));

    // Simulate each future match
    for (const match of futureMatches) {
      const pred = predictionsByMatch.get(match.id);
      if (!pred) continue;

      // Random outcome based on probabilities
      const r = rng();
      let homeGoals: number;
      let awayGoals: number;

      if (r < pred.homeWinProb) {
        // Home win: generate score
        homeGoals = weightedRandom(
          [1, 2, 3, 4],
          [0.4, 0.35, 0.15, 0.1],
          rng
        );
        awayGoals = weightedRandom(
          [0, 1, 2],
          [0.5, 0.35, 0.15],
          rng
        );
        if (awayGoals >= homeGoals) awayGoals = homeGoals - 1;
      } else if (r < pred.homeWinProb + pred.drawProb) {
        // Draw
        const goals = weightedRandom(
          [0, 1, 2, 3],
          [0.25, 0.4, 0.25, 0.1],
          rng
        );
        homeGoals = goals;
        awayGoals = goals;
      } else {
        // Away win
        awayGoals = weightedRandom(
          [1, 2, 3, 4],
          [0.4, 0.35, 0.15, 0.1],
          rng
        );
        homeGoals = weightedRandom(
          [0, 1, 2],
          [0.5, 0.35, 0.15],
          rng
        );
        if (homeGoals >= awayGoals) homeGoals = awayGoals - 1;
      }

      simMatches.push({
        ...match,
        status: 'completed',
        homeScore: Math.max(0, homeGoals),
        awayScore: Math.max(0, awayGoals),
      });
    }

    // Calculate final standings
    const finalStandings = calculateStandings(league, teams, simMatches);

    for (const standing of finalStandings) {
      const counts = positionCounts.get(standing.teamId)!;
      counts[standing.position] = (counts[standing.position] || 0) + 1;
      pointsSums.set(
        standing.teamId,
        (pointsSums.get(standing.teamId) ?? 0) + standing.points
      );
      gdSums.set(
        standing.teamId,
        (gdSums.get(standing.teamId) ?? 0) + standing.goalDifference
      );
    }
  }

  // Build results
  const results: SimulationResult[] = [];
  const targetTitleCount =
    positionCounts.get(league.targetTeamId)?.[1] ?? 0;
  const targetTeamTitleProb = targetTitleCount / config.count;

  for (const team of teams) {
    const counts = positionCounts.get(team.id) ?? {};
    const totalTeams = teams.length;
    const positionProbabilities: Record<number, number> = {};

    let posSum = 0;
    let posWeightedSum = 0;
    let minPos = totalTeams;
    let maxPos = 1;

    for (let pos = 1; pos <= totalTeams; pos++) {
      const count = counts[pos] ?? 0;
      const prob = count / config.count;
      positionProbabilities[pos] = prob;
      posSum += prob;
      posWeightedSum += pos * prob;
      if (count > 0) {
        minPos = Math.min(minPos, pos);
        maxPos = Math.max(maxPos, pos);
      }
    }

    const titleProb = counts[1] ?? 0;
    const top2Prob = (counts[1] ?? 0) + (counts[2] ?? 0);
    const top4Prob =
      (counts[1] ?? 0) + (counts[2] ?? 0) + (counts[3] ?? 0) + (counts[4] ?? 0);

    const avgPoints = (pointsSums.get(team.id) ?? 0) / config.count;
    const avgGD = (gdSums.get(team.id) ?? 0) / config.count;

    results.push({
      teamId: team.id,
      positionProbabilities,
      titleProbability: titleProb / config.count,
      top2Probability: top2Prob / config.count,
      top4Probability: top4Prob / config.count,
      avgFinishingPosition: Math.round(posWeightedSum * 10) / 10,
      expectedFinalPoints: Math.round(avgPoints),
      expectedFinalGD: Math.round(avgGD),
      minPosition: minPos,
      maxPosition: maxPos,
    });
  }

  // Basic critical match calculation
  const criticalMatches = calculateCriticalMatches(
    league,
    teams,
    matches,
    strengths,
    config,
    targetTeamTitleProb
  );

  return {
    config,
    results,
    targetTeamTitleProb,
    targetTeamTitleProbability: targetTeamTitleProb,
    criticalMatches,
    generatedAt: new Date().toISOString(),
  };
}

export function adjustStrengthsForAssumption(
  strengths: Map<string, TeamStrength>,
  assumption: ForecastAssumption,
  formWeight: number,
  _teams: Team[]
): Map<string, TeamStrength> {
  const adjusted = new Map<string, TeamStrength>();

  for (const [teamId, str] of strengths) {
    let formInfluence: number;
    let regression: number;

    switch (assumption) {
      case 'recent_form':
        formInfluence = 0.6;
        regression = 0;
        break;
      case 'long_term':
        formInfluence = 0.1;
        regression = 0.1;
        break;
      case 'mean_reversion':
        formInfluence = 0.2;
        regression = 0.2;
        break;
      case 'hot_form':
        formInfluence = 0.5;
        regression = -0.05;
        break;
      case 'cold_form':
        formInfluence = 0.4;
        regression = 0.15;
        break;
      default:
        formInfluence = formWeight;
        regression = 0;
    }

    const blendedOverall = str.overall * (1 - formInfluence) + str.formRating * formInfluence + regression * 50;

    adjusted.set(teamId, {
      ...str,
      overall: blendedOverall,
      formRating: str.formRating + regression * 30,
    });
  }

  return adjusted;
}

function calculateCriticalMatches(
  league: League,
  teams: Team[],
  matches: Match[],
  strengths: Map<string, TeamStrength>,
  config: SimulationConfig,
  baseTitleProb: number
): CriticalMatch[] {
  const futureMatches = matches.filter((m) => m.status === 'scheduled');
  const completedMatches = matches.filter((m) => m.status === 'completed');
  const criticals: CriticalMatch[] = [];
  const leagueGoalAverages = calculateLeagueGoalAverages(matches);

  // Use a reduced sub-simulation count for critical match analysis
  // to keep computation bounded while still providing meaningful estimates
  const subSimCount = Math.min(500, Math.max(200, Math.floor(config.count / 10)));

  // Identify top contenders (teams with >5% title probability from main sim)
  const titleRaceTeamIds = new Set<string>();
  titleRaceTeamIds.add(league.targetTeamId);

  // Classify future matches into target-team and non-target-team
  for (const match of futureMatches) {
    const pred = predictMatch(match, strengths, teams, league, config.formWeighting, leagueGoalAverages, config.homeAwayAdjustment, config.travelFatigue, config);
    if (!pred) continue;

    const isTargetMatch =
      match.homeTeamId === league.targetTeamId ||
      match.awayTeamId === league.targetTeamId;

    const homeName = teams.find((t) => t.id === match.homeTeamId)?.name ?? match.homeTeamId;
    const awayName = teams.find((t) => t.id === match.awayTeamId)?.name ?? match.awayTeamId;

    let titleProbIfHomeWin: number;
    let titleProbIfDraw: number;
    let titleProbIfAwayWin: number;
    let classification: CriticalMatch['classification'];

    if (isTargetMatch) {
      // For target-team matches: simulate each outcome to get real title probabilities
      const winResult = simulateWithLockedOutcome(
        league, teams, completedMatches, futureMatches, match,
        'home_win', strengths, { ...config, count: subSimCount }
      );
      const drawResult = simulateWithLockedOutcome(
        league, teams, completedMatches, futureMatches, match,
        'draw', strengths, { ...config, count: subSimCount }
      );
      const lossResult = simulateWithLockedOutcome(
        league, teams, completedMatches, futureMatches, match,
        'away_win', strengths, { ...config, count: subSimCount }
      );

      // Determine which outcome is "home win" from target team perspective
      const isTargetHome = match.homeTeamId === league.targetTeamId;
      if (isTargetHome) {
        titleProbIfHomeWin = winResult;
        titleProbIfDraw = drawResult;
        titleProbIfAwayWin = lossResult;
      } else {
        titleProbIfHomeWin = lossResult;
        titleProbIfDraw = drawResult;
        titleProbIfAwayWin = winResult;
      }

      // Impact is the max swing from any single outcome
      const maxProb = Math.max(titleProbIfHomeWin, titleProbIfDraw, titleProbIfAwayWin);
      const minProb = Math.min(titleProbIfHomeWin, titleProbIfDraw, titleProbIfAwayWin);
      const impactScore = (maxProb - minProb) * 100;

      if (impactScore > 10 || minProb < baseTitleProb * 0.5) classification = 'CRITICAL';
      else if (impactScore > 5 || minProb < baseTitleProb * 0.7) classification = 'HIGH';
      else if (impactScore > 2) classification = 'MEDIUM';
      else classification = 'LOW';

      criticals.push({
        matchId: match.id,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        round: match.round,
        impactScore: Math.round(impactScore * 10) / 10,
        titleImpact: impactScore,
        classification,
        titleProbIfHomeWin: Math.round(titleProbIfHomeWin * 10000) / 10000,
        titleProbIfDraw: Math.round(titleProbIfDraw * 10000) / 10000,
        titleProbIfAwayWin: Math.round(titleProbIfAwayWin * 10000) / 10000,
        explanation: `${homeName} vs ${awayName} (R${match.round})`,
      });
    } else {
      // For non-target matches: estimate impact based on prediction uncertainty
      // and whether it involves title contenders
      const homeIsContender = titleRaceTeamIds.has(match.homeTeamId);
      const awayIsContender = titleRaceTeamIds.has(match.awayTeamId);
      const contenderMultiplier = (homeIsContender || awayIsContender) ? 2.0 : 0.5;

      // Use prediction imbalance as a proxy for match importance
      const imbalance = Math.abs(pred.homeWinProb - pred.awayWinProb);
      const drawUncertainty = 1 - Math.abs(pred.homeWinProb - pred.awayWinProb);
      const baseImpact = (imbalance * 0.6 + drawUncertainty * 0.4) * 100;
      const impactScore = baseImpact * contenderMultiplier;

      // Estimate title probs: less precise but directionally correct
      // Home win benefits home team, away win benefits away team
      titleProbIfHomeWin = baseTitleProb;
      titleProbIfDraw = baseTitleProb;
      titleProbIfAwayWin = baseTitleProb;

      if (homeIsContender && !awayIsContender) {
        // Home win benefits a contender → worse for target if not home
        titleProbIfHomeWin = baseTitleProb - impactScore * 0.002;
        titleProbIfAwayWin = baseTitleProb + impactScore * 0.001;
      } else if (!homeIsContender && awayIsContender) {
        titleProbIfHomeWin = baseTitleProb + impactScore * 0.001;
        titleProbIfAwayWin = baseTitleProb - impactScore * 0.002;
      } else if (homeIsContender && awayIsContender) {
        // Between two contenders: any result shakes up the race
        titleProbIfHomeWin = baseTitleProb - impactScore * 0.001;
        titleProbIfDraw = baseTitleProb + impactScore * 0.001;
        titleProbIfAwayWin = baseTitleProb - impactScore * 0.001;
      }

      if (impactScore > 15) classification = 'HIGH';
      else if (impactScore > 5) classification = 'MEDIUM';
      else classification = 'LOW';

      criticals.push({
        matchId: match.id,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        round: match.round,
        impactScore: Math.round(impactScore * 10) / 10,
        titleImpact: impactScore,
        classification,
        titleProbIfHomeWin: Math.round(titleProbIfHomeWin * 10000) / 10000,
        titleProbIfDraw: Math.round(titleProbIfDraw * 10000) / 10000,
        titleProbIfAwayWin: Math.round(titleProbIfAwayWin * 10000) / 10000,
        explanation: `${homeName} vs ${awayName} (R${match.round})`,
      });
    }
  }

  criticals.sort((a, b) => b.impactScore - a.impactScore);
  return criticals;
}

/**
 * Simulate the remainder of the season with one match forced to a specific outcome.
 * Returns the target team's title probability from the sub-simulation.
 */
export function simulateWithLockedOutcome(
  league: League,
  teams: Team[],
  completedMatches: Match[],
  futureMatches: Match[],
  lockedMatch: Match,
  outcome: 'home_win' | 'draw' | 'away_win',
  strengths: Map<string, TeamStrength>,
  config: SimulationConfig
): number {
  return simulateWithLockedOutcomes(
    league,
    teams,
    completedMatches,
    futureMatches,
    [{ match: lockedMatch, outcome }],
    strengths,
    config
  );
}

/**
 * Same as simulateWithLockedOutcome, but forces multiple matches to specific
 * outcomes at once (e.g. a whole set of the target's remaining results).
 */
export function simulateWithLockedOutcomes(
  league: League,
  teams: Team[],
  completedMatches: Match[],
  futureMatches: Match[],
  lockedMatches: Array<{ match: Match; outcome: 'home_win' | 'draw' | 'away_win' }>,
  strengths: Map<string, TeamStrength>,
  config: SimulationConfig
): number {
  const seedOffset = lockedMatches.reduce(
    (acc, { match, outcome }) =>
      acc + match.round * 1000 + (outcome === 'draw' ? 1 : outcome === 'home_win' ? 2 : 3),
    0
  );
  const rng = mulberry32(config.seed + seedOffset);

  // Build base match set: completed + locked matches + remaining future
  const baseMatches: Match[] = [...completedMatches];
  const adjustedStrengths = adjustStrengthsForAssumption(strengths, config.assumptions, config.formWeighting, teams);
  const leagueGoalAverages = calculateLeagueGoalAverages(completedMatches);

  const lockedIds = new Set(lockedMatches.map(({ match }) => match.id));
  for (const { match, outcome } of lockedMatches) {
    let lockedHomeGoals: number;
    let lockedAwayGoals: number;
    if (outcome === 'home_win') {
      lockedHomeGoals = 2;
      lockedAwayGoals = 0;
    } else if (outcome === 'draw') {
      lockedHomeGoals = 1;
      lockedAwayGoals = 1;
    } else {
      lockedHomeGoals = 0;
      lockedAwayGoals = 2;
    }
    baseMatches.push({
      ...match,
      status: 'completed',
      homeScore: lockedHomeGoals,
      awayScore: lockedAwayGoals,
    });
  }

  // Remaining future matches (excluding the locked ones)
  const remainingFuture = futureMatches.filter((m) => !lockedIds.has(m.id));

  // Predictions don't depend on the RNG, so compute each match's probabilities
  // once instead of re-deriving them on every simulation.
  const predictionsByMatch = new Map(
    remainingFuture
      .map((match) => [match.id, predictMatch(match, adjustedStrengths, teams, league, config.formWeighting, leagueGoalAverages, config.homeAwayAdjustment, config.travelFatigue, config)] as const)
      .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] => entry[1] !== null)
  );

  const positionCounts = new Map<string, Record<number, number>>();
  for (const team of teams) {
    positionCounts.set(team.id, {});
  }

  for (let sim = 0; sim < config.count; sim++) {
    const simMatches: Match[] = [...baseMatches];

    for (const match of remainingFuture) {
      const pred = predictionsByMatch.get(match.id);
      if (!pred) continue;

      const r = rng();
      let homeGoals: number;
      let awayGoals: number;

      if (r < pred.homeWinProb) {
        homeGoals = weightedRandom([1, 2, 3, 4], [0.4, 0.35, 0.15, 0.1], rng);
        awayGoals = weightedRandom([0, 1, 2], [0.5, 0.35, 0.15], rng);
        if (awayGoals >= homeGoals) awayGoals = homeGoals - 1;
      } else if (r < pred.homeWinProb + pred.drawProb) {
        const goals = weightedRandom([0, 1, 2, 3], [0.25, 0.4, 0.25, 0.1], rng);
        homeGoals = goals;
        awayGoals = goals;
      } else {
        awayGoals = weightedRandom([1, 2, 3, 4], [0.4, 0.35, 0.15, 0.1], rng);
        homeGoals = weightedRandom([0, 1, 2], [0.5, 0.35, 0.15], rng);
        if (homeGoals >= awayGoals) homeGoals = awayGoals - 1;
      }

      simMatches.push({
        ...match,
        status: 'completed',
        homeScore: Math.max(0, homeGoals),
        awayScore: Math.max(0, awayGoals),
      });
    }

    const finalStandings = calculateStandings(league, teams, simMatches);
    // Just need the target team's position
    for (const standing of finalStandings) {
      if (standing.teamId === league.targetTeamId) {
        const teamCounts = positionCounts.get(league.targetTeamId)!;
        teamCounts[standing.position] = (teamCounts[standing.position] || 0) + 1;
      }
    }
  }

  const targetCounts = positionCounts.get(league.targetTeamId) ?? {};
  return (targetCounts[1] ?? 0) / config.count;
}

function weightedRandom(
  values: number[],
  weights: number[],
  rng: () => number
): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < values.length; i++) {
    r -= weights[i];
    if (r <= 0) return values[i];
  }
  return values[values.length - 1];
}
