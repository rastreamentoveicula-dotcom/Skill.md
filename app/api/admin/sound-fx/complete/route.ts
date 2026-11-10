import {NextResponse} from 'next/server';
import {createHash,randomUUID} from 'node:crypto';
import {fileTypeFromBuffer} from 'file-type';
import {parseBuffer} from 'music-metadata';
import {createSupabaseAdminClient} from '@/lib/supabase-admin';
import {requireAdmin} from '@/lib/require-admin';
import {readJsonLimited,PayloadTooLargeError} from '@/lib/read-json';
import {importCompleteSchema} from '@/lib/sound-effects-validation';
export const runtime='nodejs';
const mimeToFormat:Record<string,string>={'audio/mpeg':'mp3','audio/wav':'wav','audio/x-wav':'wav','audio/wave':'wav','audio/ogg':'ogg'};
export async function POST(request:Request){
  const {user,authorized}=await requireAdmin();if(!user)return NextResponse.json({error:'Authentication required'},{status:401});if(!authorized)return NextResponse.json({error:'Administrator role required'},{status:403});
  try{
    const parsed=importCompleteSchema.safeParse(await readJsonLimited(request,2_000_000));if(!parsed.success)return NextResponse.json({error:'Invalid import completion data',details:parsed.error.flatten()},{status:400});
    const admin=createSupabaseAdminClient();const outcomes=[];
    for(const item of parsed.data.items){
      let finalPath:string|null=null;
      try{
        const pathPattern=new RegExp(`^system/sound-fx/incoming/${user.id}/[0-9a-f-]{36}\\.${item.format}$`,'i');
        if(!pathPattern.test(item.path))throw new Error('Invalid upload path');
        const {data:file,error:downloadError}=await admin.storage.from('motion-media').download(item.path);if(downloadError||!file)throw new Error('Uploaded object not found');
        const bytes=Buffer.from(await file.arrayBuffer());if(bytes.length!==item.size||bytes.length>25*1024*1024)throw new Error('File size mismatch or limit exceeded');
        const detected=await fileTypeFromBuffer(bytes);const actualFormat=detected?mimeToFormat[detected.mime]:undefined;
        if(!detected||actualFormat!==item.format)throw new Error('Audio signature does not match MP3, WAV or OGG format');
        const metadata=await parseBuffer(bytes,{mimeType:detected.mime});const duration=metadata.format.duration;
        if(!duration||!Number.isFinite(duration)||duration<=0||duration>3600)throw new Error('Could not verify a valid audio duration');
        const hash=createHash('sha256').update(bytes).digest('hex');if(item.expectedHash&&hash!==item.expectedHash.toLowerCase())throw new Error('File hash changed during upload');
        const {data:duplicate}=await admin.from('sound_effects').select('id,name').eq('content_hash',hash).maybeSingle();
        if(duplicate){await admin.storage.from('motion-media').remove([item.path]);outcomes.push({id:item.id,status:'duplicate',existingId:duplicate.id,name:duplicate.name});continue;}
        const id=randomUUID();finalPath=`system/sound-fx/assets/${id}.${item.format}`;
        const {error:moveError}=await admin.storage.from('motion-media').move(item.path,finalPath);if(moveError)throw moveError;
        const {error:insertError}=await admin.from('sound_effects').insert({
          id,name:item.name,description:item.description,storage_path:finalPath,file_format:item.format,mime_type:detected.mime,
          duration,file_size:bytes.length,category_id:item.categoryId,waveform_data:item.waveform,
          tags:item.tags,mood_tags:item.moodTags,source:item.source,source_reference:item.sourceReference||null,rights_holder:item.rightsHolder,license_type:item.licenseType,
          commercial_use_allowed:item.commercialUseAllowed,redistribution_allowed:item.redistributionAllowed,
          copyright_notes:item.copyrightNotes,content_hash:hash,is_active:false,imported_by:user.id,
          metadata:{codec:metadata.format.codec??null,sampleRate:metadata.format.sampleRate??null,numberOfChannels:metadata.format.numberOfChannels??null,bitrate:metadata.format.bitrate??null},
        });
        if(insertError)throw insertError;
        outcomes.push({id,status:'imported',duration,fileSize:bytes.length,hash,active:false});
      }catch(error){if(finalPath)await admin.storage.from('motion-media').remove([finalPath]);if(new RegExp(`^system/sound-fx/incoming/${user.id}/[0-9a-f-]{36}\\.${item.format}$`,'i').test(item.path))await admin.storage.from('motion-media').remove([item.path]);outcomes.push({id:item.id,status:'failed',error:error instanceof Error?error.message:'Import failed'});}
    }
    return NextResponse.json({items:outcomes},{headers:{'Cache-Control':'no-store'}});
  }catch(error){const status=error instanceof PayloadTooLargeError?413:500;return NextResponse.json({error:status===413?'Manifest too large':'Could not process audio imports'},{status});}
}
