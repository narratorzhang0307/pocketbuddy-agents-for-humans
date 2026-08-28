/** Pocket Buddy identities retired from every public catalog and map pool. */
export const RETIRED_POCKET_BUDDY_IDS: ReadonlySet<string> = new Set([
  'alien-04-04',
]);

export function isRetiredPocketBuddy(id: string) {
  return RETIRED_POCKET_BUDDY_IDS.has(id);
}
