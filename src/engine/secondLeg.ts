// ============================================================
// SECOND-LEG PROJECTION
// The league is actually a home-and-away double round-robin, but the
// governing body has only published fixtures through the first leg. The
// return-leg pairings are still certain (everyone plays everyone twice, once
// at each venue) even though exact rounds/dates aren't published yet. This
// synthesizes those return-leg matches so simulations can optionally account
// for the full season instead of stopping at the last published round.
// ============================================================

import type { League, Match } from '../types/index.ts';

export interface ProjectionContext {
  league: League;
  matches: Match[];
}

export function withSecondLeg(league: League, matches: Match[], include: boolean): ProjectionContext {
  if (!include) return { league, matches };

  const firstLegRounds = league.totalRounds;
  const secondLeg: Match[] = matches
    .filter((m) => m.status !== 'cancelled')
    .map((m) => ({
      id: `${m.id}-L2`,
      seasonId: m.seasonId,
      round: m.round + firstLegRounds,
      date: null,
      // Return leg: same pairing, venue swapped.
      homeTeamId: m.awayTeamId,
      awayTeamId: m.homeTeamId,
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      source: 'projected-second-leg',
      notes: 'Projected return fixture — round not yet published by the league.',
    }));

  return {
    league: { ...league, totalRounds: firstLegRounds * 2 },
    matches: [...matches, ...secondLeg],
  };
}
