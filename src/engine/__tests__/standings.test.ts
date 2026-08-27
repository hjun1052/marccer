import { describe, it, expect } from 'vitest';
import { calculateStandings, getStandingsAtRound, getPositionsBeforeMatch } from '../standings.ts';
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
  homeScore: number,
  awayScore: number,
): Match {
  return {
    id,
    seasonId: 'test-season',
    round,
    date: null,
    homeTeamId: home,
    awayTeamId: away,
    status: 'completed',
    homeScore,
    awayScore,
    source: 'test',
    notes: '',
  };
}

describe('calculateStandings', () => {
  it('handles empty completed matches', () => {
    const standings = calculateStandings(defaultLeague, teams, []);
    expect(standings).toHaveLength(4);
    for (const s of standings) {
      expect(s.points).toBe(0);
      expect(s.matchesPlayed).toBe(0);
    }
  });

  it('computes points correctly for a win', () => {
    const matches = [makeMatch('m1', 1, 'A', 'B', 2, 1)];
    const standings = calculateStandings(defaultLeague, teams, matches);
    const a = standings.find((s) => s.teamId === 'A')!;
    const b = standings.find((s) => s.teamId === 'B')!;
    expect(a.points).toBe(3);
    expect(a.wins).toBe(1);
    expect(b.points).toBe(0);
    expect(b.losses).toBe(1);
  });

  it('computes points correctly for a draw', () => {
    const matches = [makeMatch('m1', 1, 'A', 'B', 1, 1)];
    const standings = calculateStandings(defaultLeague, teams, matches);
    const a = standings.find((s) => s.teamId === 'A')!;
    const b = standings.find((s) => s.teamId === 'B')!;
    expect(a.points).toBe(1);
    expect(a.draws).toBe(1);
    expect(b.points).toBe(1);
    expect(b.draws).toBe(1);
  });

  it('computes goal difference correctly', () => {
    const matches = [makeMatch('m1', 1, 'A', 'B', 3, 1)];
    const standings = calculateStandings(defaultLeague, teams, matches);
    const a = standings.find((s) => s.teamId === 'A')!;
    const b = standings.find((s) => s.teamId === 'B')!;
    expect(a.goalDifference).toBe(2);
    expect(a.goalsFor).toBe(3);
    expect(a.goalsAgainst).toBe(1);
    expect(b.goalDifference).toBe(-2);
  });

  it('orders teams by points descending', () => {
    const matches = [
      makeMatch('m1', 1, 'A', 'B', 3, 0),
      makeMatch('m2', 1, 'C', 'D', 1, 1),
    ];
    const standings = calculateStandings(defaultLeague, teams, matches);
    expect(standings[0].teamId).toBe('A');
    expect(standings[0].points).toBe(3);
    expect(standings[1].teamId).toBe('C');
    expect(standings[1].points).toBe(1);
    expect(standings[2].teamId).toBe('D');
    expect(standings[2].points).toBe(1);
    expect(standings[3].teamId).toBe('B');
  });

  it('sorts by goal difference when points are equal', () => {
    const matches = [
      makeMatch('m1', 1, 'A', 'B', 2, 0),
      makeMatch('m2', 1, 'C', 'D', 1, 0),
    ];
    const standings = calculateStandings(defaultLeague, teams, matches);
    expect(standings[0].teamId).toBe('A');
    expect(standings[0].points).toBe(3);
    expect(standings[0].goalDifference).toBe(2);
    expect(standings[1].teamId).toBe('C');
    expect(standings[1].points).toBe(3);
    expect(standings[1].goalDifference).toBe(1);
    expect(standings[2].teamId).toBe('D');
    expect(standings[2].goalDifference).toBe(-1);
    expect(standings[3].teamId).toBe('B');
    expect(standings[3].goalDifference).toBe(-2);
  });

  it('sorts by goals scored when points and GD are equal', () => {
    const league: League = {
      ...defaultLeague,
      rules: {
        ...defaultLeague.rules,
        tiebreakers: [
          { type: 'goal_difference', priority: 1 },
          { type: 'goals_scored', priority: 2 },
        ],
      },
    };
    const matches = [
      makeMatch('m1', 1, 'A', 'B', 2, 2),
      makeMatch('m2', 1, 'C', 'D', 1, 1),
    ];
    const standings = calculateStandings(league, teams, matches);
    expect(standings[0].teamId).toBe('A');
    expect(standings[0].goalsFor).toBe(2);
    expect(standings[1].teamId).toBe('B');
    expect(standings[1].goalsFor).toBe(2);
    expect(standings[2].teamId).toBe('C');
    expect(standings[2].goalsFor).toBe(1);
    expect(standings[3].teamId).toBe('D');
    expect(standings[3].goalsFor).toBe(1);
  });

  it('computes position and gaps correctly', () => {
    const matches = [
      makeMatch('m1', 1, 'A', 'B', 3, 0),
      makeMatch('m2', 1, 'C', 'D', 0, 0),
      makeMatch('m3', 2, 'A', 'C', 2, 1),
    ];
    const standings = calculateStandings(defaultLeague, teams, matches);
    const a = standings.find((s) => s.teamId === 'A')!;
    expect(a.position).toBe(1);
    expect(a.pointsGapToFirst).toBe(0);
    expect(a.position).toBe(1);
    const b = standings.find((s) => s.teamId === 'B')!;
    expect(b.pointsGapToFirst).toBe(6);
  });

  it('computes gamesRemaining and maxPossiblePoints', () => {
    const matches = [makeMatch('m1', 1, 'A', 'B', 2, 1)];
    const standings = calculateStandings(defaultLeague, teams, matches);
    const a = standings.find((s) => s.teamId === 'A')!;
    expect(a.gamesRemaining).toBe(5);
    expect(a.maxPossiblePoints).toBe(3 + 5 * 3);
  });

  it('processes multiple rounds correctly', () => {
    const matches = [
      makeMatch('m1', 1, 'A', 'B', 2, 0),
      makeMatch('m2', 2, 'A', 'C', 1, 1),
      makeMatch('m3', 3, 'A', 'D', 3, 0),
    ];
    const standings = calculateStandings(defaultLeague, teams, matches);
    const a = standings.find((s) => s.teamId === 'A')!;
    expect(a.matchesPlayed).toBe(3);
    expect(a.wins).toBe(2);
    expect(a.draws).toBe(1);
    expect(a.points).toBe(7);
    expect(a.goalsFor).toBe(6);
    expect(a.goalsAgainst).toBe(1);
  });

  it('computes correct form record', () => {
    const matches = [
      makeMatch('m1', 1, 'A', 'B', 2, 0),
      makeMatch('m2', 2, 'A', 'C', 0, 0),
      makeMatch('m3', 3, 'A', 'D', 1, 2),
    ];
    const standings = calculateStandings(defaultLeague, teams, matches);
    const a = standings.find((s) => s.teamId === 'A')!;
    expect(a.form.last3).toEqual(['W', 'D', 'L']);
    expect(a.form.last5).toEqual(['W', 'D', 'L']);
    expect(a.form.points).toBe(4);
  });
});

