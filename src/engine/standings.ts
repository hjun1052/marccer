// ============================================================
// STANDINGS ENGINE
// Deterministic league table calculation from match data
// ============================================================

import type {
  Match,
  League,
  TeamStanding,
  FormRecord,
  ResultType,
  Team,
} from '../types/index.ts';

interface RawTeamStats {
  teamId: string;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  homeWins: number;
  homeDraws: number;
  homeLosses: number;
  awayWins: number;
  awayDraws: number;
  awayLosses: number;
  recentResults: ResultType[];
  h2h: Record<string, { points: number; gf: number; ga: number }>;
}

function createEmptyStats(teamId: string): RawTeamStats {
  return {
    teamId,
    matchesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    homeWins: 0,
    homeDraws: 0,
    homeLosses: 0,
    awayWins: 0,
    awayDraws: 0,
    awayLosses: 0,
    recentResults: [],
    h2h: {},
  };
}

function getResult(homeGoals: number, awayGoals: number): ResultType {
  if (homeGoals > awayGoals) return 'W';
  if (homeGoals === awayGoals) return 'D';
  return 'L';
}

export function calculateStandings(
  league: League,
  teams: Team[],
  matches: Match[],
  overrides?: Map<string, { homeScore: number; awayScore: number }>
): TeamStanding[] {
  const rules = league.rules;
  const statsMap = new Map<string, RawTeamStats>();

  for (const team of teams) {
    statsMap.set(team.id, createEmptyStats(team.id));
  }

  // Process all completed matches in round order
  const completed = matches
    .filter((m) => m.status === 'completed')
    .sort((a, b) => a.round - b.round);

  for (const match of completed) {
    const override = overrides?.get(match.id);
    const homeScore = override?.homeScore ?? match.homeScore;
    const awayScore = override?.awayScore ?? match.awayScore;

    if (homeScore === null || awayScore === null) continue;

    const home = statsMap.get(match.homeTeamId);
    const away = statsMap.get(match.awayTeamId);
    if (!home || !away) continue;

    // Update basic stats
    home.matchesPlayed++;
    away.matchesPlayed++;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    const homeResult = getResult(homeScore, awayScore);
    const awayResult = homeResult === 'W' ? 'L' : homeResult === 'L' ? 'W' : 'D';

    // Points
    if (homeResult === 'W') {
      home.wins++;
      home.points += rules.winPoints;
      away.losses++;
      away.points += rules.lossPoints;
    } else if (homeResult === 'D') {
      home.draws++;
      home.points += rules.drawPoints;
      away.draws++;
      away.points += rules.drawPoints;
    } else {
      home.losses++;
      home.points += rules.lossPoints;
      away.wins++;
      away.points += rules.winPoints;
    }

    // Home/Away splits
    if (homeResult === 'W') home.homeWins++;
    else if (homeResult === 'D') home.homeDraws++;
    else home.homeLosses++;

    if (awayResult === 'W') away.awayWins++;
    else if (awayResult === 'D') away.awayDraws++;
    else away.awayLosses++;

    // Recent results (up to 10)
    home.recentResults.push(homeResult);
    if (home.recentResults.length > 10) home.recentResults.shift();
    away.recentResults.push(awayResult);
    if (away.recentResults.length > 10) away.recentResults.shift();

    // Head-to-head
    if (!home.h2h[away.teamId]) {
      home.h2h[away.teamId] = { points: 0, gf: 0, ga: 0 };
    }
    if (!away.h2h[home.teamId]) {
      away.h2h[home.teamId] = { points: 0, gf: 0, ga: 0 };
    }

    if (homeResult === 'W') {
      home.h2h[away.teamId].points += rules.winPoints;
      away.h2h[home.teamId].points += rules.lossPoints;
    } else if (homeResult === 'D') {
      home.h2h[away.teamId].points += rules.drawPoints;
      away.h2h[home.teamId].points += rules.drawPoints;
    } else {
      home.h2h[away.teamId].points += rules.lossPoints;
      away.h2h[home.teamId].points += rules.winPoints;
    }
    home.h2h[away.teamId].gf += homeScore;
    home.h2h[away.teamId].ga += awayScore;
    away.h2h[home.teamId].gf += awayScore;
    away.h2h[home.teamId].ga += homeScore;
  }

  // Build standings array
  const standings: TeamStanding[] = [];
  const totalMatches = league.totalRounds;

  for (const team of teams) {
    const s = statsMap.get(team.id)!;
    const gamesRemaining = totalMatches - s.matchesPlayed;
    standings.push({
      teamId: team.id,
      position: 0,
      previousPosition: null,
      matchesPlayed: s.matchesPlayed,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      goalsFor: s.goalsFor,
      goalsAgainst: s.goalsAgainst,
      goalDifference: s.goalsFor - s.goalsAgainst,
      points: s.points,
      gamesRemaining,
      maxPossiblePoints: s.points + gamesRemaining * rules.winPoints,
      minPossibleFinalPoints: s.points + gamesRemaining * rules.lossPoints,
      pointsGapToFirst: 0,
      pointsGapToTarget: 0,
      positionChange: null,
      form: buildForm(s.recentResults),
    });
  }

  // Sort using league rules
  sortStandings(standings, league, statsMap);

  // Assign positions and gaps
  const maxPoints = standings.length > 0 ? standings[0].points : 0;
  const targetStanding = standings.find(
    (s) => s.teamId === league.targetTeamId
  );

  for (let i = 0; i < standings.length; i++) {
    standings[i].position = i + 1;
    standings[i].pointsGapToFirst = maxPoints - standings[i].points;
    standings[i].pointsGapToTarget = targetStanding
      ? targetStanding.points - standings[i].points
      : 0;
  }

  return standings;
}

