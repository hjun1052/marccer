// ============================================================
// UTILITY HELPERS
// ============================================================

import type { Team } from '../types/index.ts';
import type { Lang } from '../i18n/I18nContext.tsx';

export function getTeamName(teams: Team[], teamId: string, lang: Lang = 'ko'): string {
  const team = teams.find(t => t.id === teamId);
  if (!team) return teamId;
  return lang === 'en' ? (team.shortNameEn ?? team.shortName) : team.shortName;
}

export function getTeamFullName(teams: Team[], teamId: string, lang: Lang = 'ko'): string {
  const team = teams.find(t => t.id === teamId);
  if (!team) return teamId;
  if (lang === 'en') return team.displayNameEn ?? team.nameEn ?? team.displayName ?? team.name;
  return team.displayName ?? team.name;
}

// Same as getTeamName/getTeamFullName, but for callers that already have the Team object.
export function pickTeamShort(team: Team, lang: Lang = 'ko'): string {
  return lang === 'en' ? (team.shortNameEn ?? team.shortName) : team.shortName;
}

export function pickTeamDisplay(team: Team, lang: Lang = 'ko'): string {
  return lang === 'en'
    ? (team.displayNameEn ?? team.nameEn ?? team.displayName ?? team.name)
    : (team.displayName ?? team.name);
}

// CSS-safe class slug: lowercase, non-alphanumeric runs collapsed to a single '-', no leading/trailing '-'.
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
