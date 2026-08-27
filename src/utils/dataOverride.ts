// ============================================================
// LOCAL DATA OVERRIDE
// Static build ships with data/matches.json baked in. This lets an admin
// enter real results in the browser (no server) and have them override the
// baked-in data on future loads, plus export/import a save file so the
// override can be handed to someone else or backed up.
// ============================================================

import type { Match } from '../types/index.ts';

const STORAGE_KEY = 'marccer:matches-override';
const SAVE_FILE_VERSION = 1;

interface SaveFile {
  version: number;
  savedAt: string;
  matches: Match[];
}

export function loadOverrideMatches(): Match[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SaveFile;
    if (!Array.isArray(parsed.matches)) return null;
    return parsed.matches;
  } catch {
    return null;
  }
}

export function saveOverrideMatches(matches: Match[]): void {
  const file: SaveFile = { version: SAVE_FILE_VERSION, savedAt: new Date().toISOString(), matches };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
}

export function clearOverrideMatches(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasOverride(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

export function downloadMatchesSaveFile(matches: Match[]): void {
  const file: SaveFile = { version: SAVE_FILE_VERSION, savedAt: new Date().toISOString(), matches };
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `marccer-matches-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function isValidMatch(m: unknown): m is Match {
  if (!m || typeof m !== 'object') return false;
  const r = m as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.round === 'number' &&
    typeof r.homeTeamId === 'string' &&
    typeof r.awayTeamId === 'string' &&
    typeof r.status === 'string'
  );
}

export async function parseMatchesSaveFile(file: File): Promise<Match[]> {
  const text = await file.text();
  const parsed = JSON.parse(text) as SaveFile;
  if (!Array.isArray(parsed.matches) || !parsed.matches.every(isValidMatch)) {
    throw new Error('Not a valid marccer matches save file.');
  }
  return parsed.matches;
}
