/**
 * Curvas e helpers de animação da skill "recriar-video-motion"
 * (docs/original/SKILL.md, seções 2 e 4.4). Funções puras, sem DOM.
 */
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Entrada "overshoot suave": rápida no início, passa ~8% do alvo e assenta em 1. */
export const overshoot = (u: number) => {
  const c1 = 1.5;
  const c = c1 + 1;
  const v = clamp01(u) - 1;
  return 1 + c * v * v * v + c1 * v * v;
};

/** ease-in-out cúbico: saídas e movimentos de câmera. */
export const easeInOut = (u: number) => {
  const x = clamp01(u);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/** Seno suave 0→1, usado para a opacidade de entrada. */
export const easeSine = (u: number) => -(Math.cos(Math.PI * clamp01(u)) - 1) / 2;

export type WordReveal = { opacity: number; offsetY: number; blur: number };

/**
 * Estado de uma palavra na entrada em escadinha.
 * `local` = segundos desde o início da cena; `index` = posição global da palavra.
 * Depois de pousar (progress >= 1) devolve opacidade 1, offset 0 e blur 0: o texto não se mexe mais.
 */
export function wordReveal(local: number, index: number, opts: { delay?: number; step?: number; duration?: number; dy?: number; blur?: number } = {}): WordReveal {
  const { delay = 0.12, step = 0.08, duration = 0.45, dy = 40, blur = 10 } = opts;
  const progress = (local - (delay + index * step)) / duration;
  if (progress <= 0) return { opacity: 0, offsetY: dy, blur };
  const e = overshoot(progress);
  const settled = clamp01(progress);
  return { opacity: easeSine(settled * 1.6), offsetY: (1 - e) * dy, blur: (1 - settled) * blur };
}

/** Fator de saída (1 → 0) nos últimos `fade` segundos de uma cena, com ease-in-out. */
export function sceneExit(local: number, duration: number, fade = 0.25): number {
  const f = Math.min(fade, duration / 2);
  if (f <= 0) return 1;
  return 1 - easeInOut((local - (duration - f)) / f);
}
