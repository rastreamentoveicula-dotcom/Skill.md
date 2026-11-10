import {NextResponse} from 'next/server';
import {createSupabaseAdminClient} from '@/lib/supabase-admin';
import {requireAdmin} from '@/lib/require-admin';
import {readJsonLimited,PayloadTooLargeError} from '@/lib/read-json';
import {uploadIntentSchema} from '@/lib/sound-effects-validation';
export const runtime='nodejs';
export async function POST(request:Request){
  const {user,authorized}=await requireAdmin();if(!user)return NextResponse.json({error:'Authentication required'},{status:401});if(!authorized)return NextResponse.json({error:'Administrator role required'},{status:403});
  try{
    const parsed=uploadIntentSchema.safeParse(await readJsonLimited(request,2_000_000));if(!parsed.success)return NextResponse.json({error:'Invalid import manifest',details:parsed.error.flatten()},{status:400});
    const admin=createSupabaseAdminClient();const result=[];
    for(const item of parsed.data.items){
      if(item.categoryId){const {data:category,error}=await admin.from('sound_categories').select('id').eq('id',item.categoryId).maybeSingle();if(error||!category)return NextResponse.json({error:`Unknown category for ${item.fileName}`},{status:400});}
      if(item.expectedHash){const {data:existing}=await admin.from('sound_effects').select('id,name').eq('content_hash',item.expectedHash.toLowerCase()).maybeSingle();if(existing){result.push({id:item.id,duplicate:{id:existing.id,name:existing.name}});continue;}}
      const path=`system/sound-fx/incoming/${user.id}/${item.id}.${item.format}`;
      const {data,error}=await admin.storage.from('motion-media').createSignedUploadUrl(path,{upsert:false});
      if(error)throw error;result.push({id:item.id,path:data.path,token:data.token});
    }
    return NextResponse.json({items:result},{headers:{'Cache-Control':'no-store'}});
  }catch(error){const status=error instanceof PayloadTooLargeError?413:500;return NextResponse.json({error:status===413?'Manifest too large':'Could not prepare secure uploads'},{status});}
}
