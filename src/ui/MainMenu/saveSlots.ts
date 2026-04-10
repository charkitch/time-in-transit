import type { SaveData } from '../../game/GameState';
import type { GameStateData } from '../../game/GameState';

export const SLOT_COUNT = 5;

export interface SlotMeta {
  systemName: string;
  credits: number;
  galaxyYear: number;
  systemsVisited: number;
  savedAt: string; // ISO string
}

interface SlotEntry {
  meta: SlotMeta;
  data: SaveData;
}

let cachedDir: FileSystemDirectoryHandle | null = null;

async function getSlotDir(): Promise<FileSystemDirectoryHandle> {
  if (!cachedDir) {
    cachedDir = await navigator.storage.getDirectory();
  }
  return cachedDir;
}

function slotFileName(index: number): string {
  return `save-slot-${index}.json`;
}

export async function readSlotMeta(index: number): Promise<SlotMeta | null> {
  try {
    const dir = await getSlotDir();
    const handle = await dir.getFileHandle(slotFileName(index));
    const file = await handle.getFile();
    const entry: SlotEntry = JSON.parse(await file.text());
    return entry.meta;
  } catch {
    return null;
  }
}

export async function readAllSlotMetas(): Promise<(SlotMeta | null)[]> {
  return Promise.all(
    Array.from({ length: SLOT_COUNT }, (_, i) => readSlotMeta(i)),
  );
}

export async function saveToSlot(index: number, data: SaveData, meta: SlotMeta): Promise<void> {
  const dir = await getSlotDir();
  const handle = await dir.getFileHandle(slotFileName(index), { create: true });
  const writable = await handle.createWritable();
  const entry: SlotEntry = { meta, data };
  await writable.write(JSON.stringify(entry));
  await writable.close();
}

export async function loadFromSlot(index: number): Promise<SaveData | null> {
  try {
    const dir = await getSlotDir();
    const handle = await dir.getFileHandle(slotFileName(index));
    const file = await handle.getFile();
    const entry: SlotEntry = JSON.parse(await file.text());
    return entry.data;
  } catch {
    return null;
  }
}

export async function deleteSlot(index: number): Promise<void> {
  try {
    const dir = await getSlotDir();
    await dir.removeEntry(slotFileName(index));
  } catch {
    // file didn't exist — no-op
  }
}

export function buildSlotMeta(state: GameStateData): SlotMeta {
  const system = state.cluster.find(s => s.id === state.currentSystemId);
  return {
    systemName: system?.name ?? `System ${state.currentSystemId}`,
    credits: state.player.credits,
    galaxyYear: state.galaxyYear,
    systemsVisited: state.visitedSystems.size,
    savedAt: new Date().toISOString(),
  };
}

export function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
