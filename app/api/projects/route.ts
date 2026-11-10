import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { projectInput } from '@/lib/project-validation';
import { readJsonLimited, PayloadTooLargeError } from '@/lib/read-json';
export const runtime = 'nodejs';
async function authenticated() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { supabase, user: error ? null : user };
}
type DbProject={id:string;name:string;aspect_ratio:string;updated_at:string;scenes:{id:string;position:number;title:string;description:string;duration_seconds:number;visual_config:Record<string,unknown>|null}[];characters:{id:string;name:string;role:string;description:string;personality:string;consistency_config:Record<string,unknown>|null}[]};
function mapProject(row: DbProject) {
  return { id: row.id, name: row.name, aspect: row.aspect_ratio, updatedAt: row.updated_at,
    scenes: [...(row.scenes ?? [])].sort((a,b)=>a.position-b.position).map(s=>({ id:s.id,title:s.title,description:s.description,duration:Number(s.duration_seconds),color:typeof s.visual_config?.color==='string'?s.visual_config.color:'#6548bb',image:typeof s.visual_config?.image==='string'?s.visual_config.image:null,elements:Array.isArray(s.visual_config?.elements)?s.visual_config.elements as Record<string,unknown>[]:[] })),
    characters: (row.characters ?? []).map(c=>({id:c.id,name:c.name,role:c.role,description:c.description,personality:c.personality,color:typeof c.consistency_config?.color==='string'?c.consistency_config.color:'#a78bfa'})) };
}
export async function GET() {
  try {
    const {supabase,user}=await authenticated(); if(!user)return NextResponse.json({error:'Authentication required'}, {status:401});
    const {data,error}=await supabase.from('projects').select('id,name,aspect_ratio,updated_at,scenes(id,position,title,description,duration_seconds,visual_config),characters(id,name,role,description,personality,consistency_config)').is('deleted_at',null).order('updated_at',{ascending:false}).limit(50);
    if(error)throw error; return NextResponse.json((data??[]).map(mapProject),{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) { const message=error instanceof Error?error.message:'Project service unavailable';const status=error instanceof PayloadTooLargeError?413:error instanceof SyntaxError?400:message.includes('não configurado')?503:500;return NextResponse.json({error:status===413?'Request body too large':status===400?'Invalid JSON':status===503?'Project storage is not configured':'Could not load projects'},{status}); }
}
export async function POST(request:Request) {
  try {
    const {supabase,user}=await authenticated(); if(!user)return NextResponse.json({error:'Authentication required'},{status:401});
    const body=await readJsonLimited(request);const parsed=projectInput.safeParse(body);if(!parsed.success)return NextResponse.json({error:'Invalid project data',details:parsed.error.flatten()},{status:400});
    const {data,error}=await supabase.rpc('save_project_snapshot',{p_project_id:parsed.data.id,p_project:parsed.data});
    if(error)throw error;return NextResponse.json({id:data},{status:201,headers:{'Cache-Control':'no-store'}});
  } catch(error) { const message=error instanceof Error?error.message:'Project save failed';const status=error instanceof PayloadTooLargeError?413:error instanceof SyntaxError?400:message.includes('não configurado')?503:500;return NextResponse.json({error:status===413?'Request body too large':status===400?'Invalid JSON':status===503?'Project storage is not configured':'Could not save project'},{status}); }
}
