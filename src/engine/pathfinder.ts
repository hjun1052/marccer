// ============================================================
// PATH FINDER
// Easiest path, safest path, MUST-WIN analysis, title clinching
// ============================================================

import type {
  Match,
  League,
  Team,
  TeamStanding,
  TeamStrength,
  SimulationConfig,
  MustWinMatch,
  PathStep,
  RivalDependency,
  ControlIndex,
  TitleStatus,
  MatchClassification,
} from '../types/index.ts';
import { simulateWithLockedOutcome } from './simulation.ts';

export interface PathFinderResult {
  easiestPath: PathStep[];
  safestPath: PathStep[];
  mustWinMatches: MustWinMatch[];
  controlIndex: ControlIndex;
  titleStatus: TitleStatus;
  minimumPointsNeeded: number;
  mathematicalClimbCondition: string;
  clinchEarliestRound: number | null;
  rivalDependencies: RivalDependency[];
}

export function findPaths(
  league: League,
  teams: Team[],
  standings: TeamStanding[],
  matches: Match[],
  strengths: Map<string, TeamStrength>,
  _config: SimulationConfig
): PathFinderResult {
  const targetStanding = standings.find(
    (s) => s.teamId === league.targetTeamId
  );
  const topStanding = standings[0];

  const futureTargetMatches = matches
    .filter(
      (m) =>
        m.status === 'scheduled' &&
        (m.homeTeamId === league.targetTeamId ||
          m.awayTeamId === league.targetTeamId)
    )
    .sort((a, b) => a.round - b.round);

  const gap = topStanding
    ? topStanding.points - (targetStanding?.points ?? 0)
    : 0;

  const targetGamesRemaining = targetStanding?.gamesRemaining ?? 0;
  const minPointsNeeded = gap + league.rules.winPoints;

  // Easiest path
  const easiestPath = buildPath(
    futureTargetMatches,
    teams,
    strengths,
    league.targetTeamId,
    'easiest'
  );

  // Safest path (always win when possible)
  const safestPath = buildPath(
    futureTargetMatches,
    teams,
    strengths,
    league.targetTeamId,
    'safest'
  );

  // MUST-WIN analysis
  const mustWinMatches = analyzeMustWinMatches(
    league,
    teams,
    matches,
    strengths,
    _config,
    targetStanding
  );

  // Control index
  const controlIndex = computeControlIndex(
    targetStanding,
    standings,
    league,
    targetGamesRemaining
  );

  // Title status
  const titleStatus = computeTitleStatus(
    standings,
    league,
    targetStanding,
    topStanding
  );

  // Mathematical climb
  const mathematicalClimbCondition = gap > targetGamesRemaining * league.rules.winPoints
    ? `IMPOSSIBLE: Need ${minPointsNeeded} points but only ${targetGamesRemaining * league.rules.winPoints} available`
    : `Need at least ${minPointsNeeded} points from ${targetGamesRemaining} remaining games`;

  // Earliest clinch round
  const clinchEarliestRound = findEarliestClinchRound(
    futureTargetMatches,
    standings,
    league,
    targetStanding
  );

  const rivalDependencies = computeRivalDependencies(
    standings,
    league,
    targetStanding,
    matches,
    teams
  );

  return {
    easiestPath,
    safestPath,
    mustWinMatches,
    controlIndex,
    titleStatus,
    minimumPointsNeeded: minPointsNeeded,
    mathematicalClimbCondition,
    clinchEarliestRound,
    rivalDependencies,
  };
}

function buildPath(
  futureMatches: Match[],
  teams: Team[],
  strengths: Map<string, TeamStrength>,
  targetTeamId: string,
  strategy: 'easiest' | 'safest'
): PathStep[] {
  const path: PathStep[] = [];

  for (const match of futureMatches) {
    const isHome = match.homeTeamId === targetTeamId;
    const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
    const opponentName = teams.find((t) => t.id === opponentId)?.name ?? opponentId;

    const targetStr = strengths.get(targetTeamId);
    const oppStr = strengths.get(opponentId);

    let requirement: string;
    let reqPoints: number;

    if (!targetStr || !oppStr) {
      requirement = strategy === 'easiest' ? 'Draw Acceptable' : 'Win Required';
      reqPoints = strategy === 'easiest' ? 1 : 3;
    } else {
      const diff = targetStr.overall - oppStr.overall;

      if (strategy === 'easiest') {
        if (diff > 10) {
          requirement = 'Win Required';
          reqPoints = 3;
        } else if (diff > -5) {
          requirement = 'Win Preferred, Draw Acceptable';
          reqPoints = 1;
        } else {
          requirement = 'Draw Acceptable';
          reqPoints = 1;
        }
      } else {
        // Safest: minimize risk
        if (diff > 5) {
          requirement = 'Win Required';
          reqPoints = 3;
        } else {
          requirement = 'Win Required';
          reqPoints = 3;
        }
      }
    }

    path.push({
      matchId: match.id,
      round: match.round,
      opponent: opponentName,
      isHome,
      requirement,
      requiredPoints: reqPoints,
    });
  }

  return path;
}

