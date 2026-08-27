import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface League {
  id: string;
  name: string;
  seasonId: string;
  teamIds: string[];
  currentRound: number;
  totalRounds: number;
  teamsPerRound: number;
  targetTeamId: string;
}

interface Team {
  id: string;
  name: string;
  shortName: string;
  displayName: string;
}

interface Match {
  id: string;
  seasonId: string;
  round: number;
  date: string | null;
  homeTeamId: string;
  awayTeamId: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
}

type ErrorSeverity = 'error' | 'warning';

interface ValidationIssue {
  severity: ErrorSeverity;
  file: string;
  message: string;
}

const dataDir = resolve(import.meta.dirname ?? '.', '..', 'data');

function loadJSON(filename: string): unknown {
  const raw = readFileSync(resolve(dataDir, filename), 'utf-8');
  return JSON.parse(raw);
}

function validateLeague(league: League, issues: ValidationIssue[]): void {
  if (!league.id) issues.push({ severity: 'error', file: 'league.json', message: 'Missing league id' });
  if (!league.seasonId) issues.push({ severity: 'error', file: 'league.json', message: 'Missing seasonId' });
  if (!Array.isArray(league.teamIds) || league.teamIds.length === 0) {
    issues.push({ severity: 'error', file: 'league.json', message: 'teamIds must be a non-empty array' });
  }
  if (league.totalRounds < 1) {
    issues.push({ severity: 'error', file: 'league.json', message: 'totalRounds must be >= 1' });
  }
  if (league.teamsPerRound < 2) {
    issues.push({ severity: 'error', file: 'league.json', message: 'teamsPerRound must be >= 2' });
  }
  if (!league.targetTeamId) {
    issues.push({ severity: 'error', file: 'league.json', message: 'Missing targetTeamId' });
  }
}

function validateTeams(teams: Team[], league: League, issues: ValidationIssue[]): void {
  const teamIds = new Set<string>();
  for (const team of teams) {
    if (!team.id) {
      issues.push({ severity: 'error', file: 'teams.json', message: 'Team missing id' });
      continue;
    }
    if (teamIds.has(team.id)) {
      issues.push({ severity: 'error', file: 'teams.json', message: `Duplicate team id: ${team.id}` });
    }
    teamIds.add(team.id);

    if (!team.name) issues.push({ severity: 'warning', file: 'teams.json', message: `Team ${team.id} missing name` });
    if (!team.shortName) issues.push({ severity: 'warning', file: 'teams.json', message: `Team ${team.id} missing shortName` });
  }

  for (const tid of league.teamIds) {
    if (!teamIds.has(tid)) {
      issues.push({ severity: 'error', file: 'teams.json', message: `League references non-existent team id: ${tid}` });
    }
  }

  if (league.targetTeamId && !teamIds.has(league.targetTeamId)) {
    issues.push({ severity: 'error', file: 'league.json', message: `targetTeamId ${league.targetTeamId} not found in teams` });
  }
}

