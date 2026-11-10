import {redirect} from 'next/navigation';
import SoundFxAdmin from '@/components/SoundFxAdmin';
import {requireAdmin} from '@/lib/require-admin';
export const dynamic='force-dynamic';
export default async function SoundFxAdminPage(){let auth;try{auth=await requireAdmin();}catch{return <main className="admin-unavailable"><h1>Admin Sound FX</h1><p>Configure Supabase Auth and a database role admin para abrir a administração.</p><a href="/studio">Voltar ao Studio</a></main>;}if(!auth.user)redirect('/login?next=/admin/sound-fx');if(!auth.authorized)redirect('/studio');return <SoundFxAdmin/>;}
