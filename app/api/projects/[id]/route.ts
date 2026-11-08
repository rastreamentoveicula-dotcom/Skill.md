import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { projectInput } from '@/lib/project-validation';
import { readJsonLimited, PayloadTooLargeError } from '@/lib/read-json';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function PUT(request:Request,{params}:Context){
  const {id}=await params;if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({error:'Invalid project id'},{status:400});
  try{const supabase=await createSupabaseServerClient();const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)return NextResponse.json({error:'Authentication required'},{status:401});
    const parsed=projectInput.safeParse(await readJsonLimited(request));if(!parsed.success||parsed.data.id!==id)return NextResponse.json({error:'Invalid project data'},{status:400});
    const {data,error}=await supabase.rpc('save_project_snapshot',{p_project_id:id,p_project:parsed.data});if(error)throw error;return NextResponse.json({id:data},{headers:{'Cache-Control':'no-store'}});
  }catch(error){const message=error instanceof Error?error.message:'save failed';const status=error instanceof PayloadTooLargeError?413:error instanceof SyntaxError?400:message.includes('não configurado')?503:500;return NextResponse.json({error:status===413?'Request body too large':status===400?'Invalid JSON':status===503?'Project storage is not configured':'Could not save project'},{status});}
}
export async function DELETE(_request:Request,{params}:Context){
  const {id}=await params;if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({error:'Invalid project id'},{status:400});
  try{const supabase=await createSupabaseServerClient();const {data:{user},error:authError}=await supabase.auth.getUser();if(authError||!user)return NextResponse.json({error:'Authentication required'},{status:401});
    const {data,error}=await supabase.from('projects').update({deleted_at:new Date().toISOString()}).eq('id',id).is('deleted_at',null).select('id').maybeSingle();if(error)throw error;if(!data)return NextResponse.json({error:'Project not found'},{status:404});return new NextResponse(null,{status:204});
  }catch(error){const message=error instanceof Error?error.message:'delete failed';return NextResponse.json({error:message.includes('não configurado')?'Project storage is not configured':'Could not delete project'},{status:message.includes('não configurado')?503:500});}
}
