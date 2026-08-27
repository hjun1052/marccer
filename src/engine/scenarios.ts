// ============================================================
// WHAT-IF SCENARIO ENGINE
// Override-based scenario evaluation, deterministic league state
// ============================================================

import type {
  Match,
  League,
  Team,
  Scenario,
  MatchOverride,
  TeamStrength,
  ScenarioState,
  TeamStanding,
  CriticalMatch,
  MustWinMatch,
  PathAnalysis,
  ControlIndex,
  TitleStatus,
  MatchClassification,
  PathStep,
  RivalDependency,
  SimulationConfig,
} from '../types/index.ts';
import { calculateStandings } from './standings.ts';
import { simulateSeason, simulateWithLockedOutcome } from './simulation.ts';

export function createScenario(
  id: string,
  name: string,
  description: string,
  parentId: string | null = null
): Scenario {
  return {
    id,
    name,
    description,
    baseState: 'reality',
    parentId,
    overrides: [],
    createdAt: new Date().toISOString(),
  };
}

export function addOverride(
  scenario: Scenario,
  matchId: string,
  homeScore: number,
  awayScore: number,
  locked: boolean = true
): Scenario {
  const existing = scenario.overrides.findIndex((o) => o.matchId === matchId);
  const overrides = [...scenario.overrides];

  if (existing >= 0) {
    overrides[existing] = { matchId, homeScore, awayScore, locked };
  } else {
    overrides.push({ matchId, homeScore, awayScore, locked });
  }

  return { ...scenario, overrides };
}

export function removeOverride(
  scenario: Scenario,
  matchId: string
): Scenario {
  return {
    ...scenario,
    overrides: scenario.overrides.filter((o) => o.matchId !== matchId),
  };
}

export function applyScenarioOverrides(
  matches: Match[],
  overrides: MatchOverride[]
): Match[] {
  const overrideMap = new Map<string, MatchOverride>();
  for (const o of overrides) {
    overrideMap.set(o.matchId, o);
  }

  return matches.map((match) => {
    const override = overrideMap.get(match.id);
    if (override) {
      return {
        id: match.id,
        seasonId: match.seasonId,
        round: match.round,
        date: match.date,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        status: 'completed' as const,
        homeScore: override.homeScore,
        awayScore: override.awayScore,
        source: match.source,
        notes: match.notes,
      };
    }
    return match;
  });
}

export function evaluateScenario(
  scenario: Scenario,
  league: League,
  teams: Team[],
  matches: Match[],
  strengths: Map<string, TeamStrength>,
  config: SimulationConfig
): ScenarioState {
  // Apply overrides to matches
  const modifiedMatches = applyScenarioOverrides(matches, scenario.overrides);

  // Calculate standings
  const standings = calculateStandings(league, teams, modifiedMatches);

  // Simulate remaining future matches
  const remainingMatches = modifiedMatches.filter(
    (m) => m.status === 'scheduled'
  );

  let targetTeamTitleProb = 0;
  const finalPositionDist: Record<number, number> = {};
  const titleProbs: Record<string, number> = {};

  if (remainingMatches.length > 0 && strengths.size > 0) {
    const simResult = simulateSeason(
      league,
      teams,
      modifiedMatches,
      strengths,
      config
    );

    targetTeamTitleProb = simResult.targetTeamTitleProb;

    const targetResult = simResult.results.find(
      (r) => r.teamId === league.targetTeamId
    );
    if (targetResult) {
      Object.assign(finalPositionDist, targetResult.positionProbabilities);
    }

    // Build title probs for each team
    for (const r of simResult.results) {
      titleProbs[r.teamId] = r.titleProbability;
    }
  }

  // Title status
  const titleStatus = determineTitleStatus(
    standings,
    league,
    targetTeamTitleProb
  );

  // Must-win analysis
  const mustWinAnalysis = analyzeMustWin(
    league,
    teams,
    modifiedMatches,
    strengths,
    config,
    targetTeamTitleProb
  );

  // Critical matches
  const criticalMatches: CriticalMatch[] = [];

  // Path analysis
  const pathAnalysis = analyzePath(
    league,
    teams,
    modifiedMatches,
    standings,
    strengths,
    config
  );

  // Control index
  const controlIndex = calculateControlIndex(
    standings,
    league,
    targetTeamTitleProb
  );

  return {
    scenario,
    standings,
    matchPredictions: [],
    teamStrengths: Array.from(strengths.values()),
    titleProbabilities: titleProbs,
    targetTeamTitleProb,
    finalPositionDistribution: finalPositionDist,
    criticalMatches,
    mustWinAnalysis,
    pathAnalysis,
    controlIndex,
    titleStatus,
  };
}

