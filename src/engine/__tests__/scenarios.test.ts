import { describe, it, expect } from 'vitest';
import {
  createScenario,
  addOverride,
  removeOverride,
  applyScenarioOverrides,
  evaluateScenario,
} from '../scenarios.ts';
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
  makeMatch('m5', 3, 'A', 'D', 'scheduled', null, null),
  makeMatch('m6', 3, 'B', 'C', 'scheduled', null, null),
];

describe('createScenario', () => {
  it('creates a scenario with default values', () => {
    const scenario = createScenario('s1', 'Test', 'A test scenario');
    expect(scenario.id).toBe('s1');
    expect(scenario.name).toBe('Test');
    expect(scenario.description).toBe('A test scenario');
    expect(scenario.overrides).toEqual([]);
    expect(scenario.baseState).toBe('reality');
  });

  it('supports parent scenarios', () => {
    createScenario('p1', 'Parent', 'Parent scenario');
    const child = createScenario('c1', 'Child', 'Child scenario', 'p1');
    expect(child.parentId).toBe('p1');
  });
});

describe('addOverride', () => {
  it('adds an override to a scenario', () => {
    const scenario = createScenario('s1', 'Test', 'Desc');
    const updated = addOverride(scenario, 'm5', 2, 0);
    expect(updated.overrides).toHaveLength(1);
    expect(updated.overrides[0].matchId).toBe('m5');
    expect(updated.overrides[0].homeScore).toBe(2);
    expect(updated.overrides[0].awayScore).toBe(0);
    expect(updated.overrides[0].locked).toBe(true);
  });

  it('replaces existing override for same match', () => {
    let scenario = createScenario('s1', 'Test', 'Desc');
    scenario = addOverride(scenario, 'm5', 2, 0);
    scenario = addOverride(scenario, 'm5', 3, 1);
    expect(scenario.overrides).toHaveLength(1);
    expect(scenario.overrides[0].homeScore).toBe(3);
    expect(scenario.overrides[0].awayScore).toBe(1);
  });

  it('does not mutate the original scenario', () => {
    const scenario = createScenario('s1', 'Test', 'Desc');
    addOverride(scenario, 'm5', 2, 0);
    expect(scenario.overrides).toEqual([]);
  });
});

describe('removeOverride', () => {
  it('removes an override', () => {
    let scenario = createScenario('s1', 'Test', 'Desc');
    scenario = addOverride(scenario, 'm5', 2, 0);
    scenario = addOverride(scenario, 'm6', 1, 1);
    scenario = removeOverride(scenario, 'm5');
    expect(scenario.overrides).toHaveLength(1);
    expect(scenario.overrides[0].matchId).toBe('m6');
  });

  it('does nothing if matchId not found', () => {
    let scenario = createScenario('s1', 'Test', 'Desc');
    scenario = addOverride(scenario, 'm5', 2, 0);
    scenario = removeOverride(scenario, 'nonexistent');
    expect(scenario.overrides).toHaveLength(1);
  });
});

describe('applyScenarioOverrides', () => {
  it('applies overrides to scheduled matches', () => {
    const overrides = [{ matchId: 'm5', homeScore: 2, awayScore: 0, locked: true }];
    const modified = applyScenarioOverrides(matches, overrides);
    const m5 = modified.find((m) => m.id === 'm5')!;
    expect(m5.status).toBe('completed');
    expect(m5.homeScore).toBe(2);
    expect(m5.awayScore).toBe(0);
  });

  it('does not affect unoverridden matches', () => {
    const overrides = [{ matchId: 'm5', homeScore: 2, awayScore: 0, locked: true }];
    const modified = applyScenarioOverrides(matches, overrides);
    const m1 = modified.find((m) => m.id === 'm1')!;
    expect(m1.homeScore).toBe(2);
    expect(m1.awayScore).toBe(1);
    expect(m1.status).toBe('completed');
  });

  it('returns original matches when no overrides', () => {
    const modified = applyScenarioOverrides(matches, []);
    expect(modified).toHaveLength(matches.length);
  });
});

describe('evaluateScenario', () => {
  it('produces a complete scenario state', () => {
    const scenario = createScenario('s1', 'Test', 'Desc');
    const config = createDefaultSimulationConfig();
    const state = evaluateScenario(scenario, defaultLeague, teams, matches, new Map(), config);
    expect(state).toHaveProperty('standings');
    expect(state).toHaveProperty('titleProbabilities');
    expect(state).toHaveProperty('targetTeamTitleProb');
    expect(state).toHaveProperty('finalPositionDistribution');
    expect(state).toHaveProperty('titleStatus');
    expect(state.standings.length).toBe(4);
  });

  it('standings reflect overrides', () => {
    let scenario = createScenario('s1', 'Override', 'Force A to lose');
    scenario = addOverride(scenario, 'm5', 0, 3);
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config = createDefaultSimulationConfig();
    const state = evaluateScenario(scenario, defaultLeague, teams, matches, strengths, config);
    const aStanding = state.standings.find((s) => s.teamId === 'A');
    expect(aStanding).toBeDefined();
    expect(aStanding!.matchesPlayed).toBe(3);
  });

  it('scenario does not mutate original matches', () => {
    const originalM5 = matches.find((m) => m.id === 'm5')!;
    let scenario = createScenario('s1', 'Test', 'Desc');
    scenario = addOverride(scenario, 'm5', 5, 5);
    const config = createDefaultSimulationConfig();
    evaluateScenario(scenario, defaultLeague, teams, matches, new Map(), config);
    expect(originalM5.status).toBe('scheduled');
    expect(originalM5.homeScore).toBeNull();
  });
});
