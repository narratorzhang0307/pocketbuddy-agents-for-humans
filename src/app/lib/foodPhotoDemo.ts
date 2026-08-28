// Only a display preference is persisted. No photos, sample meals or health data.
const KEY = 'pocketbuddy.photos.food-demo.v1';
export function readFoodDemoVisible(): boolean {
  try { return localStorage.getItem(KEY) !== 'removed'; }
  catch { return true; }
}
export function saveFoodDemoVisible(visible: boolean): boolean {
  try { localStorage.setItem(KEY, visible ? 'visible' : 'removed'); return true; }
  catch { return false; }
}
