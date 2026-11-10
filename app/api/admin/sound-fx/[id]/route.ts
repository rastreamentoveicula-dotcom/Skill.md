import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireAdmin} from '@/lib/require-admin';
import {createSupabaseAdminClient} from '@/lib/supabase-admin';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
const updateSchema=z.object({name:z.string().trim().min(1).max(240).optional(),description:z.string().max(3000).optional(),categoryId:z.string().uuid().nullable().optional(),sourceReference:z.string().max(500).optional(),tags:z.array(z.string().trim().min(1).max(40)).max(20).optional(),moodTags:z.array(z.string().trim().min(1).max(40)).max(20).optional(),rightsHolder:z.string().max(200).optional(),licenseType:z.string().max(120).optional(),commercialUseAllowed:z.boolean().optional(),redistributionAllowed:z.boolean().optional(),copyrightNotes:z.string().max(2000).optional(),isActive:z.boolean().optional(),isFeatured:z.boolean().optional()}).strict();
export async function PATCH(request:Request,{params}:Context){
  const {user,authorized,supabase}=await requireAdmin();if(!user)return NextResponse.json({error:'Authentication required'},{status:401});if(!authorized)return NextResponse.json({error:'Administrator role required'},{status:403});
  const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:'Invalid id'},{status:400});
  try{const body=updateSchema.safeParse(await request.json());if(!body.success)return NextResponse.json({error:'Invalid metadata'},{status:400});
    const {data:current,error:readError}=await supabase.from('sound_effects').select('id,rights_holder,license_type,commercial_use_allowed,redistribution_allowed').eq('id',id).maybeSingle();if(readError)throw readError;if(!current)return NextResponse.json({error:'Sound not found'},{status:404});
    const value=body.data;const commercial=value.commercialUseAllowed??current.commercial_use_allowed;const redistributable=value.redistributionAllowed??current.redistribution_allowed;const holder=value.rightsHolder??current.rights_holder;const license=value.licenseType??current.license_type;
    if(value.isActive===true&&(!commercial||!redistributable||license==='unverified'||!holder.trim()))return NextResponse.json({error:'A sound may be published only after commercial and redistribution rights are verified.'},{status:409});
    const update={...(value.name!==undefined?{name:value.name}:{}),...(value.description!==undefined?{description:value.description}:{}),...(value.categoryId!==undefined?{category_id:value.categoryId}:{}),...(value.sourceReference!==undefined?{source_reference:value.sourceReference}:{}),...(value.tags!==undefined?{tags:value.tags}:{}),...(value.moodTags!==undefined?{mood_tags:value.moodTags}:{}),...(value.rightsHolder!==undefined?{rights_holder:value.rightsHolder}:{}),...(value.licenseType!==undefined?{license_type:value.licenseType}:{}),...(value.commercialUseAllowed!==undefined?{commercial_use_allowed:value.commercialUseAllowed}:{}),...(value.redistributionAllowed!==undefined?{redistribution_allowed:value.redistributionAllowed}:{}),...(value.copyrightNotes!==undefined?{copyright_notes:value.copyrightNotes}:{}),...(value.isActive!==undefined?{is_active:value.isActive}:{}),...(value.isFeatured!==undefined?{is_featured:value.isFeatured}:{})};
    const {data,error}=await supabase.from('sound_effects').update(update).eq('id',id).select('id,name,is_active,is_featured,category_id,commercial_use_allowed,redistribution_allowed,license_type').single();if(error)throw error;return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'Could not update sound effect'},{status:500});}
}
export async function DELETE(_request:Request,{params}:Context){
  const {user,authorized,supabase}=await requireAdmin();if(!user)return NextResponse.json({error:'Authentication required'},{status:401});if(!authorized)return NextResponse.json({error:'Administrator role required'},{status:403});const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:'Invalid id'},{status:400});
  const {data:effect,error:readError}=await supabase.from('sound_effects').select('storage_path').eq('id',id).maybeSingle();if(readError||!effect)return NextResponse.json({error:'Sound not found'},{status:404});
  const {data:clips,error:clipError}=await supabase.from('timeline_clips').select('id').eq('sound_effect_id',id).limit(1);if(clipError)return NextResponse.json({error:'Could not verify timeline references'},{status:503});
  if((clips??[]).length){const {error}=await supabase.from('sound_effects').update({is_active:false,is_featured:false}).eq('id',id);if(error)return NextResponse.json({error:'Could not archive sound effect'},{status:500});return NextResponse.json({archived:true,reason:'Used in saved timelines'});}
  const {error:deleteError}=await supabase.from('sound_effects').delete().eq('id',id);if(deleteError)return NextResponse.json({error:'Could not delete sound metadata'},{status:409});
  try{const admin=createSupabaseAdminClient();const {error}=await admin.storage.from('motion-media').remove([effect.storage_path]);if(error)throw error;}catch{return NextResponse.json({error:'Metadata was deleted; private Storage cleanup needs administrator attention.'},{status:503});}
  return new NextResponse(null,{status:204});
}
