import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase-server';
import {createSupabaseAdminClient} from '@/lib/supabase-admin';
export const dynamic='force-dynamic';export const runtime='nodejs';type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,{params}:Context){
  try{const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:'Invalid id'},{status:400});
    const supabase=await createSupabaseServerClient();const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)return NextResponse.json({error:'Authentication required'},{status:401});
    const {data:effect,error}=await supabase.from('sound_effects').select('storage_path,mime_type,is_active,commercial_use_allowed,redistribution_allowed').eq('id',id).maybeSingle();
    if(error||!effect||(!effect.is_active||!effect.commercial_use_allowed||!effect.redistribution_allowed))return NextResponse.json({error:'Sound is unavailable or not licensed for customer use'},{status:404});
    const admin=createSupabaseAdminClient();const {data,error:signError}=await admin.storage.from('motion-media').createSignedUrl(effect.storage_path,90);
    if(signError||!data)return NextResponse.json({error:'Could not create temporary playback access'},{status:503});
    return NextResponse.json({url:data.signedUrl,mimeType:effect.mime_type,expiresIn:90},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Playback requires Supabase Storage configuration'},{status:503});}
}
