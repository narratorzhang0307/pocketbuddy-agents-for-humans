// Shared by the five sports coaches on this browser. Preference and successful access are separate.
const KEY = 'pocket.sports-camera-auto-start.v1';
const ACCESS_KEY = 'pocket.sports-camera-accessed.v1';
export function hasSportsCameraAccess(): boolean {
  try { return localStorage.getItem(ACCESS_KEY) === 'true'; } catch { return false; }
}
export function rememberSportsCameraAccess(): void {
  try { localStorage.setItem(ACCESS_KEY, 'true'); } catch { /* Auto-start remains unavailable. */ }
}
export function readSportsCameraAutoStart(): boolean | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'true' ? true : value === 'false' ? false : null;
  } catch { return null; }
}
export function saveSportsCameraAutoStart(enabled: boolean): void {
  try { localStorage.setItem(KEY, String(enabled)); } catch { /* This visit still works without storage. */ }
}
