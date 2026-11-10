import {NextResponse} from 'next/server';
import {createSupabaseServerClient} from '@/lib/supabase-server';
export const dynamic='force-dynamic';
export async function GET(){try{const supabase=await createSupabaseServerClient();const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)return NextResponse.json({error:'Authentication required'},{status:401});const {data,error}=await supabase.from('sound_categories').select('id,name').eq('is_active',true).order('name');if(error)return NextResponse.json({error:'Sound categories are not available'},{status:503});return NextResponse.json({items:data},{headers:{'Cache-Control':'private, no-store'}});}catch{return NextResponse.json({error:'Sound categories require Supabase configuration'},{status:503});}}
