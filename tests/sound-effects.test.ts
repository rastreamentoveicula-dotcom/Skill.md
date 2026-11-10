import {describe,it,expect} from 'vitest';
import {importCompleteSchema,uploadIntentSchema,waveformSchema} from '../lib/sound-effects-validation';
import {canSplitSoundClip,soundClipSourceTime,soundClipVolumeAt,splitSoundClipTiming} from '../lib/sound-clip-ops';
const uuid='4fef2d76-644f-4af8-a23d-90fb60b99b57';
const valid={id:uuid,name:'test.wav',description:'',fileName:'test.wav',size:1000,format:'wav' as const,categoryId:null,waveform:Array(128).fill(.2),tags:[],moodTags:[],rightsHolder:'',licenseType:'unverified',commercialUseAllowed:false,redistributionAllowed:false,copyrightNotes:'',expectedHash:'a'.repeat(64)};
describe('Sound FX import validation',()=>{
  it('accepts safe WAV/MP3/OGG manifests with a bounded waveform',()=>expect(uploadIntentSchema.safeParse({items:[valid]}).success).toBe(true));
  it('rejects oversized audio files and malformed waveform peaks',()=>{expect(uploadIntentSchema.safeParse({items:[{...valid,size:26*1024*1024}]}).success).toBe(false);expect(waveformSchema.safeParse([0.2,1]).success).toBe(false);expect(waveformSchema.safeParse([...Array(16).fill(.5),1.1]).success).toBe(false);});
  it('requires a private Storage path and signed token for import completion',()=>{expect(importCompleteSchema.safeParse({items:[{...valid,path:`system/sound-fx/incoming/${uuid}/${uuid}.wav`,token:'temporary'}]}).success).toBe(true);expect(importCompleteSchema.safeParse({items:[{...valid,path:'https://drive.google.com/permanent-link',token:'x'}]}).success).toBe(false);});
});
describe('Sound FX timeline operations',()=>{
  it('applies fades and clamps the output level',()=>{expect(soundClipVolumeAt(1,0,2,.5,.5)).toBe(0);expect(soundClipVolumeAt(1,1,2,.5,.5)).toBe(1);expect(soundClipVolumeAt(1,1.75,2,.5,.5)).toBeCloseTo(.5);expect(soundClipVolumeAt(2,1,2,0,0)).toBe(1);});
  it('converts timeline offsets to source time after trimming and speed changes',()=>expect(soundClipSourceTime(1.25,2,.5)).toBe(2.25));
  it('splits clips only at an interior point and advances the source trim',()=>{expect(canSplitSoundClip(3,4,5)).toBe(true);expect(canSplitSoundClip(3,4,3)).toBe(false);expect(splitSoundClipTiming(3,4,1,5)).toEqual([{startTime:3,duration:2,trimStart:1},{startTime:5,duration:2,trimStart:3}]);});
});
