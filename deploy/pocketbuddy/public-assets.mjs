// Pocket Buddy's current routes do not reference either standalone legacy runtime.
// Keep the desktop originals; this policy only controls the server release copy.
export const RETIRED_PUBLIC_DIRECTORIES = ['mediapipe', 'signbridge'];

export function shouldPublishPublicAsset(relative) {
  const directory = relative.split(/[\\/]/)[0];
  return !RETIRED_PUBLIC_DIRECTORIES.includes(directory);
}

export function assertNoRetiredPublicReferences(text, filename) {
  for (const directory of RETIRED_PUBLIC_DIRECTORIES) {
    if (text.includes(`/${directory}/`)) {
      throw new Error(`${filename} still references /${directory}/; review the public asset policy before publishing.`);
    }
  }
}
