// Biblioteca de Elementos — objetos 3D que o usuário posiciona nas cenas.
// Os PNGs vivem em public/elements/ (gerados por scripts/generate-element-assets.py).
export type ElementAsset = { id: string; name: string; category: string; src: string; w: number; h: number };
export type ElementCategory = { id: string; name: string };

export const ELEMENT_CATEGORIES: ElementCategory[] = [
  { id: 'devices', name: 'Dispositivos' },
  { id: 'security', name: 'Segurança' },
  { id: 'vehicles', name: 'Veículos' },
  { id: 'business', name: 'Negócios' },
  { id: 'ui', name: 'UI & Botões' },
  { id: 'graphics', name: 'Grafismos' },
];

export const BACKDROPS: { id: string; name: string; src: string }[] = [
  { id: 'bg-neon-grid', name: 'Malha Neon', src: '/elements/bg-neon-grid.jpg' },
  { id: 'bg-light-studio', name: 'Estúdio Claro', src: '/elements/bg-light-studio.jpg' },
  { id: 'bg-dark-glow', name: 'Brilho Profundo', src: '/elements/bg-dark-glow.jpg' },
  { id: 'bg-mesh', name: 'Malha Colorida', src: '/elements/bg-mesh.jpg' },
];

export const ELEMENT_ASSETS: ElementAsset[] = [
  { id: 'phone', name: 'Celular', category: 'devices', src: '/elements/phone.png', w: 420, h: 860 },
  { id: 'tablet', name: 'Tablet', category: 'devices', src: '/elements/tablet.png', w: 720, h: 540 },
  { id: 'watch', name: 'Relógio', category: 'devices', src: '/elements/watch.png', w: 320, h: 420 },
  { id: 'shield', name: 'Escudo', category: 'security', src: '/elements/shield.png', w: 520, h: 600 },
  { id: 'padlock', name: 'Cadeado', category: 'security', src: '/elements/padlock.png', w: 420, h: 480 },
  { id: 'bell', name: 'Sino de alerta', category: 'security', src: '/elements/bell.png', w: 460, h: 480 },
  { id: 'car', name: 'Carro', category: 'vehicles', src: '/elements/car.png', w: 760, h: 420 },
  { id: 'map-pin', name: 'Pino de mapa', category: 'vehicles', src: '/elements/map-pin.png', w: 360, h: 520 },
  { id: 'route', name: 'Rota', category: 'vehicles', src: '/elements/route.png', w: 600, h: 420 },
  { id: 'card', name: 'Cartão', category: 'business', src: '/elements/card.png', w: 640, h: 400 },
  { id: 'chart', name: 'Gráfico', category: 'business', src: '/elements/chart.png', w: 520, h: 440 },
  { id: 'coins', name: 'Moedas', category: 'business', src: '/elements/coins.png', w: 440, h: 420 },
  { id: 'button-pill', name: 'Botão CTA', category: 'ui', src: '/elements/button-pill.png', w: 640, h: 220 },
  { id: 'notification', name: 'Notificação', category: 'ui', src: '/elements/notification.png', w: 640, h: 360 },
  { id: 'cursor', name: 'Cursor', category: 'ui', src: '/elements/cursor.png', w: 320, h: 400 },
  { id: 'check-circle', name: 'Confirmação', category: 'ui', src: '/elements/check-circle.png', w: 420, h: 420 },
  { id: 'ring', name: 'Anel neon', category: 'graphics', src: '/elements/ring.png', w: 560, h: 560 },
  { id: 'burst', name: 'Raios', category: 'graphics', src: '/elements/burst.png', w: 720, h: 720 },
  { id: 'sparkle', name: 'Faíscas', category: 'graphics', src: '/elements/sparkle.png', w: 360, h: 360 },
  { id: 'hexgrid', name: 'Malha hexagonal', category: 'graphics', src: '/elements/hexgrid.png', w: 620, h: 560 },
];

export function findElementAsset(id: string): ElementAsset | undefined {
  return ELEMENT_ASSETS.find(asset => asset.id === id);
}