describe('getStandingsAtRound', () => {
  it('returns standings after a given round', () => {
    const matches = [
      makeMatch('m1', 1, 'A', 'B', 3, 0),
      makeMatch('m2', 2, 'A', 'C', 1, 1),
      makeMatch('m3', 3, 'A', 'D', 2, 0),
    ];
    const atRound2 = getStandingsAtRound(defaultLeague, teams, matches, 2);
    const a = atRound2.find((s) => s.teamId === 'A')!;
    expect(a.matchesPlayed).toBe(2);
    expect(a.points).toBe(4);
  });

  it('returns empty table when no matches played', () => {
    const matches = [makeMatch('m1', 2, 'A', 'B', 1, 0)];
    const atRound1 = getStandingsAtRound(defaultLeague, teams, matches, 1);
    for (const s of atRound1) {
      expect(s.matchesPlayed).toBe(0);
    }
  });
});

describe('getPositionsBeforeMatch', () => {
  it('returns correct positions before a specific match', () => {
    const matches = [
      makeMatch('m1', 1, 'A', 'B', 3, 0),
      makeMatch('m2', 2, 'A', 'C', 1, 1),
    ];
    const positions = getPositionsBeforeMatch(defaultLeague, teams, matches, 'm2');
    expect(positions).not.toBeNull();
    expect(positions!.homePosition).toBe(1);
    expect(positions!.awayPosition).toBeGreaterThan(0);
  });

  it('returns null for non-existent match', () => {
    const positions = getPositionsBeforeMatch(defaultLeague, teams, [], 'nonexistent');
    expect(positions).toBeNull();
  });
});