function determineTitleStatus(
  standings: TeamStanding[],
  league: League,
  titleProb: number
): TitleStatus {
  const targetStanding = standings.find(
    (s) => s.teamId === league.targetTeamId
  );
  if (!targetStanding) {
    return {
      code: 'ELIMINATED',
      label: 'Eliminated',
      isMathematical: true,
      probability: 0,
      description: 'Target team not found in standings',
    };
  }

  const { position, pointsGapToFirst, gamesRemaining } =
    targetStanding;

  // Check if eliminated mathematically
  const topTeam = standings[0];
  if (topTeam && topTeam.teamId !== league.targetTeamId) {
    const gap = topTeam.points - targetStanding.points;
    if (gap > gamesRemaining * league.rules.winPoints) {
      return {
        code: 'ELIMINATED',
        label: 'Eliminated',
        isMathematical: true,
        probability: titleProb,
        description: `Cannot catch ${topTeam.teamId}: ${gap} point gap with ${gamesRemaining} games left`,
      };
    }
  }

  // Check if clinched
  if (position === 1 && pointsGapToFirst === 0) {
    const secondPlace = standings[1];
    if (secondPlace) {
      const gap = targetStanding.points - secondPlace.points;
      if (gap > secondPlace.gamesRemaining * league.rules.winPoints) {
        return {
          code: 'CLINCHED',
          label: 'Champion',
          isMathematical: true,
          probability: 1,
          description: 'Title mathematically clinched',
        };
      }
    }
  }

  // Probabilistic statuses
  if (titleProb >= 0.9) {
    return {
      code: 'FAVORITE',
      label: 'Strong Favorite',
      isMathematical: false,
      probability: titleProb,
      description: `High probability (${Math.round(titleProb * 100)}%) of winning the title`,
    };
  }

  if (position === 1 && titleProb >= 0.5) {
    return {
      code: 'IN_CONTROL',
      label: 'In Control',
      isMathematical: false,
      probability: titleProb,
      description: 'Currently leading with >50% title probability',
    };
  }

  if (position <= 3 && titleProb >= 0.2) {
    return {
      code: 'PARTIAL_CONTROL',
      label: 'In the Race',
      isMathematical: false,
      probability: titleProb,
      description: `Competitive at ${Math.round(titleProb * 100)}% title probability`,
    };
  }

  return {
    code: 'POSSIBLE',
    label: 'Possible',
    isMathematical: false,
    probability: titleProb,
    description: titleProb > 0
      ? `${Math.round(titleProb * 100)}% title probability`
      : 'Title probability is very low',
  };
}

function analyzeMustWin(
  league: League,
  teams: Team[],
  matches: Match[],
  strengths: Map<string, TeamStrength>,
  config: SimulationConfig,
  _baseTitleProb: number
): MustWinMatch[] {
  const futureMatches = matches.filter(
    (m) =>
      m.status === 'scheduled' &&
      (m.homeTeamId === league.targetTeamId ||
        m.awayTeamId === league.targetTeamId)
  );

  const completedMatches = matches.filter((m) => m.status === 'completed');
  const remainingFuture = matches.filter((m) => m.status === 'scheduled');

  const results: MustWinMatch[] = [];

  for (const match of futureMatches) {
    const reasons: string[] = [];

    const isHome = match.homeTeamId === league.targetTeamId;
    const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
    const opponentName = teams.find((t) => t.id === opponentId)?.name ?? opponentId;

    const oppStrength = strengths.get(opponentId);
    const targetStrength = strengths.get(league.targetTeamId);
    let classification: MatchClassification = 'LOW_IMPACT';

    if (oppStrength && targetStrength) {
      const diff = targetStrength.overall - oppStrength.overall;
      if (diff < -10) {
        classification = 'MUST_WIN';
        reasons.push(`Playing against stronger opponent ${opponentName}`);
        reasons.push('Points from this match are critical');
      } else if (diff < 0) {
        classification = 'WIN_PREFERRED';
        reasons.push(`Opponent ${opponentName} is slightly stronger`);
      } else if (diff < 10) {
        classification = 'WIN_PREFERRED';
        reasons.push(`Evenly matched with ${opponentName}`);
      } else {
        classification = 'DRAW_ACCEPTABLE';
        reasons.push(`Favored against ${opponentName}`);
      }
    } else {
      classification = 'WIN_PREFERRED';
      reasons.push('Insufficient strength data for precise classification');
    }

    let titleProbBeforeWin = 0;
    let titleProbBeforeDraw = 0;
    let titleProbBeforeLoss = 0;

    try {
      const simConfig: SimulationConfig = { ...config, count: Math.min(config.count, 500) };
      titleProbBeforeWin = simulateWithLockedOutcome(
        league, teams, completedMatches, remainingFuture, match, 'home_win',
        strengths, simConfig
      );
      titleProbBeforeDraw = simulateWithLockedOutcome(
        league, teams, completedMatches, remainingFuture, match, 'draw',
        strengths, simConfig
      );
      titleProbBeforeLoss = simulateWithLockedOutcome(
        league, teams, completedMatches, remainingFuture, match, 'away_win',
        strengths, simConfig
      );
    } catch {
      titleProbBeforeWin = 0;
      titleProbBeforeDraw = 0;
      titleProbBeforeLoss = 0;
    }

    results.push({
      matchId: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      round: match.round,
      classification,
      reasons,
      titleProbBeforeWin,
      titleProbBeforeDraw,
      titleProbBeforeLoss,
    });
  }

  return results;
}

