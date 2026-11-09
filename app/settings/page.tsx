import { redirect } from 'next/navigation';
import '../account-settings.css';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import AccountSettings from './SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/settings');
  return <AccountSettings />;
}
