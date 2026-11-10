import type { Scene } from './types';
export function projectDuration(scenes: Scene[]): number { return scenes.reduce((total, scene) => total + Math.max(0, scene.duration), 0); }
export function sceneIndexAtTime(scenes: Scene[], seconds: number): number {
  if (!scenes.length) return -1;
  const time = Math.max(0, seconds); let cursor = 0;
  for (let i = 0; i < scenes.length; i++) { cursor += scenes[i].duration; if (time < cursor || i === scenes.length - 1) return i; }
  return scenes.length - 1;
}
export function reorderScenes(scenes: Scene[], from: number, to: number): Scene[] {
  if (from < 0 || from >= scenes.length || to < 0 || to >= scenes.length) return scenes;
  const reordered = [...scenes]; const [scene] = reordered.splice(from, 1); reordered.splice(to, 0, scene); return reordered;
}
export function splitScene(scene: Scene, elapsed: number, newId: string): [Scene, Scene] | null {
  if (!Number.isFinite(elapsed) || elapsed < 0.5 || scene.duration - elapsed < 0.5) return null;
  return [{ ...scene, duration: elapsed }, { ...scene, id: newId, title: `${scene.title} (continuação)`, duration: scene.duration - elapsed }];
}
