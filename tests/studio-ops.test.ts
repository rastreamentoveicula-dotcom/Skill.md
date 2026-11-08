import { describe, expect, it } from 'vitest';
import { projectDuration, reorderScenes, sceneIndexAtTime, splitScene } from '../lib/studio-ops';
import type { Scene } from '../lib/types';
const scenes: Scene[] = [
  { id: 'a', title: 'A', duration: 4, description: '', color: '#000' },
  { id: 'b', title: 'B', duration: 5, description: '', color: '#111' },
  { id: 'c', title: 'C', duration: 3, description: '', color: '#222' },
];
describe('studio timeline operations', () => {
  it('sums scene duration and maps playhead to the correct scene', () => {
    expect(projectDuration(scenes)).toBe(12);
    expect(sceneIndexAtTime(scenes, 0)).toBe(0);
    expect(sceneIndexAtTime(scenes, 4)).toBe(1);
    expect(sceneIndexAtTime(scenes, 30)).toBe(2);
    expect(sceneIndexAtTime([], 0)).toBe(-1);
  });
  it('reorders without mutating the source', () => {
    const result = reorderScenes(scenes, 0, 2);
    expect(result.map(s => s.id)).toEqual(['b', 'c', 'a']);
    expect(scenes.map(s => s.id)).toEqual(['a', 'b', 'c']);
    expect(reorderScenes(scenes, -1, 1)).toBe(scenes);
  });
  it('splits at a safe interior point and rejects tiny clips', () => {
    const parts = splitScene(scenes[0], 1.5, 'a2');
    expect(parts?.map(s => s.duration)).toEqual([1.5, 2.5]);
    expect(splitScene(scenes[0], 0.2, 'x')).toBeNull();
    expect(splitScene(scenes[0], 3.8, 'x')).toBeNull();
  });
});
