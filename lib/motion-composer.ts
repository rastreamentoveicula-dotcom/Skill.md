// Motor de composição de cenas: fundo + elementos animados.
// Usado pelo export (browser-video-renderer) e testável sem canvas.
import { overshoot, easeSine } from './motion-easing';
import type { Scene, SceneElement } from './types';
import { findElementAsset } from './element-library';

export type ElementState = { alpha: number; offsetX: number; offsetY: number; scale: number; rotation: number };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Estado animado de um elemento no instante `local` da cena. */
export function elementState(el: SceneElement, local: number): ElementState {
  const t = local - el.start;
  const base: ElementState = { alpha: 1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
  if (t < 0) return { ...base, alpha: 0 };
  const inDur = 0.55;
  const enter = clamp01(t / inDur);
  let alpha = clamp01(t / 0.22);
  let scale = 1;
  switch (el.animation) {
    case 'pop':
      scale = 0.35 + 0.65 * overshoot(t / 0.6) + 0.0;
      scale = Math.min(scale, 1.12);
      break;
    case 'slide-up':
      base.offsetY = (1 - easeSine(enter)) * 0.07;
      break;
    case 'float':
      base.offsetY = Math.sin(t * 1.6) * 0.008;
      break;
    case 'spin':
      base.rotation = (1 - overshoot(t / 0.7)) * -160;
      break;
    case 'fade':
      alpha = clamp01(t / 0.45);
      break;
  }
  // saída (se a cena marcar duração visível)
  if (el.duration != null && t > el.duration - 0.35) {
    alpha *= clamp01((el.duration - t) / 0.35);
    if (alpha <= 0) return { ...base, alpha: 0 };
  }
  return { ...base, alpha, scale: base.scale * scale };
}

export function collectImageSrcs(scene: Pick<Scene, 'image' | 'elements'>): string[] {
  const srcs = new Set<string>();
  if (scene.image) srcs.add(scene.image);
  for (const el of scene.elements ?? []) {
    const asset = findElementAsset(el.assetId);
    if (asset) srcs.add(asset.src);
  }
  return [...srcs];
}

/** Desenha o fundo da cena (imagem com Ken Burns sutil) se houver. */
export function drawSceneBackground(
  ctx: CanvasRenderingContext2D,
  scene: Pick<Scene, 'image' | 'duration'>,
  width: number,
  height: number,
  local: number,
  images: Map<string, CanvasImageSource & { width: number; height: number }>,
) {
  if (!scene.image) return;
  const img = images.get(scene.image);
  if (!img || !img.width) return;
  const progress = clamp01(local / Math.max(scene.duration || 0.01, 0.01));
  const zoom = 1.05 + 0.07 * progress;
  const scale = Math.max(width / img.width, height / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const panX = Math.sin(progress * Math.PI) * 0.012 * width;
  ctx.drawImage(img, (width - dw) / 2 + panX, (height - dh) / 2, dw, dh);
}

/** Desenha os elementos posicionados da cena. */
export function drawSceneElements(
  ctx: CanvasRenderingContext2D,
  scene: Pick<Scene, 'elements'>,
  width: number,
  height: number,
  local: number,
  images: Map<string, CanvasImageSource & { width: number; height: number }>,
) {
  for (const el of scene.elements ?? []) {
    const asset = findElementAsset(el.assetId);
    if (!asset) continue;
    const img = images.get(asset.src);
    if (!img || !img.width) continue;
    const state = elementState(el, local);
    if (state.alpha <= 0.003) continue;
    const w = el.scale * width * state.scale;
    const h = w * (asset.h / asset.w);
    ctx.save();
    ctx.globalAlpha *= state.alpha;
    ctx.translate(el.x * width + state.offsetX * width, el.y * height + state.offsetY * height);
    if (el.rotation || state.rotation) ctx.rotate(((el.rotation + state.rotation) * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

/** Pré-carrega todas as imagens usadas pelas cenas. */
export async function preloadSceneImages(
  scenes: Pick<Scene, 'image' | 'elements'>[],
): Promise<Map<string, CanvasImageSource & { width: number; height: number }>> {
  const srcs = new Set<string>();
  for (const scene of scenes) for (const src of collectImageSrcs(scene)) srcs.add(src);
  const entries = await Promise.all([...srcs].map(async src => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    try { await img.decode(); } catch { /* ignora imagem com falha */ }
    return [src, img as CanvasImageSource & { width: number; height: number }] as const;
  }));
  return new Map(entries);
}
