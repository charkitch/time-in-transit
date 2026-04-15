import type { SaveData } from '../../game/GameState';
import type { GameStateData } from '../../game/GameState';

export const SLOT_COUNT = 5;
const AUTOSAVE_LEGACY_FILENAME = 'save-autosave.json';
const AUTOSAVE_INTERVAL_FILENAME = 'save-autosave-interval.json';
const AUTOSAVE_SYSTEM_ENTRY_FILENAME = 'save-autosave-system-entry.json';
const AUTOSAVE_LAST_SYSTEM_ENTRY_FILENAME = 'save-autosave-last-system-entry.json';

function initSessionId(): string {
  if (import.meta.hot?.data?.sessionId) return import.meta.hot.data.sessionId;
  const id = crypto.randomUUID();
  if (import.meta.hot) import.meta.hot.data.sessionId = id;
  return id;
}
const SESSION_ID = initSessionId();

export type AutosaveKind = 'interval' | 'system_entry' | 'last_system_entry';

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

interface AutosaveEntry extends SlotEntry {
  sessionId: string;
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

function autosaveFileName(kind: AutosaveKind): string {
  if (kind === 'system_entry') return AUTOSAVE_SYSTEM_ENTRY_FILENAME;
  if (kind === 'last_system_entry') return AUTOSAVE_LAST_SYSTEM_ENTRY_FILENAME;
  return AUTOSAVE_INTERVAL_FILENAME;
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

export async function saveAutosave(data: SaveData, meta: SlotMeta, kind: AutosaveKind = 'interval'): Promise<void> {
  try {
    const dir = await getSlotDir();
    if (kind === 'system_entry') {
      const current = await readAutosaveEntry('system_entry');
      if (current) {
        const lastHandle = await dir.getFileHandle(autosaveFileName('last_system_entry'), { create: true });
        const lastWritable = await lastHandle.createWritable();
        await lastWritable.write(JSON.stringify(current));
        await lastWritable.close();
      }
    }
    const handle = await dir.getFileHandle(autosaveFileName(kind), { create: true });
    const writable = await handle.createWritable();
    const entry: AutosaveEntry = { meta, data, sessionId: SESSION_ID };
    await writable.write(JSON.stringify(entry));
    await writable.close();
  } catch {
    // FileSystem API unavailable — autosave silently skipped
  }
}

async function readAutosaveEntry(kind: AutosaveKind): Promise<AutosaveEntry | null> {
  try {
    const dir = await getSlotDir();
    const handle = await dir.getFileHandle(autosaveFileName(kind));
    const file = await handle.getFile();
    return JSON.parse(await file.text()) as AutosaveEntry;
  } catch {
    return null;
  }
}

async function readLegacyAutosaveEntry(): Promise<AutosaveEntry | null> {
  try {
    const dir = await getSlotDir();
    const handle = await dir.getFileHandle(AUTOSAVE_LEGACY_FILENAME);
    const file = await handle.getFile();
    return JSON.parse(await file.text()) as AutosaveEntry;
  } catch {
    return null;
  }
}

async function readLatestAutosaveEntry(): Promise<AutosaveEntry | null> {
  const [intervalEntry, systemEntry, lastSystemEntry, legacyEntry] = await Promise.all([
    readAutosaveEntry('interval'),
    readAutosaveEntry('system_entry'),
    readAutosaveEntry('last_system_entry'),
    readLegacyAutosaveEntry(),
  ]);
  const entries = [intervalEntry, systemEntry, lastSystemEntry, legacyEntry].filter((e): e is AutosaveEntry => !!e);
  if (entries.length === 0) return null;
  entries.sort((a, b) => Date.parse(b.meta.savedAt) - Date.parse(a.meta.savedAt));
  return entries[0];
}

export async function readAutosaveMeta(): Promise<SlotMeta | null> {
  return (await readLatestAutosaveEntry())?.meta ?? null;
}

export async function readAutosaveMetaByKind(kind: AutosaveKind): Promise<SlotMeta | null> {
  return (await readAutosaveEntry(kind))?.meta ?? null;
}

export async function readAutosaveMetas(): Promise<Record<AutosaveKind, SlotMeta | null>> {
  const [interval, systemEntry, lastSystemEntry] = await Promise.all([
    readAutosaveMetaByKind('interval'),
    readAutosaveMetaByKind('system_entry'),
    readAutosaveMetaByKind('last_system_entry'),
  ]);
  return {
    interval,
    system_entry: systemEntry,
    last_system_entry: lastSystemEntry,
  };
}

export async function loadAutosave(): Promise<SaveData | null> {
  return (await readLatestAutosaveEntry())?.data ?? null;
}

export async function loadAutosaveByKind(kind: AutosaveKind): Promise<SaveData | null> {
  return (await readAutosaveEntry(kind))?.data ?? null;
}

export async function isAutosaveFromCurrentSession(): Promise<boolean> {
  return (await readLatestAutosaveEntry())?.sessionId === SESSION_ID;
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
