// ============================================================
// TEAM STRENGTH RATING ENGINE
// Elo-like opponent-adjusted rating with home/away and form
// ============================================================

import type {
  Match,
  Team,
  TeamStrength,
  League,
  StrengthRecord,
  SimulationConfig,
} from '../types/index.ts';

const BASE_RATING = 1000;
// Fallback weights, used only when no config is supplied (e.g. tests). Real
// callers should pass the current SimulationConfig so the MODEL WEIGHTS tab's
// adjustments actually take effect.
const DEFAULT_K_FACTOR = 32;
const DEFAULT_HOME_ADVANTAGE = 60;
const DEFAULT_ATTACK_WEIGHT = 0.4;
const DEFAULT_DEFENSE_WEIGHT = 0.3;
const DEFAULT_VENUE_WEIGHT = 0.5;
const DEFAULT_REGRESSION_PRIOR_GAMES = 4;

export function calculateTeamStrengths(
  teams: Team[],
  matches: Match[],
  _league: League,
  config?: SimulationConfig
): Map<string, TeamStrength> {
  const K_FACTOR = config?.kFactor ?? DEFAULT_K_FACTOR;
  const HOME_ADVANTAGE = config?.homeAdvantage ?? DEFAULT_HOME_ADVANTAGE;
  const ATTACK_WEIGHT = config?.attackWeight ?? DEFAULT_ATTACK_WEIGHT;
  const DEFENSE_WEIGHT = config?.defenseWeight ?? DEFAULT_DEFENSE_WEIGHT;
  const VENUE_WEIGHT = config?.venueWeight ?? DEFAULT_VENUE_WEIGHT;
  // Empirical-Bayes shrinkage: with this many "prior" games of neutral (BASE_RATING)
  // evidence baked in, a team's rating regresses toward the mean until real results
  // accumulate — keeps a 2-game hot streak from reading as a settled rating.
  const REGRESSION_PRIOR_GAMES = config?.regressionPriorGames ?? DEFAULT_REGRESSION_PRIOR_GAMES;

  const ratings = new Map<string, number>();
  const attackRatings = new Map<string, number>();
  const defenseRatings = new Map<string, number>();
  const homeRatings = new Map<string, number>();
  const awayRatings = new Map<string, number>();

  for (const team of teams) {
    ratings.set(team.id, BASE_RATING);
    attackRatings.set(team.id, BASE_RATING);
    defenseRatings.set(team.id, BASE_RATING);
    homeRatings.set(team.id, BASE_RATING);
    awayRatings.set(team.id, BASE_RATING);
  }

  const sorted = matches
    .filter((m) => m.status === 'completed')
    .sort((a, b) => a.round - b.round);

  const vsTop: Record<string, StrengthRecord> = {};
  const vsMiddle: Record<string, StrengthRecord> = {};
  const vsBottom: Record<string, StrengthRecord> = {};
  const gameCounts = new Map<string, number>();
  const homeGameCounts = new Map<string, number>();
  const awayGameCounts = new Map<string, number>();
  const formHistory = new Map<string, number[]>();
  const avgGoalsPerLeague = calculateAvgGoals(sorted);

  for (const team of teams) {
    gameCounts.set(team.id, 0);
    homeGameCounts.set(team.id, 0);
    awayGameCounts.set(team.id, 0);
    formHistory.set(team.id, []);
    vsTop[team.id] = { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
    vsMiddle[team.id] = { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
    vsBottom[team.id] = { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
  }

  for (const match of sorted) {
    if (match.homeScore === null || match.awayScore === null) continue;

    const homeRating = (ratings.get(match.homeTeamId) ?? BASE_RATING) + HOME_ADVANTAGE;
    const awayRating = ratings.get(match.awayTeamId) ?? BASE_RATING;

    const expectedHome = sigmoid((homeRating - awayRating) / 400);
    const expectedAway = 1 - expectedHome;

    const homeScore = match.homeScore;
    const awayScore = match.awayScore;
    const homeGoals = match.homeScore;
    const awayGoals = match.awayScore;

    const actualHome = homeScore > awayScore ? 1 : homeScore === awayScore ? 0.5 : 0;
    const actualAway = 1 - actualHome;

    // Update overall ratings
    const homeId = match.homeTeamId;
    const awayId = match.awayTeamId;

    const currentHome = ratings.get(homeId) ?? BASE_RATING;
    const currentAway = ratings.get(awayId) ?? BASE_RATING;

    ratings.set(homeId, currentHome + K_FACTOR * (actualHome - expectedHome));
    ratings.set(awayId, currentAway + K_FACTOR * (actualAway - expectedAway));

    // Update attack/defense
    const homeAttack = attackRatings.get(homeId) ?? BASE_RATING;
    const homeDef = defenseRatings.get(homeId) ?? BASE_RATING;
    const awayAttack = attackRatings.get(awayId) ?? BASE_RATING;
    const awayDef = defenseRatings.get(awayId) ?? BASE_RATING;

    attackRatings.set(homeId, homeAttack + K_FACTOR * ATTACK_WEIGHT * ((homeGoals / Math.max(avgGoalsPerLeague, 0.5)) - expectedHome));
    defenseRatings.set(homeId, homeDef + K_FACTOR * DEFENSE_WEIGHT * (expectedAway - (awayGoals / Math.max(avgGoalsPerLeague, 0.5))));
    attackRatings.set(awayId, awayAttack + K_FACTOR * ATTACK_WEIGHT * ((awayGoals / Math.max(avgGoalsPerLeague, 0.5)) - expectedAway));
    defenseRatings.set(awayId, awayDef + K_FACTOR * DEFENSE_WEIGHT * (expectedHome - (homeGoals / Math.max(avgGoalsPerLeague, 0.5))));

    // Home/Away specific
    homeRatings.set(homeId, (homeRatings.get(homeId) ?? BASE_RATING) + K_FACTOR * VENUE_WEIGHT * (actualHome - expectedHome));
    awayRatings.set(awayId, (awayRatings.get(awayId) ?? BASE_RATING) + K_FACTOR * VENUE_WEIGHT * (actualAway - expectedAway));

    // Game counts
    gameCounts.set(homeId, (gameCounts.get(homeId) ?? 0) + 1);
    gameCounts.set(awayId, (gameCounts.get(awayId) ?? 0) + 1);
    homeGameCounts.set(homeId, (homeGameCounts.get(homeId) ?? 0) + 1);
    awayGameCounts.set(awayId, (awayGameCounts.get(awayId) ?? 0) + 1);

    // Form history
    const homeResult = actualHome === 1 ? 3 : actualHome === 0.5 ? 1 : 0;
    const awayResult = actualAway === 1 ? 3 : actualAway === 0.5 ? 1 : 0;
    formHistory.get(homeId)?.push(homeResult);
    formHistory.get(awayId)?.push(awayResult);

    // Classify opponents for vsTop/vsMiddle/vsBottom
    const homePercentile = getPercentile(ratings, awayId, teams);
    const awayPercentile = getPercentile(ratings, homeId, teams);

    if (homePercentile > 66) {
      updateRecord(vsTop[homeId], 'home', actualHome, homeGoals, awayGoals);
    } else if (homePercentile > 33) {
      updateRecord(vsMiddle[homeId], 'home', actualHome, homeGoals, awayGoals);
    } else {
      updateRecord(vsBottom[homeId], 'home', actualHome, homeGoals, awayGoals);
    }

    if (awayPercentile > 66) {
      updateRecord(vsTop[awayId], 'away', actualAway, awayGoals, homeGoals);
    } else if (awayPercentile > 33) {
      updateRecord(vsMiddle[awayId], 'away', actualAway, awayGoals, homeGoals);
    } else {
      updateRecord(vsBottom[awayId], 'away', actualAway, awayGoals, homeGoals);
    }

    // Schedule difficulty (average opponent rating)
  }

  // Build final TeamStrength objects
  const result = new Map<string, TeamStrength>();

  for (const team of teams) {
    const games = gameCounts.get(team.id) ?? 0;
    const shrink = games / (games + REGRESSION_PRIOR_GAMES);
    const regress = (raw: number) => BASE_RATING + (raw - BASE_RATING) * shrink;

    // homeStrength/awayStrength are each built from only that venue's matches, so
    // they regress toward the mean using that venue's own game count — a team with
    // plenty of away games but only one home game shouldn't get a settled homeStrength.
    const homeGames = homeGameCounts.get(team.id) ?? 0;
    const awayGames = awayGameCounts.get(team.id) ?? 0;
    const homeShrink = homeGames / (homeGames + REGRESSION_PRIOR_GAMES);
    const awayShrink = awayGames / (awayGames + REGRESSION_PRIOR_GAMES);

    const raw = regress(ratings.get(team.id) ?? BASE_RATING);
    const overall = normalizeRating(raw);
    const attack = normalizeRating(regress(attackRatings.get(team.id) ?? BASE_RATING));
    const defense = normalizeRating(regress(defenseRatings.get(team.id) ?? BASE_RATING));
    const home = normalizeRating(BASE_RATING + ((homeRatings.get(team.id) ?? BASE_RATING) - BASE_RATING) * homeShrink);
    const away = normalizeRating(BASE_RATING + ((awayRatings.get(team.id) ?? BASE_RATING) - BASE_RATING) * awayShrink);

    const history = formHistory.get(team.id) ?? [];
    const recentForm = history.slice(-5);
    const formAvg = recentForm.length > 0
      ? recentForm.reduce((a, b) => a + b, 0) / recentForm.length
      : 1;
    const formRating = (formAvg / 3) * 100;

    const uncertainty = games < 5 ? 20 : games < 10 ? 12 : games < 15 ? 7 : 3;

    const avgOppStrength = calculateScheduleDifficulty(team.id, sorted, ratings, teams);

    result.set(team.id, {
      teamId: team.id,
      overall,
      attack,
      defense,
      homeStrength: home,
      awayStrength: away,
      formRating,
      uncertainty,
      scheduleDifficulty: avgOppStrength,
      ratingHistory: history.slice(-10),
      gamesAnalyzed: games,
      vsTopTeams: vsTop[team.id],
      vsMiddleTeams: vsMiddle[team.id],
      vsBottomTeams: vsBottom[team.id],
    });
  }

  return result;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function normalizeRating(raw: number): number {
  return Math.round(((raw - 700) / 600) * 100 * 10) / 10;
}

function calculateAvgGoals(matches: Match[]): number {
  let totalGoals = 0;
  let count = 0;
  for (const m of matches) {
    if (m.homeScore !== null && m.awayScore !== null) {
      totalGoals += m.homeScore + m.awayScore;
      count++;
    }
  }
  return count > 0 ? totalGoals / count : 2.5;
}

export interface LeagueGoalAverages {
  avgHomeGoals: number;
  avgAwayGoals: number;
}

// Real per-venue scoring baseline from this season's completed matches, so the
// prediction model's home advantage comes from actual data instead of a guessed constant.
export function calculateLeagueGoalAverages(matches: Match[]): LeagueGoalAverages {
  let homeGoals = 0;
  let awayGoals = 0;
  let count = 0;
  for (const m of matches) {
    if (m.status === 'completed' && m.homeScore !== null && m.awayScore !== null) {
      homeGoals += m.homeScore;
      awayGoals += m.awayScore;
      count++;
    }
  }
  return count > 0
    ? { avgHomeGoals: homeGoals / count, avgAwayGoals: awayGoals / count }
    : { avgHomeGoals: 1.5, avgAwayGoals: 1.15 };
}

function getPercentile(
  ratings: Map<string, number>,
  teamId: string,
  teams: Team[]
): number {
  const rating = ratings.get(teamId) ?? BASE_RATING;
  let below = 0;
  for (const t of teams) {
    if ((ratings.get(t.id) ?? BASE_RATING) < rating) below++;
  }
  return (below / teams.length) * 100;
}

function updateRecord(
  record: StrengthRecord,
  _venue: 'home' | 'away',
  actual: number,
  goalsFor: number,
  goalsAgainst: number
): void {
  if (actual === 1) record.wins++;
  else if (actual === 0.5) record.draws++;
  else record.losses++;
  record.goalsFor += goalsFor;
  record.goalsAgainst += goalsAgainst;
}

function calculateScheduleDifficulty(
  teamId: string,
  matches: Match[],
  ratings: Map<string, number>,
  _teams: Team[]
): number {
  const opponents = new Set<string>();
  for (const m of matches) {
    if (m.homeTeamId === teamId) opponents.add(m.awayTeamId);
    if (m.awayTeamId === teamId) opponents.add(m.homeTeamId);
  }
  if (opponents.size === 0) return 50;

  let totalOppRating = 0;
  for (const oppId of opponents) {
    totalOppRating += normalizeRating(ratings.get(oppId) ?? BASE_RATING);
  }
  return totalOppRating / opponents.size;
}