function validateMatches(
  matches: Match[],
  league: League,
  teamIds: Set<string>,
  issues: ValidationIssue[],
): void {
  const matchIds = new Set<string>();
  const teamRoundCounts = new Map<string, Map<number, number>>();

  for (const match of matches) {
    if (!match.id) {
      issues.push({ severity: 'error', file: 'matches.json', message: 'Match missing id' });
      continue;
    }

    if (matchIds.has(match.id)) {
      issues.push({ severity: 'error', file: 'matches.json', message: `Duplicate match id: ${match.id}` });
    }
    matchIds.add(match.id);

    if (match.seasonId !== league.seasonId) {
      issues.push({
        severity: 'warning',
        file: 'matches.json',
        message: `Match ${match.id} seasonId "${match.seasonId}" does not match league seasonId "${league.seasonId}"`,
      });
    }

    if (!teamIds.has(match.homeTeamId)) {
      issues.push({ severity: 'error', file: 'matches.json', message: `Match ${match.id}: unknown homeTeamId "${match.homeTeamId}"` });
    }
    if (!teamIds.has(match.awayTeamId)) {
      issues.push({ severity: 'error', file: 'matches.json', message: `Match ${match.id}: unknown awayTeamId "${match.awayTeamId}"` });
    }

    if (match.homeTeamId === match.awayTeamId) {
      issues.push({ severity: 'error', file: 'matches.json', message: `Match ${match.id}: team plays itself (${match.homeTeamId})` });
    }

    if (match.round < 1 || match.round > league.totalRounds) {
      issues.push({
        severity: 'error',
        file: 'matches.json',
        message: `Match ${match.id}: round ${match.round} is out of range (1-${league.totalRounds})`,
      });
    }

    if (match.status === 'completed') {
      if (match.homeScore === null || match.awayScore === null) {
        issues.push({ severity: 'error', file: 'matches.json', message: `Match ${match.id}: completed but missing score` });
      }
      if (match.homeScore !== null && match.homeScore < 0) {
        issues.push({ severity: 'error', file: 'matches.json', message: `Match ${match.id}: negative homeScore` });
      }
      if (match.awayScore !== null && match.awayScore < 0) {
        issues.push({ severity: 'error', file: 'matches.json', message: `Match ${match.id}: negative awayScore` });
      }
    }

    if (match.status === 'scheduled') {
      if (match.homeScore !== null || match.awayScore !== null) {
        issues.push({ severity: 'error', file: 'matches.json', message: `Match ${match.id}: scheduled but has score` });
      }
    }

    if (!['scheduled', 'completed', 'postponed', 'cancelled'].includes(match.status)) {
      issues.push({ severity: 'error', file: 'matches.json', message: `Match ${match.id}: invalid status "${match.status}"` });
    }

    const validStatuses = ['scheduled', 'completed', 'postponed', 'cancelled'];
    if (!validStatuses.includes(match.status)) continue;

    const forBoth = [match.homeTeamId, match.awayTeamId];
    for (const tid of forBoth) {
      if (!teamRoundCounts.has(tid)) teamRoundCounts.set(tid, new Map());
      const rounds = teamRoundCounts.get(tid)!;
      rounds.set(match.round, (rounds.get(match.round) ?? 0) + 1);
    }
  }

  for (const [tid, rounds] of teamRoundCounts) {
    for (const [round, count] of rounds) {
      if (count > 1) {
        issues.push({
          severity: 'warning',
          file: 'matches.json',
          message: `Team ${tid} plays ${count} matches in round ${round}`,
        });
      }
    }
  }
}

function main(): void {
  console.log('=== League Data Validator ===\n');
  const issues: ValidationIssue[] = [];

  try {
    const league = loadJSON('league.json') as League;
    const teams = loadJSON('teams.json') as Team[];
    const matches = loadJSON('matches.json') as Match[];

    console.log(`League: ${league.name} (${league.id})`);
    console.log(`Season: ${league.seasonId}`);
    console.log(`Teams: ${teams.length}`);
    console.log(`Matches: ${matches.length}`);
    console.log(`Current round: ${league.currentRound}`);
    console.log(`Total rounds: ${league.totalRounds}`);
    console.log(`Target team: ${league.targetTeamId}\n`);

    validateLeague(league, issues);
    validateTeams(teams, league, issues);

    const teamIdSet = new Set(teams.map((t) => t.id));
    validateMatches(matches, league, teamIdSet, issues);
  } catch (e) {
    issues.push({
      severity: 'error',
      file: 'data',
      message: `Failed to load or parse data: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ Validation passed. No errors or warnings.\n');
  } else {
    if (errors.length > 0) {
      console.log(`❌ ${errors.length} error(s):`);
      for (const e of errors) console.log(`  [${e.file}] ${e.message}`);
      console.log();
    }
    if (warnings.length > 0) {
      console.log(`⚠️  ${warnings.length} warning(s):`);
      for (const w of warnings) console.log(`  [${w.file}] ${w.message}`);
      console.log();
    }
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}

main();
