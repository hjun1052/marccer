// Persist What-If Lab scenarios (just the override inputs) to this browser's
// localStorage so they survive a page reload.

import type { Scenario } from '../types/index.ts';

const STORAGE_KEY = 'marccer:scenarios';

export function loadScenarios(): Scenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveScenarios(scenarios: Scenario[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
}
