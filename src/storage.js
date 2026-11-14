const KEY = 'last-cue:v1';
export function readSave(storage) {
  try {
    storage ??= globalThis.localStorage;
    const data = JSON.parse(storage.getItem(KEY) || '{}');
    return { best: Number.isFinite(data.best) ? Math.max(0, Math.floor(data.best)) : 0, muted: data.muted === true, musicMuted: data.musicMuted === true };
  } catch { return { best: 0, muted: false, musicMuted: false }; }
}
export function writeSave(data, storage) {
  try {
    storage ??= globalThis.localStorage;
    storage.setItem(KEY, JSON.stringify({ best: Math.max(0, Math.floor(data.best || 0)), muted: !!data.muted, musicMuted: !!data.musicMuted })); return true;
  }
  catch { return false; }
}