function analyzeMustWinMatches(
  league: League,
  teams: Team[],
  matches: Match[],
  strengths: Map<string, TeamStrength>,
  config: SimulationConfig,
  _targetStanding?: TeamStanding
): MustWinMatch[] {
  const completedMatches = matches.filter((m) => m.status === 'completed');
  const futureMatches = matches.filter((m) => m.status === 'scheduled');
  const futureTargetMatches = futureMatches.filter(
    (m) =>
      (m.homeTeamId === league.targetTeamId ||
        m.awayTeamId === league.targetTeamId)
  );

  const mustWins: MustWinMatch[] = [];

  for (const match of futureTargetMatches) {
    const isHome = match.homeTeamId === league.targetTeamId;
    const opponentId = isHome ? match.awayTeamId : match.homeTeamId;
    const opponentName = teams.find((t) => t.id === opponentId)?.name ?? opponentId;
    const targetStr = strengths.get(league.targetTeamId);
    const oppStr = strengths.get(opponentId);

    let classification: MatchClassification;
    const reasons: string[] = [];

    if (!targetStr || !oppStr) {
      classification = 'WIN_PREFERRED';
      reasons.push('Insufficient data for precise classification');
    } else {
      const diff = targetStr.overall - oppStr.overall;
      if (diff < -15) {
        classification = 'MUST_WIN';
        reasons.push(`Significantly weaker than ${opponentName}`);
        reasons.push('Every point is critical in this position');
        if (!isHome) reasons.push('Away disadvantage makes this harder');
      } else if (diff < -5) {
        classification = 'WIN_PREFERRED';
        reasons.push(`Slightly weaker than ${opponentName}`);
        reasons.push('Win strongly preferred to maintain title chase');
      } else if (diff < 5) {
        classification = 'WIN_PREFERRED';
        reasons.push(`Evenly matched with ${opponentName}`);
        reasons.push('A win would provide crucial advantage');
      } else if (diff < 15) {
        classification = 'DRAW_ACCEPTABLE';
        reasons.push(`Favored against ${opponentName}`);
        reasons.push('Draw is acceptable but win is preferred');
      } else {
        classification = 'DONT_LOSE';
        reasons.push(`Strongly favored against ${opponentName}`);
        reasons.push('Anything less than a draw would be damaging');
      }
    }

    let titleProbBeforeWin = 0;
    let titleProbBeforeDraw = 0;
    let titleProbBeforeLoss = 0;

    try {
      const baseConfig: SimulationConfig = { ...config, count: Math.min(500, config.count) };
      titleProbBeforeWin = simulateWithLockedOutcome(
        league, teams, completedMatches, futureMatches, match, 'home_win',
        strengths, baseConfig
      );
      titleProbBeforeDraw = simulateWithLockedOutcome(
        league, teams, completedMatches, futureMatches, match, 'draw',
        strengths, baseConfig
      );
      titleProbBeforeLoss = simulateWithLockedOutcome(
        league, teams, completedMatches, futureMatches, match, 'away_win',
        strengths, baseConfig
      );
    } catch {
      titleProbBeforeWin = 0;
      titleProbBeforeDraw = 0;
      titleProbBeforeLoss = 0;
    }

    mustWins.push({
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

  return mustWins;
}

function computeControlIndex(
  targetStanding: TeamStanding | undefined,
  _standings: TeamStanding[],
  league: League,
  gamesRemaining: number
): ControlIndex {
  if (!targetStanding) {
    return { overall: 0, ownResults: 0, rivalDependence: 100 };
  }

  const gap = targetStanding.pointsGapToFirst;
  const maxOwnPoints = gamesRemaining * league.rules.winPoints;

  const ownControl = Math.min(
    100,
    Math.max(0, (maxOwnPoints / Math.max(gap + maxOwnPoints, 1)) * 100)
  );

  return {
    overall: Math.round(ownControl),
    ownResults: Math.round(ownControl),
    rivalDependence: Math.round(100 - ownControl),
  };
}

function computeTitleStatus(
  standings: TeamStanding[],
  league: League,
  targetStanding?: TeamStanding,
  topStanding?: TeamStanding
): TitleStatus {
  if (!targetStanding || !topStanding) {
    return {
      code: 'ELIMINATED',
      label: 'Not Found',
      isMathematical: false,
      probability: 0,
      description: 'Target team not found in standings',
    };
  }

  const gap = topStanding.points - targetStanding.points;
  const { gamesRemaining } = targetStanding;

  if (gap > gamesRemaining * league.rules.winPoints) {
    return {
      code: 'ELIMINATED',
      label: 'Eliminated',
      isMathematical: true,
      probability: 0,
      description: `Cannot catch the leader: ${gap} point gap`,
    };
  }

  if (targetStanding.position === 1) {
    if (gap === 0 && topStanding.teamId === league.targetTeamId) {
      const second = standings[1];
      if (second && targetStanding.points - second.points > second.gamesRemaining * league.rules.winPoints) {
        return {
          code: 'CLINCHED',
          label: 'Champion',
          isMathematical: true,
          probability: 1,
          description: 'Title mathematically clinched',
        };
      }
      return {
        code: 'IN_CONTROL',
        label: 'In Control',
        isMathematical: false,
        probability: 0.6,
        description: 'Leading the league',
      };
    }
  }

  if (targetStanding.position <= 2 && gap <= 6) {
    return {
      code: 'PARTIAL_CONTROL',
      label: 'In the Race',
      isMathematical: false,
      probability: 0.3,
      description: `${gap} points behind with ${gamesRemaining} to play`,
    };
  }

  return {
    code: 'POSSIBLE',
    label: 'Possible',
    isMathematical: false,
    probability: 0.1,
    description: `${gap} points behind, needs results to go their way`,
  };
}

function findEarliestClinchRound(
  futureMatches: Match[],
  standings: TeamStanding[],
  league: League,
  targetStanding?: TeamStanding
): number | null {
  if (!targetStanding || targetStanding.position !== 1) return null;

  const second = standings[1];
  if (!second) return null;

  const gap = targetStanding.points - second.points;
  const secondRemaining = second.gamesRemaining;

  // Simple approximation: clinch when gap > remaining * max_points for rival
  // This is conservative
  if (gap <= 0) return null;

  let cumulativeGap = gap;
  for (let i = 0; i < futureMatches.length; i++) {
    cumulativeGap += league.rules.winPoints;
    if (cumulativeGap > (secondRemaining - i - 1) * league.rules.winPoints) {
      return futureMatches[i].round;
    }
  }

  return null;
}

function computeRivalDependencies(
  standings: TeamStanding[],
  league: League,
  targetStanding: TeamStanding | undefined,
  matches: Match[],
  teams: Team[]
): RivalDependency[] {
  if (!targetStanding) return [];

  const targetPoints = targetStanding.points;
  const futureMatches = matches.filter(m => m.status === 'scheduled');

  return standings
    .filter(s => s.teamId !== league.targetTeamId && s.position <= 5)
    .map(standing => {
      const rivalMatches = futureMatches.filter(
        m => m.homeTeamId === standing.teamId || m.awayTeamId === standing.teamId
      );
      const pointsBehind = targetPoints - standing.points;

      let dependencyLevel: number;
      let description: string;

      if (pointsBehind <= 3 && rivalMatches.length >= 3) {
        dependencyLevel = 80 + Math.min(15, (3 - pointsBehind) * 5);
        description = `Within 3 points, needs rival to drop points in ${rivalMatches.length} remaining matches`;
      } else if (pointsBehind <= 6 && rivalMatches.length >= 2) {
        dependencyLevel = 50 + Math.min(25, (6 - pointsBehind) * 5);
        description = `${pointsBehind} points behind, moderate influence required`;
      } else if (pointsBehind > 0) {
        dependencyLevel = Math.max(10, 40 - pointsBehind * 3);
        description = `${pointsBehind} points behind, limited dependency`;
      } else {
        dependencyLevel = 5;
        description = `Currently ahead of this rival`;
      }

      // Look up team name from teams array
      const rivalTeam = teams.find(t => t.id === standing.teamId);

      return {
        rivalId: standing.teamId,
        rivalName: rivalTeam?.name ?? standing.teamId,
        dependencyLevel: Math.round(dependencyLevel),
        description,
      };
    })
    .sort((a, b) => b.dependencyLevel - a.dependencyLevel);
}

// ============================================================
// NEXT-ROUND ROOTING GUIDE
// For the target team's rivals' matches next round (not the target's own
// match), which result actually helps the target team, and by how much.
// ============================================================

export interface RootingRecommendation {
  matchId: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  recommendedOutcome: 'home_win' | 'draw' | 'away_win';
  titleProbIfHomeWin: number;
  titleProbIfDraw: number;
  titleProbIfAwayWin: number;
  bestProb: number;
  impact: number; // bestProb - worstProb: how much this result matters
}

export function analyzeNextRoundRooting(
  league: League,
  teams: Team[],
  matches: Match[],
  strengths: Map<string, TeamStrength>,
  config: SimulationConfig,
  round?: number
): RootingRecommendation[] {
  const scheduled = matches.filter((m) => m.status === 'scheduled');
  if (scheduled.length === 0) return [];

  const targetRound = round ?? Math.min(...scheduled.map((m) => m.round));
  const roundMatches = scheduled.filter(
    (m) =>
      m.round === targetRound &&
      m.homeTeamId !== league.targetTeamId &&
      m.awayTeamId !== league.targetTeamId
  );
  if (roundMatches.length === 0) return [];

  const completedMatches = matches.filter((m) => m.status === 'completed');
  // Locked-outcome sub-simulations are inherently a 3x-per-match cost; cap the
  // count like the rest of the "what does this single match change" analyses.
  const subConfig: SimulationConfig = { ...config, count: Math.min(config.count, 500) };

  const recommendations = roundMatches.map((match) => {
    const titleProbIfHomeWin = simulateWithLockedOutcome(
      league, teams, completedMatches, scheduled, match, 'home_win', strengths, subConfig
    );
    const titleProbIfDraw = simulateWithLockedOutcome(
      league, teams, completedMatches, scheduled, match, 'draw', strengths, subConfig
    );
    const titleProbIfAwayWin = simulateWithLockedOutcome(
      league, teams, completedMatches, scheduled, match, 'away_win', strengths, subConfig
    );

    const outcomes: Array<['home_win' | 'draw' | 'away_win', number]> = [
      ['home_win', titleProbIfHomeWin],
      ['draw', titleProbIfDraw],
      ['away_win', titleProbIfAwayWin],
    ];
    outcomes.sort((a, b) => b[1] - a[1]);
    const [recommendedOutcome, bestProb] = outcomes[0];
    const worstProb = outcomes[outcomes.length - 1][1];

    return {
      matchId: match.id,
      round: match.round,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      recommendedOutcome,
      titleProbIfHomeWin,
      titleProbIfDraw,
      titleProbIfAwayWin,
      bestProb,
      impact: bestProb - worstProb,
    };
  });

  return recommendations.sort((a, b) => b.impact - a.impact);
}

// ============================================================
// FULL-SEASON MATCH RECOMMENDATIONS (Path Finder+)
// Same locked-outcome analysis as the rooting guide, but swept across every
// remaining scheduled match this season, target's own matches included.
// ============================================================

export interface MatchRecommendation extends RootingRecommendation {
  involvesTarget: boolean;
}

export function analyzeAllMatchRecommendations(
  league: League,
  teams: Team[],
  matches: Match[],
  strengths: Map<string, TeamStrength>,
  config: SimulationConfig
): MatchRecommendation[] {
  const scheduled = matches.filter((m) => m.status === 'scheduled');
  if (scheduled.length === 0) return [];

  const completedMatches = matches.filter((m) => m.status === 'completed');
  // Sweeping every remaining match is 3 locked sub-simulations each; keep the
  // per-simulation count modest so a full-season pass stays under a second.
  const subConfig: SimulationConfig = { ...config, count: Math.min(config.count, 200) };

  const recommendations = scheduled.map((match) => {
    const titleProbIfHomeWin = simulateWithLockedOutcome(
      league, teams, completedMatches, scheduled, match, 'home_win', strengths, subConfig
    );
    const titleProbIfDraw = simulateWithLockedOutcome(
      league, teams, completedMatches, scheduled, match, 'draw', strengths, subConfig
    );
    const titleProbIfAwayWin = simulateWithLockedOutcome(
      league, teams, completedMatches, scheduled, match, 'away_win', strengths, subConfig
    );

    const outcomes: Array<['home_win' | 'draw' | 'away_win', number]> = [
      ['home_win', titleProbIfHomeWin],
      ['draw', titleProbIfDraw],
      ['away_win', titleProbIfAwayWin],
    ];
    outcomes.sort((a, b) => b[1] - a[1]);
    const [recommendedOutcome, bestProb] = outcomes[0];
    const worstProb = outcomes[outcomes.length - 1][1];

    return {
      matchId: match.id,
      round: match.round,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      recommendedOutcome,
      titleProbIfHomeWin,
      titleProbIfDraw,
      titleProbIfAwayWin,
      bestProb,
      impact: bestProb - worstProb,
      involvesTarget:
        match.homeTeamId === league.targetTeamId || match.awayTeamId === league.targetTeamId,
    };
  });

  return recommendations.sort((a, b) => b.impact - a.impact);
}
