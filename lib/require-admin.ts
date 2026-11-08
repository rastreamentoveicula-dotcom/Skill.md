import { createSupabaseServerClient } from '@/lib/supabase-server';
export async function requireAdmin(){
  const supabase=await createSupabaseServerClient();
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user)return {supabase,user:null,authorized:false as const};
  const {data:role}=await supabase.from('user_roles').select('role').eq('user_id',user.id).eq('role','admin').maybeSingle();
  return {supabase,user,authorized:!!role as boolean};
}
