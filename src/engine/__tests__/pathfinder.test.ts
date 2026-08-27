import { describe, it, expect } from 'vitest';
import { findPaths } from '../pathfinder.ts';
import { calculateStandings } from '../standings.ts';
import { calculateTeamStrengths } from '../ratings.ts';
import { createDefaultSimulationConfig } from '../../types/index.ts';
import type { League, Team, Match } from '../../types/index.ts';

const defaultLeague: League = {
  id: 'test-league',
  name: 'Test League',
  seasonId: 'test-season',
  seasonName: 'Test Season',
  teamIds: ['A', 'B', 'C', 'D'],
  currentRound: 3,
  totalRounds: 6,
  teamsPerRound: 4,
  rules: {
    winPoints: 3,
    drawPoints: 1,
    lossPoints: 0,
    tiebreakers: [
      { type: 'goal_difference', priority: 1 },
      { type: 'goals_scored', priority: 2 },
    ],
  },
  targetTeamId: 'A',
  dataVersion: 'test-v1',
  modelVersion: 'test-model',
  lastDataUpdate: '2026-01-01',
};

const teams: Team[] = [
  { id: 'A', name: 'Alpha', shortName: 'ALP', displayName: 'Alpha FC' },
  { id: 'B', name: 'Beta', shortName: 'BET', displayName: 'Beta FC' },
  { id: 'C', name: 'Charlie', shortName: 'CHL', displayName: 'Charlie FC' },
  { id: 'D', name: 'Delta', shortName: 'DLT', displayName: 'Delta FC' },
];

function makeMatch(
  id: string,
  round: number,
  home: string,
  away: string,
  status: 'completed' | 'scheduled' = 'completed',
  homeScore: number | null = 0,
  awayScore: number | null = 0,
): Match {
  return {
    id,
    seasonId: 'test-season',
    round,
    date: null,
    homeTeamId: home,
    awayTeamId: away,
    status,
    homeScore,
    awayScore,
    source: 'test',
    notes: '',
  };
}

const matches: Match[] = [
  makeMatch('m1', 1, 'A', 'B', 'completed', 2, 1),
  makeMatch('m2', 1, 'C', 'D', 'completed', 1, 1),
  makeMatch('m3', 2, 'A', 'C', 'completed', 3, 0),
  makeMatch('m4', 2, 'B', 'D', 'completed', 0, 2),
  makeMatch('m5', 3, 'A', 'D', 'scheduled'),
  makeMatch('m6', 3, 'B', 'C', 'scheduled'),
];

describe('findPaths', () => {
  it('returns all required fields', () => {
    const standings = calculateStandings(defaultLeague, teams, matches);
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config = createDefaultSimulationConfig();
    const result = findPaths(defaultLeague, teams, standings, matches, strengths, config);

    expect(result).toHaveProperty('easiestPath');
    expect(result).toHaveProperty('safestPath');
    expect(result).toHaveProperty('mustWinMatches');
    expect(result).toHaveProperty('controlIndex');
    expect(result).toHaveProperty('titleStatus');
    expect(result).toHaveProperty('minimumPointsNeeded');
    expect(result).toHaveProperty('mathematicalClimbCondition');
    expect(result).toHaveProperty('rivalDependencies');
  });

  it('easiest path contains target team future matches', () => {
    const standings = calculateStandings(defaultLeague, teams, matches);
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config = createDefaultSimulationConfig();
    const result = findPaths(defaultLeague, teams, standings, matches, strengths, config);

    expect(result.easiestPath.length).toBeGreaterThanOrEqual(1);
    for (const step of result.easiestPath) {
      expect(step).toHaveProperty('matchId');
      expect(step).toHaveProperty('round');
      expect(step).toHaveProperty('opponent');
      expect(step).toHaveProperty('requirement');
      expect(step).toHaveProperty('requiredPoints');
    }
  });

  it('safest path always requires wins', () => {
    const standings = calculateStandings(defaultLeague, teams, matches);
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config = createDefaultSimulationConfig();
    const result = findPaths(defaultLeague, teams, standings, matches, strengths, config);

    for (const step of result.safestPath) {
      expect(step.requiredPoints).toBe(3);
    }
  });

  it('minimumPointsNeeded is positive when behind', () => {
    const standings = calculateStandings(defaultLeague, teams, matches);
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config = createDefaultSimulationConfig();
    const result = findPaths(defaultLeague, teams, standings, matches, strengths, config);

    expect(result.minimumPointsNeeded).toBeGreaterThan(0);
  });

  it('controlIndex sums to 100', () => {
    const standings = calculateStandings(defaultLeague, teams, matches);
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config = createDefaultSimulationConfig();
    const result = findPaths(defaultLeague, teams, standings, matches, strengths, config);

    expect(result.controlIndex.ownResults + result.controlIndex.rivalDependence).toBe(100);
  });

  it('titleStatus has valid code', () => {
    const standings = calculateStandings(defaultLeague, teams, matches);
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config = createDefaultSimulationConfig();
    const result = findPaths(defaultLeague, teams, standings, matches, strengths, config);

    const validCodes = ['ELIMINATED', 'POSSIBLE', 'IN_CONTROL', 'PARTIAL_CONTROL', 'FAVORITE', 'CLINCHED'];
    expect(validCodes).toContain(result.titleStatus.code);
  });

  it('mustWinMatches only include target team matches', () => {
    const standings = calculateStandings(defaultLeague, teams, matches);
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config = createDefaultSimulationConfig();
    const result = findPaths(defaultLeague, teams, standings, matches, strengths, config);

    for (const mw of result.mustWinMatches) {
      const involvesTarget =
        mw.homeTeamId === defaultLeague.targetTeamId ||
        mw.awayTeamId === defaultLeague.targetTeamId;
      expect(involvesTarget).toBe(true);
    }
  });

  it('rivalDependencies reference valid teams', () => {
    const standings = calculateStandings(defaultLeague, teams, matches);
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config = createDefaultSimulationConfig();
    const result = findPaths(defaultLeague, teams, standings, matches, strengths, config);

    for (const rd of result.rivalDependencies) {
      expect(teams.some((t) => t.id === rd.rivalId)).toBe(true);
      expect(rd.dependencyLevel).toBeGreaterThanOrEqual(0);
      expect(rd.dependencyLevel).toBeLessThanOrEqual(100);
    }
  });
});
