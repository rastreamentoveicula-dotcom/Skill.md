import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createSupabaseAdminClient} from '@/lib/supabase-admin';
import {requireAdmin} from '@/lib/require-admin';
const schema=z.object({paths:z.array(z.string().max(512)).max(50)}).strict();
export async function POST(request:Request){const {user,authorized}=await requireAdmin();if(!user)return NextResponse.json({error:'Authentication required'},{status:401});if(!authorized)return NextResponse.json({error:'Administrator role required'},{status:403});const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Invalid cleanup request'},{status:400});const valid=parsed.data.paths.filter(path=>new RegExp(`^system/sound-fx/incoming/${user.id}/[0-9a-f-]{36}\\.(mp3|wav|ogg)$`,'i').test(path));if(valid.length===0)return NextResponse.json({removed:0});try{const admin=createSupabaseAdminClient();const {error}=await admin.storage.from('motion-media').remove(valid);if(error)throw error;return NextResponse.json({removed:valid.length});}catch{return NextResponse.json({error:'Could not clean temporary audio uploads'},{status:503});}}