function analyzePath(
  league: League,
  teams: Team[],
  matches: Match[],
  standings: TeamStanding[],
  strengths: Map<string, TeamStrength>,
  _config: SimulationConfig
): PathAnalysis {
  const targetStanding = standings.find(
    (s) => s.teamId === league.targetTeamId
  );
  const targetStrength = strengths.get(league.targetTeamId);

  const futureMatches = matches
    .filter(
      (m) =>
        m.status === 'scheduled' &&
        (m.homeTeamId === league.targetTeamId ||
          m.awayTeamId === league.targetTeamId)
    )
    .sort((a, b) => a.round - b.round);

  const easiestPath: PathStep[] = [];
  const safestPath: PathStep[] = [];

  const topTeam = standings[0];
  const gap = topTeam
    ? topTeam.points - (targetStanding?.points ?? 0)
    : 0;
  const remainingRounds = futureMatches.length;
  const requiredPoints = gap + league.rules.winPoints;
  const requiredWins = Math.ceil(requiredPoints / league.rules.winPoints);

  for (const match of futureMatches) {
    const isHome = match.homeTeamId === league.targetTeamId;
    const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
    const opponentName = teams.find((t) => t.id === opponentId)?.name ?? opponentId;
    const oppStrength = strengths.get(opponentId);

    let requirement: string;
    let reqPoints: number;

    if (oppStrength && targetStrength && oppStrength.overall > targetStrength.overall + 5) {
      requirement = isHome ? 'Draw Acceptable' : 'Draw Acceptable';
      reqPoints = 1;
    } else {
      requirement = 'Win Required';
      reqPoints = 3;
    }

    easiestPath.push({
      matchId: match.id,
      round: match.round,
      opponent: opponentName,
      isHome,
      requirement,
      requiredPoints: reqPoints,
    });

    safestPath.push({
      matchId: match.id,
      round: match.round,
      opponent: opponentName,
      isHome,
      requirement: reqPoints >= 3 ? 'Win Required' : 'Win Preferred',
      requiredPoints: Math.max(reqPoints, 3),
    });
  }

  // Rival dependencies
  const rivals = standings
    .filter(
      (s) =>
        s.teamId !== league.targetTeamId &&
        s.points >= (targetStanding?.points ?? 0) - 6
    )
    .slice(0, 3);

  const rivalDependencies: RivalDependency[] = rivals.map((r) => ({
    rivalId: r.teamId,
    rivalName: teams.find((t) => t.id === r.teamId)?.name ?? r.teamId,
    dependencyLevel:
      r.points > (targetStanding?.points ?? 0)
        ? 80
        : r.points === (targetStanding?.points ?? 0)
          ? 60
          : 40,
    description: `${r.gamesRemaining} games remaining, ${r.points} points`,
  }));

  return {
    easiestPath,
    safestPath,
    requiredWins: Math.min(requiredWins, remainingRounds),
    allowedDraws: remainingRounds - requiredWins,
    allowedLosses: 0,
    requiredPoints,
    rivalDependencies,
    confidence: targetStrength
      ? Math.max(20, 100 - targetStrength.uncertainty * 3)
      : 50,
  };
}

function calculateControlIndex(
  standings: TeamStanding[],
  league: League,
  _titleProb: number
): ControlIndex {
  const targetStanding = standings.find(
    (s) => s.teamId === league.targetTeamId
  );
  if (!targetStanding) {
    return { overall: 0, ownResults: 0, rivalDependence: 100 };
  }

  const { gamesRemaining, pointsGapToFirst } = targetStanding;

  // Simple heuristic: more games remaining and smaller gap = more control
  const ownControl = Math.min(
    100,
    Math.max(
      0,
      50 + (gamesRemaining * 5) - (Math.abs(pointsGapToFirst) * 10)
    )
  );

  return {
    overall: Math.round(ownControl),
    ownResults: Math.round(ownControl),
    rivalDependence: Math.round(100 - ownControl),
  };
}
