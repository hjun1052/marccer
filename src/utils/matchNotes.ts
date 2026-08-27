// Per-match personal notes, kept in this browser's localStorage only (never
// synced, never affects any calculation — pure annotation).

const STORAGE_KEY = 'marccer:match-notes';

export function loadMatchNotes(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveMatchNotes(notes: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}