function buildForm(results: ResultType[]): FormRecord {
  const last3 = results.slice(-3);
  const last5 = results.slice(-5);
  const last10 = results.slice(-10);

  const pointsFromResults = (r: ResultType[]): number =>
    r.reduce((sum, res) => {
      if (res === 'W') return sum + 3;
      if (res === 'D') return sum + 1;
      return sum;
    }, 0);

  return {
    last3,
    last5,
    last10,
    points: pointsFromResults(last5),
  };
}

function sortStandings(
  standings: TeamStanding[],
  league: League,
  statsMap: Map<string, RawTeamStats>
): void {
  const { tiebreakers } = league.rules;
  standings.sort((a, b) => {
    // Primary: points
    if (b.points !== a.points) return b.points - a.points;

    // Apply tiebreakers in priority order
    for (const tb of tiebreakers) {
      const result = applyTiebreaker(a, b, tb.type, statsMap);
      if (result !== 0) return result;
    }

    // Final fallback: alphabetical
    return a.teamId.localeCompare(b.teamId);
  });
}

function applyTiebreaker(
  a: TeamStanding,
  b: TeamStanding,
  type: string,
  statsMap: Map<string, RawTeamStats>
): number {
  switch (type) {
    case 'goal_difference':
      return b.goalDifference - a.goalDifference;
    case 'goals_scored':
      return b.goalsFor - a.goalsFor;
    case 'head_to_head_points':
    case 'head_to_head_goal_difference':
    case 'head_to_head_goals_scored': {
      const aVsB = statsMap.get(a.teamId)?.h2h[b.teamId];
      const bVsA = statsMap.get(b.teamId)?.h2h[a.teamId];
      if (!aVsB || !bVsA) return 0;
      if (type === 'head_to_head_points') return bVsA.points - aVsB.points;
      if (type === 'head_to_head_goal_difference') {
        return (bVsA.gf - bVsA.ga) - (aVsB.gf - aVsB.ga);
      }
      return bVsA.gf - aVsB.gf;
    }
    default:
      return 0;
  }
}

// --- Helper: get standings after a specific round ---

export function getStandingsAtRound(
  league: League,
  teams: Team[],
  matches: Match[],
  round: number
): TeamStanding[] {
  const filtered = matches.filter(
    (m) => m.status === 'completed' && m.round <= round
  );
  return calculateStandings(league, teams, filtered);
}

// --- Helper: compute position before a specific match ---

export function getPositionsBeforeMatch(
  league: League,
  teams: Team[],
  matches: Match[],
  matchId: string
): { homePosition: number; awayPosition: number } | null {
  const targetMatch = matches.find((m) => m.id === matchId);
  if (!targetMatch) return null;

  const beforeMatches = matches.filter(
    (m) =>
      m.status === 'completed' &&
      m.round < targetMatch.round
  );

  const standings = calculateStandings(league, teams, beforeMatches);
  const homeStanding = standings.find(
    (s) => s.teamId === targetMatch.homeTeamId
  );
  const awayStanding = standings.find(
    (s) => s.teamId === targetMatch.awayTeamId
  );

  return {
    homePosition: homeStanding?.position ?? 0,
    awayPosition: awayStanding?.position ?? 0,
  };
}
