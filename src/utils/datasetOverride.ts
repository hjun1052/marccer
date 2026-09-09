// ============================================================
// EXTERNAL DATASET OVERRIDE
// Experimental: replace the entire baked-in league/teams/matches with a
// user-supplied dataset (one JSON file with all three), fetched by URL and
// kept in this browser's localStorage. Unlike the matches-only override
// (dataOverride.ts, used for admin result entry on OUR league), this swaps
// everything — a genuinely different league/teams can be simulated.
// ============================================================

import type { League, Team, Match } from '../types/index.ts';

const STORAGE_KEY = 'marccer:dataset-override';

export interface ExternalDataset {
  league: League;
  teams: Team[];
  matches: Match[];
}

export function loadDatasetOverride(): ExternalDataset | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExternalDataset;
    if (!parsed.league || !Array.isArray(parsed.teams) || !Array.isArray(parsed.matches)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDatasetOverride(dataset: ExternalDataset): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dataset));
}

export function clearDatasetOverride(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function isValidLeague(v: unknown): v is League {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.targetTeamId === 'string' &&
    typeof r.totalRounds === 'number' &&
    !!r.rules && typeof r.rules === 'object' &&
    typeof (r.rules as Record<string, unknown>).winPoints === 'number' &&
    typeof (r.rules as Record<string, unknown>).drawPoints === 'number' &&
    typeof (r.rules as Record<string, unknown>).lossPoints === 'number' &&
    Array.isArray((r.rules as Record<string, unknown>).tiebreakers)
  );
}

function isValidTeam(v: unknown): v is Team {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === 'string' && typeof r.name === 'string';
}

function isValidMatch(v: unknown): v is Match {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.round === 'number' &&
    typeof r.homeTeamId === 'string' &&
    typeof r.awayTeamId === 'string' &&
    typeof r.status === 'string'
  );
}

// Throws a short, user-facing reason on the first thing that's wrong, rather
// than a generic parse failure — this is the only feedback the admin gets
// when an arbitrary external file doesn't fit our shape.
export function validateDataset(json: unknown): ExternalDataset {
  if (!json || typeof json !== 'object') {
    throw new Error('Not a JSON object.');
  }
  const r = json as Record<string, unknown>;

  if (!isValidLeague(r.league)) {
    throw new Error('Missing or invalid "league" (needs id, name, targetTeamId, totalRounds, rules.{winPoints,drawPoints,lossPoints,tiebreakers}).');
  }
  if (!Array.isArray(r.teams) || r.teams.length === 0 || !r.teams.every(isValidTeam)) {
    throw new Error('Missing or invalid "teams" array (each team needs id, name).');
  }
  if (!Array.isArray(r.matches) || !r.matches.every(isValidMatch)) {
    throw new Error('Missing or invalid "matches" array (each match needs id, round, homeTeamId, awayTeamId, status).');
  }

  const teamIds = new Set(r.teams.map((t) => (t as Team).id));
  if (!teamIds.has(r.league.targetTeamId)) {
    throw new Error(`league.targetTeamId "${r.league.targetTeamId}" is not in the teams list.`);
  }
  for (const m of r.matches as Match[]) {
    if (!teamIds.has(m.homeTeamId) || !teamIds.has(m.awayTeamId)) {
      throw new Error(`Match "${m.id}" references a team not in the teams list.`);
    }
  }

  return { league: r.league, teams: r.teams as Team[], matches: r.matches as Match[] };
}

export async function fetchExternalDataset(url: string): Promise<ExternalDataset> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('Could not fetch that URL — check it\'s reachable and allows cross-origin requests (CORS).');
  }
  if (!res.ok) {
    throw new Error(`Fetch failed: HTTP ${res.status}.`);
  }
  const json = await res.json();
  return validateDataset(json);
}
