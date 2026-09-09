// ============================================================
// SCHEDULE INITIALIZER — generates a full-season data/matches.json from
// data/teams.json using the standard round-robin circle method (handles an
// odd team count with a bye each round).
//
// Run this ONCE when setting up a new league (before any results exist) —
// it refuses to overwrite an existing data/matches.json unless --force is
// passed, since scripts/scrape.ts only ever updates rows this generates,
// never creates them.
//
// Usage:
//   npm run init-schedule                # single round-robin
//   npm run init-schedule -- --double    # home-and-away double round-robin
//   npm run init-schedule -- --force     # overwrite an existing matches.json
// ============================================================

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const TEAMS_PATH = path.join(DATA_DIR, 'teams.json');
const MATCHES_PATH = path.join(DATA_DIR, 'matches.json');
const LEAGUE_PATH = path.join(DATA_DIR, 'league.json');

interface Team {
  id: string;
}

interface Fixture {
  round: number;
  homeTeamId: string;
  awayTeamId: string;
}

// Circle method: fix teams[0], rotate the rest one position each round. A
// null slot (for an odd team count) marks that round's bye.
function roundRobinRounds(teamIds: string[]): (string | null)[][] {
  const ids: (string | null)[] = [...teamIds];
  if (ids.length % 2 !== 0) ids.push(null);

  const n = ids.length;
  const rounds: (string | null)[][] = [];
  const arr = [...ids];

  for (let r = 0; r < n - 1; r++) {
    const pairs: (string | null)[] = [];
    for (let i = 0; i < n / 2; i++) {
      pairs.push(arr[i], arr[n - 1 - i]);
    }
    rounds.push(pairs);
    // Rotate everyone except the fixed first element.
    arr.splice(1, 0, arr.pop()!);
  }
  return rounds;
}

function buildFixtures(teamIds: string[], double: boolean): Fixture[] {
  const rounds = roundRobinRounds(teamIds);
  const fixtures: Fixture[] = [];

  rounds.forEach((pairs, roundIndex) => {
    for (let i = 0; i < pairs.length; i += 2) {
      const a = pairs[i];
      const b = pairs[i + 1];
      if (a === null || b === null) continue; // bye
      // Alternate home/away by round parity so it's not always the same
      // team at home for a given pairing across the whole schedule.
      const [home, away] = roundIndex % 2 === 0 ? [a, b] : [b, a];
      fixtures.push({ round: roundIndex + 1, homeTeamId: home, awayTeamId: away });
    }
  });

  if (double) {
    const roundCount = rounds.length;
    for (const f of fixtures.slice()) {
      fixtures.push({ round: f.round + roundCount, homeTeamId: f.awayTeamId, awayTeamId: f.homeTeamId });
    }
  }

  return fixtures;
}

function main() {
  const args = process.argv.slice(2);
  const double = args.includes('--double');
  const force = args.includes('--force');

  if (existsSync(MATCHES_PATH) && !force) {
    const existing = JSON.parse(readFileSync(MATCHES_PATH, 'utf-8'));
    if (Array.isArray(existing) && existing.length > 0) {
      console.error(`data/matches.json already has ${existing.length} row(s) — pass --force to overwrite.`);
      process.exit(1);
    }
  }

  const teams: Team[] = JSON.parse(readFileSync(TEAMS_PATH, 'utf-8'));
  if (teams.length < 2) {
    console.error('data/teams.json needs at least 2 teams.');
    process.exit(1);
  }

  const fixtures = buildFixtures(teams.map((t) => t.id), double);
  const matches = fixtures
    .sort((a, b) => a.round - b.round)
    .map((f, i) => ({
      id: `m${String(i + 1).padStart(3, '0')}`,
      seasonId: 'season-1',
      round: f.round,
      date: null,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      status: 'scheduled' as const,
      homeScore: null,
      awayScore: null,
      source: 'init-schedule',
      notes: '',
    }));

  writeFileSync(MATCHES_PATH, JSON.stringify(matches, null, 2) + '\n');

  const totalRounds = Math.max(...matches.map((m) => m.round));
  console.log(`Wrote ${matches.length} fixtures across ${totalRounds} round(s) to data/matches.json.`);

  if (existsSync(LEAGUE_PATH)) {
    const league = JSON.parse(readFileSync(LEAGUE_PATH, 'utf-8'));
    if (league.totalRounds !== totalRounds) {
      console.log(`Note: data/league.json has totalRounds=${league.totalRounds}, but this schedule has ${totalRounds}. Update it to match.`);
    }
  }
}

main();
