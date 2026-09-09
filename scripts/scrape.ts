// ============================================================
// SCRAPER — updates data/matches.json + data/league.json from the source
// league site, so results don't have to be typed in by hand every round.
//
// This is a REFERENCE implementation pinned to this project's specific
// source (chizumulu.github.io/UTD/data.js). Self-hosting a different
// league means swapping SOURCE_URL and the parsing in main() for your own
// source's format — the rest (matching by round + team pair, writing
// data/*.json, the diff/no-op check) stays the same shape.
//
// It only UPDATES existing rows in data/matches.json (matched by round +
// team pair) — it never invents new rows or team ids, so the full-season
// schedule (every round, every pairing, status "scheduled") must already
// exist there before this runs.
//
// Usage: npm run scrape
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SOURCE_URL = 'https://chizumulu.github.io/UTD/data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const MATCHES_PATH = path.join(DATA_DIR, 'matches.json');
const LEAGUE_PATH = path.join(DATA_DIR, 'league.json');
const TEAMS_PATH = path.join(DATA_DIR, 'teams.json');

interface SourceMatch {
  homeEn?: string;
  awayEn?: string;
  byeEn?: string;
  byeKo?: string;
  homeScore?: number;
  awayScore?: number;
  postponed?: boolean;
  kickoffDate?: string;
}

interface StoredMatch {
  id: string;
  round: number;
  date: string | null;
  homeTeamId: string;
  awayTeamId: string;
  status: 'scheduled' | 'completed' | 'postponed' | 'cancelled';
  homeScore: number | null;
  awayScore: number | null;
  [key: string]: unknown;
}

interface StoredTeam {
  id: string;
  nameEn?: string;
  [key: string]: unknown;
}

// Pulls `const <name> = <literal>;` out of the source's plain-JS file and
// evaluates just that extracted literal in isolation — never the whole
// file. Only reasonable because SOURCE_URL is one fixed, project-controlled
// URL, not arbitrary input; adapt with real parsing if your source isn't a
// trusted static file like this.
function extractLiteral(source: string, name: string): Record<string, SourceMatch[]> {
  const marker = `const ${name} = `;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find "${name}" in source — did the site's format change?`);
  const bodyStart = start + marker.length;

  let depth = 0;
  let end = -1;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) throw new Error(`Could not parse "${name}" — unbalanced braces.`);

  const literal = source.slice(bodyStart, end);
  // eslint-disable-next-line no-new-func -- see comment above: trusted, pinned source only.
  return new Function(`return (${literal});`)();
}

async function main() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  const js = await res.text();

  const roundsData = extractLiteral(js, 'roundsData');

  const teams: StoredTeam[] = JSON.parse(readFileSync(TEAMS_PATH, 'utf-8'));
  const matches: StoredMatch[] = JSON.parse(readFileSync(MATCHES_PATH, 'utf-8'));
  const league = JSON.parse(readFileSync(LEAGUE_PATH, 'utf-8'));

  const teamIdByNameEn = new Map(teams.filter((t) => t.nameEn).map((t) => [t.nameEn, t.id]));

  let changed = 0;
  const warnings: string[] = [];

  for (const [roundKey, entries] of Object.entries(roundsData)) {
    const round = Number(roundKey.replace('round', ''));
    if (!Number.isFinite(round)) continue;

    for (const entry of entries) {
      if (entry.byeEn || entry.byeKo) continue;
      if (!entry.homeEn || !entry.awayEn) continue;

      const sourceHomeId = teamIdByNameEn.get(entry.homeEn);
      const sourceAwayId = teamIdByNameEn.get(entry.awayEn);
      if (!sourceHomeId || !sourceAwayId) {
        warnings.push(`Round ${round}: unknown team name "${entry.homeEn}" or "${entry.awayEn}" — not in data/teams.json.`);
        continue;
      }

      const match = matches.find((m) =>
        m.round === round &&
        ((m.homeTeamId === sourceHomeId && m.awayTeamId === sourceAwayId) ||
          (m.homeTeamId === sourceAwayId && m.awayTeamId === sourceHomeId))
      );
      if (!match) {
        warnings.push(`Round ${round}: no existing schedule row for ${entry.homeEn} vs ${entry.awayEn} — add it to data/matches.json first (this script only updates, never creates rows).`);
        continue;
      }

      if (entry.postponed) {
        if (match.status !== 'postponed') {
          match.status = 'postponed';
          match.date = null;
          match.homeScore = null;
          match.awayScore = null;
          changed++;
        }
      } else if (typeof entry.homeScore === 'number' && typeof entry.awayScore === 'number') {
        // Our stored row's home/away may be flipped from the source's if a
        // reschedule swapped venues — this project hasn't hit that case, so
        // scores are reoriented to match our row rather than assumed identical.
        const [homeScore, awayScore] = match.homeTeamId === sourceHomeId
          ? [entry.homeScore, entry.awayScore]
          : [entry.awayScore, entry.homeScore];
        if (match.status !== 'completed' || match.homeScore !== homeScore || match.awayScore !== awayScore) {
          match.status = 'completed';
          match.homeScore = homeScore;
          match.awayScore = awayScore;
          if (entry.kickoffDate) match.date = entry.kickoffDate;
          changed++;
        }
      } else if (entry.kickoffDate && match.status === 'scheduled' && match.date !== entry.kickoffDate) {
        match.date = entry.kickoffDate;
        changed++;
      }
    }
  }

  for (const w of warnings) console.warn(`  ! ${w}`);

  if (changed === 0) {
    console.log('No changes.');
    return;
  }

  league.lastDataUpdate = new Date().toISOString();
  writeFileSync(MATCHES_PATH, JSON.stringify(matches, null, 2) + '\n');
  writeFileSync(LEAGUE_PATH, JSON.stringify(league, null, 2) + '\n');
  console.log(`Updated ${changed} match field(s). Wrote data/matches.json and data/league.json.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
