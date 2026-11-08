import { z } from 'zod';
export const sceneInput = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(160), description: z.string().max(10000), duration: z.number().finite().min(0.5).max(3600), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
export const characterInput = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120), role: z.string().max(200), description: z.string().max(5000), personality: z.string().max(3000), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
export const projectInput = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(160), aspect: z.enum(['16:9','9:16','1:1','4:5']), scenes: z.array(sceneInput).min(1).max(100), characters: z.array(characterInput).max(100), updatedAt: z.string().optional() });
