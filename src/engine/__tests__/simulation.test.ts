import { describe, it, expect } from 'vitest';
import { simulateSeason } from '../simulation.ts';
import { calculateTeamStrengths } from '../ratings.ts';
import { createDefaultSimulationConfig } from '../../types/index.ts';
import type { League, Team, Match, SimulationConfig } from '../../types/index.ts';

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

describe('simulateSeason', () => {
  it('returns results for all teams', () => {
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config = createDefaultSimulationConfig();
    const output = simulateSeason(defaultLeague, teams, matches, strengths, config);
    expect(output.results).toHaveLength(4);
  });

  it('title probability sums approximately to 1', () => {
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config: SimulationConfig = {
      ...createDefaultSimulationConfig(),
      count: 5000,
    };
    const output = simulateSeason(defaultLeague, teams, matches, strengths, config);
    const totalTitleProb = output.results.reduce((sum, r) => sum + r.titleProbability, 0);
    expect(totalTitleProb).toBeGreaterThan(0.99);
    expect(totalTitleProb).toBeLessThan(1.01);
  });

  it('produces deterministic results with same seed', () => {
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config: SimulationConfig = {
      count: 100,
      seed: 42,
      assumptions: 'status_quo',
      formWeighting: 0.3,
      homeAwayAdjustment: true,
      includeSecondLeg: false,
      travelFatigue: false,
      kFactor: 32,
      homeAdvantage: 60,
      attackWeight: 0.4,
      defenseWeight: 0.3,
      venueWeight: 0.5,
      regressionPriorGames: 4,
      dixonColesRho: -0.13,
      travelFatigueReferenceKm: 200,
      travelFatigueMaxPenalty: 0.1,
    };
    const output1 = simulateSeason(defaultLeague, teams, matches, strengths, config);
    const output2 = simulateSeason(defaultLeague, teams, matches, strengths, config);
    expect(output1.targetTeamTitleProb).toBe(output2.targetTeamTitleProb);
    for (let i = 0; i < output1.results.length; i++) {
      expect(output1.results[i].titleProbability).toBe(
        output2.results[i].titleProbability,
      );
    }
  });

  it('produces different results with different seeds', () => {
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config1: SimulationConfig = { count: 500, seed: 1, assumptions: 'status_quo', formWeighting: 0.3, homeAwayAdjustment: true, includeSecondLeg: false, travelFatigue: false, kFactor: 32, homeAdvantage: 60, attackWeight: 0.4, defenseWeight: 0.3, venueWeight: 0.5, regressionPriorGames: 4, dixonColesRho: -0.13, travelFatigueReferenceKm: 200, travelFatigueMaxPenalty: 0.1 };
    const config2: SimulationConfig = { count: 500, seed: 999, assumptions: 'status_quo', formWeighting: 0.3, homeAwayAdjustment: true, includeSecondLeg: false, travelFatigue: false, kFactor: 32, homeAdvantage: 60, attackWeight: 0.4, defenseWeight: 0.3, venueWeight: 0.5, regressionPriorGames: 4, dixonColesRho: -0.13, travelFatigueReferenceKm: 200, travelFatigueMaxPenalty: 0.1 };
    const output1 = simulateSeason(defaultLeague, teams, matches, strengths, config1);
    const output2 = simulateSeason(defaultLeague, teams, matches, strengths, config2);
    expect(output1.targetTeamTitleProb).not.toBe(output2.targetTeamTitleProb);
  });

  it('each team has position probabilities that sum to approximately 1', () => {
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config: SimulationConfig = { count: 2000, seed: 42, assumptions: 'status_quo', formWeighting: 0.3, homeAwayAdjustment: true, includeSecondLeg: false, travelFatigue: false, kFactor: 32, homeAdvantage: 60, attackWeight: 0.4, defenseWeight: 0.3, venueWeight: 0.5, regressionPriorGames: 4, dixonColesRho: -0.13, travelFatigueReferenceKm: 200, travelFatigueMaxPenalty: 0.1 };
    const output = simulateSeason(defaultLeague, teams, matches, strengths, config);
    for (const result of output.results) {
      const totalProb = Object.values(result.positionProbabilities).reduce((a, b) => a + b, 0);
      expect(totalProb).toBeGreaterThan(0.99);
      expect(totalProb).toBeLessThan(1.01);
    }
  });

  it('includes target team title probability', () => {
    const strengths = calculateTeamStrengths(teams, matches, defaultLeague);
    const config = createDefaultSimulationConfig();
    const output = simulateSeason(defaultLeague, teams, matches, strengths, config);
    expect(output.targetTeamTitleProb).toBeGreaterThanOrEqual(0);
    expect(output.targetTeamTitleProb).toBeLessThanOrEqual(1);
  });

  it('handles no future matches', () => {
    const completedOnly = matches.filter((m) => m.status === 'completed');
    const strengths = calculateTeamStrengths(teams, completedOnly, defaultLeague);
    const config = createDefaultSimulationConfig();
    const output = simulateSeason(defaultLeague, teams, completedOnly, strengths, config);
    expect(output.results).toHaveLength(4);
    expect(output.targetTeamTitleProb).toBeGreaterThanOrEqual(0);
  });
});
