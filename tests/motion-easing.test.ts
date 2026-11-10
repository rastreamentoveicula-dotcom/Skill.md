import { describe, expect, it } from 'vitest';
import { clamp01, easeInOut, easeSine, overshoot, sceneExit, wordReveal } from '@/lib/motion-easing';

describe('motion-easing', () => {
  it('overshoot começa em 0, termina em 1 e passa ~8% do alvo no meio', () => {
    expect(overshoot(0)).toBeCloseTo(0, 5);
    expect(overshoot(1)).toBeCloseTo(1, 5);
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => overshoot(i / 100)));
    expect(peak).toBeGreaterThan(1.05);
    expect(peak).toBeLessThan(1.12);
  });

  it('limita entradas fora de 0..1', () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(9)).toBe(1);
    expect(overshoot(5)).toBeCloseTo(1, 5);
    expect(easeInOut(-1)).toBe(0);
    expect(easeSine(2)).toBeCloseTo(1, 5);
  });

  it('easeInOut é simétrico e monotônico', () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
    expect(easeInOut(0.25)).toBeLessThan(easeInOut(0.75));
  });

  it('wordReveal: invisível antes, nítido e parado depois de pousar', () => {
    expect(wordReveal(0, 3)).toMatchObject({ opacity: 0, blur: 10 });
    const done = wordReveal(5, 0);
    expect(done.opacity).toBeCloseTo(1, 5);
    expect(done.offsetY).toBeCloseTo(0, 5);
    expect(done.blur).toBe(0);
  });

  it('wordReveal: palavras seguintes entram depois (escadinha)', () => {
    const t = 0.3;
    expect(wordReveal(t, 0).opacity).toBeGreaterThan(wordReveal(t, 3).opacity);
  });

  it('sceneExit: 1 antes do fim, 0 no fim e tolera cenas muito curtas', () => {
    expect(sceneExit(0, 4)).toBe(1);
    expect(sceneExit(4, 4)).toBeCloseTo(0, 5);
    expect(sceneExit(0.1, 0.2)).toBeGreaterThanOrEqual(0);
    expect(sceneExit(1, 0)).toBe(1);
  });
});
