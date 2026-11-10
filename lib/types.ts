export type SceneElementAnimation = 'pop' | 'slide-up' | 'float' | 'spin' | 'fade';
export type SceneElement = {
  id: string;
  assetId: string;
  /** posição relativa 0..1 dentro do canvas (centro do elemento) */
  x: number;
  y: number;
  /** largura do elemento como fração da largura do canvas */
  scale: number;
  rotation: number;
  animation: SceneElementAnimation;
  /** início em segundos dentro da cena */
  start: number;
  /** duração visível em segundos; null = permanece até o fim */
  duration: number | null;
};
export type Scene = { id: string; title: string; duration: number; description: string; color: string; image?: string | null; elements?: SceneElement[] };
export type Character = { id: string; name: string; role: string; description: string; personality: string; color: string };
export type StudioProject = { id: string; name: string; aspect: string; scenes: Scene[]; characters: Character[]; updatedAt: string };
export const starterProject: StudioProject = {
  id: 'starter-motion', name: 'Lançamento — Aurora', aspect: '16:9', updatedAt: new Date().toISOString(),
  scenes: [
    { id: 's1', title: 'A primeira luz', duration: 4.5, description: 'Uma esfera luminosa desperta no centro de um universo profundo. A câmera se aproxima com suavidade.', color: '#6548bb' },
    { id: 's2', title: 'Ideias em movimento', duration: 5, description: 'Traços de luz se conectam e formam uma constelação de possibilidades criativas.', color: '#432d78' },
    { id: 's3', title: 'Crie sem limites', duration: 6, description: 'A energia se expande em ondas violeta e magenta, revelando a mensagem principal.', color: '#7e3fa8' },
  ],
  characters: [{ id: 'c1', name: 'Aurora', role: 'Guia visual', description: 'Silhueta abstrata com brilho violeta.', personality: 'Curiosa, otimista e acolhedora.', color: '#a78bfa' }],
};
