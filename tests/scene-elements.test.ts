import { describe, expect, it } from 'vitest';
import { sceneInput, projectInput } from '@/lib/project-validation';
import { collectImageSrcs, elementState } from '@/lib/motion-composer';
import { BACKDROPS, ELEMENT_ASSETS, ELEMENT_CATEGORIES, findElementAsset } from '@/lib/element-library';
import type { SceneElement } from '@/lib/types';

const baseElement = (patch: Partial<SceneElement> = {}): SceneElement => ({
  id: '11111111-1111-4111-8111-111111111111',
  assetId: 'phone',
  x: 0.5,
  y: 0.4,
  scale: 0.3,
  rotation: 0,
  animation: 'pop',
  start: 0,
  duration: null,
  ...patch,
});

const baseScene = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Cena com elementos',
  description: 'Descrição',
  duration: 5,
  color: '#0b0e14',
};

describe('element-library', () => {
  it('tem categorias e assets com arquivo em /elements/', () => {
    expect(ELEMENT_CATEGORIES.length).toBeGreaterThanOrEqual(6);
    expect(ELEMENT_ASSETS.length).toBeGreaterThanOrEqual(18);
    for (const asset of ELEMENT_ASSETS) {
      expect(asset.src.startsWith('/elements/')).toBe(true);
      expect(asset.w).toBeGreaterThan(0);
      expect(asset.h).toBeGreaterThan(0);
      expect(ELEMENT_CATEGORIES.some(cat => cat.id === asset.category)).toBe(true);
    }
    for (const backdrop of BACKDROPS) expect(backdrop.src.startsWith('/elements/')).toBe(true);
  });

  it('findElementAsset acha por id e devolve undefined para desconhecido', () => {
    expect(findElementAsset('shield')?.name).toBe('Escudo');
    expect(findElementAsset('nao-existe')).toBeUndefined();
  });
});

describe('sceneInput com elementos e fundo', () => {
  it('aceita cena com imagem e elementos válidos', () => {
    const parsed = sceneInput.parse({
      ...baseScene,
      image: '/elements/bg-neon-grid.jpg',
      elements: [baseElement(), baseElement({ id: '33333333-3333-4333-8333-333333333333', assetId: 'shield', animation: 'float', y: 0.7 })],
    });
    expect(parsed.elements).toHaveLength(2);
    expect(parsed.image).toBe('/elements/bg-neon-grid.jpg');
  });

  it('rejeita imagem que não seja caminho ou URL', () => {
    expect(() => sceneInput.parse({ ...baseScene, image: 'data:image/png;base64,xyz' })).toThrow();
  });

  it('rejeita escala fora do intervalo e animação desconhecida', () => {
    expect(() => sceneInput.parse({ ...baseScene, elements: [baseElement({ scale: 0.001 })] })).toThrow();
    expect(() => sceneInput.parse({ ...baseScene, elements: [baseElement({ animation: 'explodir' as SceneElement['animation'] })] })).toThrow();
    expect(() => sceneInput.parse({ ...baseScene, elements: Array.from({ length: 41 }, (_, i) => baseElement({ id: `44444444-4444-4444-8444-${String(i).padStart(12, '0')}` })) })).toThrow();
  });

  it('projectInput continua aceitando projetos sem elementos (compat)', () => {
    const parsed = projectInput.parse({
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Projeto antigo',
      aspect: '16:9',
      scenes: [baseScene],
      characters: [],
    });
    expect(parsed.scenes[0]?.elements).toBeUndefined();
  });
});

describe('elementState (animações)', () => {
  it('fica invisível antes do início', () => {
    const state = elementState(baseElement({ start: 2 }), 1.5);
    expect(state.alpha).toBe(0);
  });

  it('pop entra crescendo e estabiliza em ~1', () => {
    const early = elementState(baseElement({ animation: 'pop' }), 0.12);
    const late = elementState(baseElement({ animation: 'pop' }), 3);
    expect(early.alpha).toBeGreaterThan(0);
    expect(early.scale).toBeLessThan(late.scale);
    expect(late.scale).toBeGreaterThan(0.95);
    expect(late.scale).toBeLessThanOrEqual(1.12);
    expect(late.alpha).toBeCloseTo(1, 5);
  });

  it('slide-up começa deslocado de baixo e assenta', () => {
    const early = elementState(baseElement({ animation: 'slide-up' }), 0.05);
    const late = elementState(baseElement({ animation: 'slide-up' }), 2);
    expect(early.offsetY).toBeGreaterThan(0.03);
    expect(Math.abs(late.offsetY)).toBeLessThan(0.005);
  });

  it('respeita a duração visível com fade de saída', () => {
    const visible = elementState(baseElement({ duration: 2 }), 1);
    const exiting = elementState(baseElement({ duration: 2 }), 1.9);
    const gone = elementState(baseElement({ duration: 2 }), 2.4);
    expect(visible.alpha).toBeCloseTo(1, 5);
    expect(exiting.alpha).toBeGreaterThan(0);
    expect(exiting.alpha).toBeLessThan(1);
    expect(gone.alpha).toBe(0);
  });

  it('float oscila em torno da posição original', () => {
    const a = elementState(baseElement({ animation: 'float' }), 1);
    const b = elementState(baseElement({ animation: 'float' }), 1.98);
    expect(a.offsetY).not.toBe(0);
    expect(Math.abs(a.offsetY)).toBeLessThan(0.02);
    expect(Math.abs(b.offsetY)).toBeLessThan(0.02);
  });

  it('spin gira na entrada e termina zerado', () => {
    const late = elementState(baseElement({ animation: 'spin' }), 3);
    expect(Math.abs(late.rotation)).toBeLessThan(1);
  });
});

describe('collectImageSrcs', () => {
  it('reúne fundo e assets dos elementos sem duplicar', () => {
    const srcs = collectImageSrcs({
      image: '/elements/bg-mesh.jpg',
      elements: [baseElement({ assetId: 'shield' }), baseElement({ assetId: 'shield' }), baseElement({ assetId: 'nao-existe' })],
    });
    expect(srcs).toContain('/elements/bg-mesh.jpg');
    expect(srcs).toContain('/elements/shield.png');
    expect(srcs.filter(src => src === '/elements/shield.png')).toHaveLength(1);
    expect(srcs).toHaveLength(2);
  });
});
