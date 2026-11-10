import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase-server';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    const supabase=await createSupabaseServerClient();const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)return NextResponse.json({error:'Authentication required'},{status:401});
    const params=new URL(request.url).searchParams;const rawDuration=params.get('duration');const maxDuration=rawDuration===null?null:Number(rawDuration);
    if(maxDuration!==null&&(!Number.isFinite(maxDuration)||maxDuration<=0||maxDuration>3600))return NextResponse.json({error:'Invalid duration filter'},{status:400});
    const category=params.get('category');if(category&&!/^[0-9a-f-]{36}$/i.test(category))return NextResponse.json({error:'Invalid category'},{status:400});
    const q=(params.get('q')??'').trim().slice(0,120);const mood=(params.get('mood')??'').trim().slice(0,40)||null;
    const favoritesOnly=params.get('favorites_only')==='1';
    const {data,error}=await supabase.rpc('search_sound_effects',{p_search:q||null,p_category_id:category,p_max_duration:maxDuration,p_mood:mood,p_favorites_only:favoritesOnly});
    if(error)return NextResponse.json({error:'Sound library is not available. Apply the Sound FX database migration first.'},{status:503});
    const rows=(data??[]).filter((r:{is_active:boolean;commercial_use_allowed:boolean;redistribution_allowed:boolean})=>r.is_active&&r.commercial_use_allowed&&r.redistribution_allowed) as Array<Record<string,unknown>&{id:string;category_id:string|null}>;
    const ids=rows.map(row=>row.id);const categoryIds=[...new Set(rows.map(row=>row.category_id).filter((id):id is string=>!!id))];
    const [{data:favorites},{data:categories}]=await Promise.all([
      supabase.from('user_sound_favorites').select('sound_effect_id').eq('user_id',user.id).in('sound_effect_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']),
      categoryIds.length?supabase.from('sound_categories').select('id,name').in('id',categoryIds):Promise.resolve({data:[] as Array<{id:string;name:string}>}),
    ]);
    const favoriteIds=new Set((favorites??[]).map((f:{sound_effect_id:string})=>f.sound_effect_id));const categoryNames=new Map((categories??[]).map((c:{id:string;name:string})=>[c.id,c.name]));
    const items=rows.map(row=>({id:row.id,name:row.name,description:row.description,duration:row.duration,fileSize:row.file_size,format:row.file_format,categoryId:row.category_id,categoryName:row.category_id?categoryNames.get(row.category_id)??null:null,waveform:row.waveform_data,tags:row.tags,moodTags:row.mood_tags,featured:row.is_featured,favorite:favoriteIds.has(row.id)}));
    return NextResponse.json({items},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Sound library requires an authenticated Supabase connection.'},{status:503});}
}
