import corpus from "./streetConversationCorpus.json";

export type StreetDialogueTurn = {
  id: string;
  exchangeId: string;
  theme: string;
  text: string;
  speakerSlot: 0 | 1;
};

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

type StreetDialogueEntry = (typeof corpus)[number];

const sharedEntries = corpus.filter(
  (entry) => entry.id.startsWith("daily-") || entry.id.startsWith("life-"),
);
const shanghaiEntries = corpus.filter((entry) =>
  entry.id.startsWith("shanghai-"),
);
const hangzhouEntries = corpus.filter(
  (entry) => !entry.id.startsWith("shanghai-"),
);

const dialogueCycles = new Map<string, StreetDialogueTurn[]>();

function getEntriesForMapPlant(mapPlantId: string): StreetDialogueEntry[] {
  return mapPlantId.startsWith("shanghai-")
    ? [...shanghaiEntries, ...sharedEntries]
    : hangzhouEntries;
}

function buildDialogueCycle(mapPlantId: string): StreetDialogueTurn[] {
  const entries = getEntriesForMapPlant(mapPlantId);
  const start = hashText(mapPlantId) % entries.length;
  let speakerSlot = (hashText(`${mapPlantId}:speaker`) % 2) as 0 | 1;

  // 37 与两座城市的对话组数互质：每株花从不同会话开始，
  // 但一组中的问答仍然挨在一起，直到遍历完整个语料池才重复。
  return Array.from(
    { length: entries.length },
    (_, index) => entries[(start + index * 37) % entries.length],
  ).flatMap((entry) =>
    entry.lines.map((text, lineIndex) => {
      const turn: StreetDialogueTurn = {
        id: `${entry.id}-${lineIndex + 1}`,
        exchangeId: entry.id,
        theme: entry.theme,
        text,
        speakerSlot,
      };
      speakerSlot = speakerSlot === 0 ? 1 : 0;
      return turn;
    }),
  );
}

function getDialogueCycle(mapPlantId: string): StreetDialogueTurn[] {
  const cached = dialogueCycles.get(mapPlantId);
  if (cached) return cached;
  const cycle = buildDialogueCycle(mapPlantId);
  dialogueCycles.set(mapPlantId, cycle);
  return cycle;
}

export function getStreetDialogueTurn(
  mapPlantId: string,
  beat: number,
): StreetDialogueTurn {
  const cycle = getDialogueCycle(mapPlantId);
  const normalizedBeat = Math.max(0, Math.trunc(beat));
  return cycle[normalizedBeat % cycle.length];
}

export function getStreetDialoguePoolSize(mapPlantId: string): number {
  return getDialogueCycle(mapPlantId).length;
}

let currentBeat = 0;
let timer: number | null = null;
const listeners = new Set<() => void>();

export function subscribeStreetDialogue(listener: () => void): () => void {
  listeners.add(listener);
  if (!timer && typeof window !== "undefined") {
    timer = window.setInterval(() => {
      currentBeat += 1;
      listeners.forEach((notify) => notify());
    }, 6_400);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export function getStreetDialogueBeat(): number {
  return currentBeat;
}

export function getStreetDialogueServerBeat(): number {
  return 0;
}
