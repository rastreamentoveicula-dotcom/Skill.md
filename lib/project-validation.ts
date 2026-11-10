import { z } from 'zod';
export const sceneElementInput = z.object({
  id: z.string().uuid(),
  assetId: z.string().min(1).max(64),
  x: z.number().finite().min(-0.5).max(1.5),
  y: z.number().finite().min(-0.5).max(1.5),
  scale: z.number().finite().min(0.05).max(4),
  rotation: z.number().finite().min(-360).max(360),
  animation: z.enum(['pop', 'slide-up', 'float', 'spin', 'fade']),
  start: z.number().finite().min(0).max(3600),
  duration: z.number().finite().min(0.1).max(3600).nullable(),
});
export const sceneInput = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(10000),
  duration: z.number().finite().min(0.5).max(3600),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  image: z.string().max(2000).regex(/^(\/|https?:)/).nullable().optional(),
  elements: z.array(sceneElementInput).max(40).optional(),
});
export const characterInput = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120), role: z.string().max(200), description: z.string().max(5000), personality: z.string().max(3000), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
export const projectInput = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(160), aspect: z.enum(['16:9','9:16','1:1','4:5']), scenes: z.array(sceneInput).min(1).max(100), characters: z.array(characterInput).max(100), updatedAt: z.string().optional() });
