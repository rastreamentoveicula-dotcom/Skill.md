import {z} from 'zod';
export const waveformSchema=z.array(z.number().finite().min(0).max(1)).min(16).max(512);
export const soundFxImportItemSchema=z.object({
  id:z.string().uuid(),name:z.string().trim().min(1).max(240),description:z.string().max(3000).default(''),
  fileName:z.string().min(1).max(255),size:z.number().int().positive().max(25*1024*1024),
  format:z.enum(['mp3','wav','ogg']),source:z.enum(['upload','google_drive','other']).default('upload'),sourceReference:z.string().max(500).default(''),categoryId:z.string().uuid().nullable().default(null),
  waveform:waveformSchema,tags:z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  moodTags:z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  rightsHolder:z.string().max(200).default(''),licenseType:z.string().max(120).default('unverified'),
  commercialUseAllowed:z.boolean().default(false),redistributionAllowed:z.boolean().default(false),copyrightNotes:z.string().max(2000).default(''),
  expectedHash:z.string().regex(/^[0-9a-f]{64}$/i).optional(),
});
export const uploadIntentSchema=z.object({items:z.array(soundFxImportItemSchema).min(1).max(50)}).refine(v=>v.items.reduce((sum,item)=>sum+item.size,0)<=100*1024*1024,{message:'Batch exceeds 100 MiB'});
export const importCompleteSchema=z.object({items:z.array(soundFxImportItemSchema.extend({path:z.string().regex(/^system\/sound-fx\/incoming\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:mp3|wav|ogg)$/i),token:z.string().min(1).max(2048)})).length(1)}).refine(v=>v.items[0].size<=25*1024*1024,{message:'Audio object exceeds 25 MiB'});
