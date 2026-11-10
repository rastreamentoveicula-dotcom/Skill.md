-- Recriar Motion AI — foundational Supabase schema.
-- Run with `supabase db push` against a configured Supabase project.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  avatar_url text,
  is_blocked boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','admin','support')),
  created_at timestamptz not null default now(),
  primary key(user_id, role)
);
create or replace function public.has_role(check_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.user_roles where user_id = (select auth.uid()) and role = check_role);
$$;

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(), slug text unique not null,
  name text not null, description text not null default '',
  monthly_price_cents integer check (monthly_price_cents >= 0), yearly_price_cents integer check (yearly_price_cents >= 0),
  monthly_credits integer not null default 0 check (monthly_credits >= 0),
  project_limit integer check (project_limit is null or project_limit >= 0),
  storage_limit_bytes bigint check (storage_limit_bytes is null or storage_limit_bytes >= 0),
  max_resolution text not null default '720p' check (max_resolution in ('720p','1080p','4k')),
  max_fps integer not null default 30 check (max_fps in (24,30,60)),
  queue_priority integer not null default 0,
  features jsonb not null default '{}'::jsonb, active boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete restrict,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  provider text not null default 'mercado_pago', provider_subscription_id text unique,
  status text not null check(status in ('pending','authorized','active','past_due','paused','cancelled','expired')),
  billing_interval text not null check(billing_interval in ('month','year')),
  current_period_start timestamptz, current_period_end timestamptz, grace_until timestamptz,
  cancel_at_period_end boolean not null default false, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete restrict,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider text not null, provider_payment_id text, idempotency_key text not null unique,
  amount_cents integer not null check(amount_cents >= 0), currency text not null default 'BRL',
  status text not null check(status in ('pending','approved','rejected','refunded','cancelled','charged_back')),
  description text not null default '', raw_status text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(provider,provider_payment_id)
);
create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(), provider text not null, event_id text not null,
  event_type text not null, payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check(status in ('received','processing','processed','failed','ignored')),
  attempts integer not null default 0, last_error text, received_at timestamptz not null default now(), processed_at timestamptz,
  unique(provider,event_id)
);
create table public.credit_wallets (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  available integer not null default 0 check(available >= 0), reserved integer not null default 0 check(reserved >= 0),
  consumed_total bigint not null default 0 check(consumed_total >= 0), updated_at timestamptz not null default now()
);
create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete restrict,
  job_id uuid, type text not null check(type in ('grant','purchase','subscription','reservation','consumption','release','refund','adjustment','expiration')),
  amount integer not null check(amount > 0), balance_after integer not null check(balance_after >= 0),
  idempotency_key text not null unique, description text not null default '', metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null default 'Untitled project' check(char_length(name) between 1 and 160),
  description text not null default '', aspect_ratio text not null default '16:9' check(aspect_ratio in ('16:9','9:16','1:1','4:5')),
  settings jsonb not null default '{}'::jsonb, deleted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,owner_id)
);
create table public.project_versions (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  version_number integer not null check(version_number > 0), snapshot jsonb not null, created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), unique(project_id,version_number)
);
create table public.scenes (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  position integer not null check(position >= 0), title text not null default 'New scene', description text not null default '',
  duration_seconds numeric(8,3) not null default 4 check(duration_seconds > 0 and duration_seconds <= 3600),
  prompt text not null default '', visual_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(project_id,position), unique(id,project_id)
);
create table public.characters (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  name text not null, role text not null default '', description text not null default '', personality text not null default '',
  visual_references jsonb not null default '[]'::jsonb, consistency_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.media_assets (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete restrict,
  project_id uuid, folder text not null default '',
  bucket text not null check(bucket='motion-media'), object_path text not null check(object_path like owner_id::text || '/%'), file_name text not null, mime_type text not null,
  size_bytes bigint not null check(size_bytes >= 0), duration_seconds numeric(10,3), metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz, created_at timestamptz not null default now(), unique(bucket,object_path), unique(id,owner_id),
  foreign key(project_id,owner_id) references public.projects(id,owner_id) on delete cascade
);
create table public.timeline_tracks (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  name text not null, kind text not null check(kind in ('video','audio','text','effect','ai_layer')),
  position integer not null check(position >= 0), muted boolean not null default false, volume numeric(4,3) not null default 1 check(volume between 0 and 1),
  created_at timestamptz not null default now(), unique(project_id,position), unique(id,project_id)
);
create table public.timeline_clips (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, owner_id uuid not null,
  track_id uuid not null, scene_id uuid, asset_id uuid,
  position integer not null check(position >= 0), start_seconds numeric(10,3) not null default 0 check(start_seconds >= 0),
  duration_seconds numeric(10,3) not null check(duration_seconds > 0), trim_start_seconds numeric(10,3) not null default 0 check(trim_start_seconds >= 0),
  config jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  foreign key(project_id,owner_id) references public.projects(id,owner_id) on delete cascade,
  foreign key(track_id,project_id) references public.timeline_tracks(id,project_id) on delete cascade,
  foreign key(scene_id,project_id) references public.scenes(id,project_id) on delete cascade,
  foreign key(asset_id,owner_id) references public.media_assets(id,owner_id) on delete cascade
);
create table public.render_jobs (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  owner_id uuid not null references public.profiles(id) on delete restrict, status text not null default 'queued'
    check(status in ('waiting','queued','processing','completed','failed','cancelled')),
  output_format text not null default 'mp4' check(output_format in ('mp4','webm')),
  resolution text not null default '720p' check(resolution in ('720p','1080p','4k')),
  fps integer not null default 30 check(fps in (24,30,60)), cost_credits integer not null check(cost_credits >= 0),
  idempotency_key text not null unique, attempt_count integer not null default 0, max_attempts integer not null default 3,
  worker_id text, locked_at timestamptz, progress numeric(5,2) not null default 0 check(progress between 0 and 100),
  error_code text, error_message text, started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,owner_id),
  foreign key(project_id,owner_id) references public.projects(id,owner_id) on delete cascade
);
alter table public.credit_transactions add constraint credit_tx_job_owner_fk foreign key(job_id,user_id) references public.render_jobs(id,owner_id) on delete restrict;
create table public.render_outputs (
  id uuid primary key default gen_random_uuid(), render_job_id uuid not null references public.render_jobs(id) on delete cascade,
  bucket text not null, object_path text not null, mime_type text not null, size_bytes bigint not null check(size_bytes >= 0),
  duration_seconds numeric(10,3), resolution text not null, created_at timestamptz not null default now(), unique(bucket,object_path)
);
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete restrict,
  project_id uuid, title text not null default 'New conversation',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(project_id,owner_id) references public.projects(id,owner_id) on delete restrict
);
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check(role in ('system','user','assistant','tool')), content text not null default '',
  tool_name text, tool_result jsonb, attachments jsonb not null default '[]'::jsonb, created_at timestamptz not null default now()
);
create table public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null, model text not null, task text not null, input_tokens integer not null default 0,
  output_tokens integer not null default 0, cost_micros bigint not null default 0, status text not null default 'success',
  created_at timestamptz not null default now()
);
create table public.ai_provider_configs (
  id uuid primary key default gen_random_uuid(), provider text not null, model text not null, task text not null,
  enabled boolean not null default false, is_default boolean not null default false, secret_ref text,
  settings jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(provider,model,task)
);
create table public.system_settings (
  key text primary key, value jsonb not null default '{}'::jsonb, secret boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null, updated_at timestamptz not null default now()
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(), title text not null, body text not null,
  active boolean not null default false, starts_at timestamptz, ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete restrict,
  subject text not null, message text not null, status text not null default 'open' check(status in ('open','in_progress','resolved','closed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null,
  action text not null, target_type text not null, target_id text, reason text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.coupons (
  id uuid primary key default gen_random_uuid(), code text unique not null, credit_amount integer not null default 0 check(credit_amount >= 0),
  discount_percent integer check(discount_percent between 0 and 100), max_redemptions integer,
  redeemed_count integer not null default 0, active boolean not null default false, expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(), coupon_id uuid not null references public.coupons(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict, created_at timestamptz not null default now(), unique(coupon_id,user_id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null, title text not null, body text not null default '', read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.credit_costs (
  key text primary key, credits_per_unit numeric(12,4) not null check(credits_per_unit >= 0), unit text not null,
  active boolean not null default true, updated_at timestamptz not null default now()
);

create index projects_owner_updated_idx on public.projects(owner_id,updated_at desc) where deleted_at is null;
create index scenes_project_position_idx on public.scenes(project_id,position);
create index assets_owner_created_idx on public.media_assets(owner_id,created_at desc) where deleted_at is null;
create index render_jobs_queue_idx on public.render_jobs(status,created_at) where status in ('waiting','queued');
create index render_jobs_owner_created_idx on public.render_jobs(owner_id,created_at desc);
create index credit_transactions_user_created_idx on public.credit_transactions(user_id,created_at desc);
create unique index credit_job_single_reservation_idx on public.credit_transactions(job_id) where type='reservation' and job_id is not null;
create index ai_messages_conversation_created_idx on public.ai_messages(conversation_id,created_at);
create index notifications_owner_created_idx on public.notifications(owner_id,created_at desc);
create index payment_tx_user_created_idx on public.payment_transactions(user_id,created_at desc);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,email,display_name) values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'name',''));
  insert into public.user_roles(user_id,role) values(new.id,'user');
  insert into public.credit_wallets(user_id) values(new.id);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Atomic credit reservation. Clients may reserve only against their own queued render job.
create or replace function public.reserve_render_credits(p_job_id uuid,p_amount integer,p_idempotency_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_tx uuid; v_balance integer; v_old_job uuid; v_old_amount integer; v_old_type text; v_job public.render_jobs%rowtype;
begin
  if v_user is null or p_amount <= 0 or p_amount > 100000 or p_idempotency_key is null or length(p_idempotency_key)>200 then raise exception 'invalid reservation'; end if;
  select * into v_job from public.render_jobs where id=p_job_id and owner_id=v_user for update;
  if not found or v_job.status not in ('waiting','queued') or v_job.cost_credits<>p_amount then raise exception 'render job not eligible'; end if;
  select id,job_id,amount,type into v_tx,v_old_job,v_old_amount,v_old_type from public.credit_transactions where idempotency_key=p_idempotency_key and user_id=v_user;
  if v_tx is not null then
    if v_old_type is distinct from 'reservation' or v_old_job is distinct from p_job_id or v_old_amount<>p_amount then raise exception 'idempotency key conflict'; end if;
    return v_tx;
  end if;
  if exists(select 1 from public.credit_transactions where job_id=p_job_id and type='reservation') then raise exception 'render job already reserved'; end if;
  update public.credit_wallets set available=available-p_amount,reserved=reserved+p_amount,updated_at=now()
   where user_id=v_user and available>=p_amount returning available into v_balance;
  if not found then raise exception 'insufficient credits'; end if;
  insert into public.credit_transactions(user_id,job_id,type,amount,balance_after,idempotency_key,description)
   values(v_user,p_job_id,'reservation',p_amount,v_balance,p_idempotency_key,'Credits reserved for render job') returning id into v_tx;
  return v_tx;
end; $$;
revoke all on function public.reserve_render_credits(uuid,integer,text) from public, anon;
grant execute on function public.reserve_render_credits(uuid,integer,text) to authenticated;

-- All worker functions are service-role-only; they cannot be invoked by browser sessions.
create or replace function public.claim_render_job(p_worker_id text) returns setof public.render_jobs
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.render_jobs where status in ('waiting','queued') and attempt_count<max_attempts
    order by created_at for update skip locked limit 1;
  if v_id is null then return; end if;
  return query update public.render_jobs set status='processing',worker_id=p_worker_id,locked_at=now(),started_at=coalesce(started_at,now()),attempt_count=attempt_count+1,updated_at=now()
    where id=v_id returning *;
end; $$;
revoke all on function public.claim_render_job(text) from public, anon, authenticated;
grant execute on function public.claim_render_job(text) to service_role;

create or replace function public.finish_render_job(p_job_id uuid,p_success boolean,p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_job public.render_jobs%rowtype; v_balance integer;
begin
  select * into v_job from public.render_jobs where id=p_job_id for update;
  if not found or v_job.status not in ('processing','queued','waiting') then return; end if;
  if not exists(select 1 from public.credit_transactions where job_id=p_job_id and type='reservation' and amount=v_job.cost_credits) then raise exception 'credit reservation missing'; end if;
  if p_success then
    update public.render_jobs set status='completed',progress=100,finished_at=now(),updated_at=now() where id=p_job_id;
    update public.credit_wallets set reserved=greatest(0,reserved-v_job.cost_credits),consumed_total=consumed_total+v_job.cost_credits,updated_at=now() where user_id=v_job.owner_id returning available into v_balance;
    insert into public.credit_transactions(user_id,job_id,type,amount,balance_after,idempotency_key,description)
      values(v_job.owner_id,p_job_id,'consumption',v_job.cost_credits,coalesce(v_balance,0),'render-consume:'||p_job_id,'Render completed') on conflict(idempotency_key) do nothing;
  else
    update public.render_jobs set status='failed',error_message=left(coalesce(p_error,'Render failed'),1000),finished_at=now(),updated_at=now() where id=p_job_id;
    update public.credit_wallets set reserved=greatest(0,reserved-v_job.cost_credits),available=available+v_job.cost_credits,updated_at=now() where user_id=v_job.owner_id returning available into v_balance;
    insert into public.credit_transactions(user_id,job_id,type,amount,balance_after,idempotency_key,description)
      values(v_job.owner_id,p_job_id,'release',v_job.cost_credits,coalesce(v_balance,0),'render-release:'||p_job_id,'Credits returned after failed render') on conflict(idempotency_key) do nothing;
  end if;
end; $$;
revoke all on function public.finish_render_job(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.finish_render_job(uuid,boolean,text) to service_role;

-- One authenticated RPC persists a complete project snapshot atomically. Ownership is taken from the session, never from request JSON.
create or replace function public.save_project_snapshot(p_project_id uuid,p_project jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_existing_owner uuid; v_scene jsonb; v_character jsonb; v_position integer := 0;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_project is null or octet_length(p_project::text)>1000000 then raise exception 'project payload too large'; end if;
  if jsonb_typeof(p_project->'scenes')<>'array' or jsonb_array_length(p_project->'scenes')<1 or jsonb_array_length(p_project->'scenes')>100 then raise exception 'invalid scene count'; end if;
  if jsonb_typeof(coalesce(p_project->'characters','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_project->'characters','[]'::jsonb))>100 then raise exception 'invalid character count'; end if;
  select owner_id into v_existing_owner from public.projects where id=p_project_id for update;
  if found then
    if v_existing_owner<>v_user then raise exception 'project access denied'; end if;
    update public.projects set name=p_project->>'name',aspect_ratio=p_project->>'aspect',updated_at=now()
      where id=p_project_id and owner_id=v_user and deleted_at is null;
    if not found then raise exception 'project not found'; end if;
  else
    insert into public.projects(id,owner_id,name,aspect_ratio)
      values(p_project_id,v_user,p_project->>'name',p_project->>'aspect');
  end if;
  delete from public.scenes where project_id=p_project_id;
  for v_scene in select value from jsonb_array_elements(p_project->'scenes') loop
    insert into public.scenes(id,project_id,position,title,description,duration_seconds,visual_config)
      values((v_scene->>'id')::uuid,p_project_id,v_position,coalesce(v_scene->>'title','Scene'),coalesce(v_scene->>'description',''),
        (v_scene->>'duration')::numeric,jsonb_build_object('color',coalesce(v_scene->>'color','#6548bb')));
    v_position:=v_position+1;
  end loop;
  delete from public.characters where project_id=p_project_id;
  for v_character in select value from jsonb_array_elements(coalesce(p_project->'characters','[]'::jsonb)) loop
    insert into public.characters(id,project_id,name,role,description,personality,consistency_config)
      values((v_character->>'id')::uuid,p_project_id,coalesce(v_character->>'name','Character'),coalesce(v_character->>'role',''),
        coalesce(v_character->>'description',''),coalesce(v_character->>'personality',''),jsonb_build_object('color',coalesce(v_character->>'color','#a78bfa')));
  end loop;
  return p_project_id;
end; $$;
revoke all on function public.save_project_snapshot(uuid,jsonb) from public, anon;
grant execute on function public.save_project_snapshot(uuid,jsonb) to authenticated;

-- RLS is enabled on every table. Private mutations are server-only by default.
do $$ declare t text; begin
  foreach t in array array['profiles','user_roles','subscription_plans','subscriptions','payment_transactions','payment_webhook_events','credit_wallets','credit_transactions','projects','project_versions','scenes','characters','media_assets','timeline_tracks','timeline_clips','render_jobs','render_outputs','ai_conversations','ai_messages','ai_usage_logs','ai_provider_configs','system_settings','announcements','support_tickets','audit_logs','coupons','coupon_redemptions','notifications','credit_costs'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

create policy "profiles owner read" on public.profiles for select to authenticated using(id=(select auth.uid()) or public.has_role('admin'));
create policy "profiles owner update" on public.profiles for update to authenticated using(id=(select auth.uid()) or public.has_role('admin')) with check(id=(select auth.uid()) or public.has_role('admin'));
-- The account can edit its display fields, never its email, deletion/block state, or identity.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update(display_name,avatar_url) on public.profiles to authenticated;
create policy "roles self read" on public.user_roles for select to authenticated using(user_id=(select auth.uid()) or public.has_role('admin'));
create policy "plans active public read" on public.subscription_plans for select to anon,authenticated using(active or public.has_role('admin'));
create policy "subscriptions owner read" on public.subscriptions for select to authenticated using(user_id=(select auth.uid()) or public.has_role('admin'));
create policy "payment owner read" on public.payment_transactions for select to authenticated using(user_id=(select auth.uid()) or public.has_role('admin'));
create policy "webhooks admin read" on public.payment_webhook_events for select to authenticated using(public.has_role('admin'));
create policy "wallet owner read" on public.credit_wallets for select to authenticated using(user_id=(select auth.uid()) or public.has_role('admin'));
create policy "credit ledger owner read" on public.credit_transactions for select to authenticated using(user_id=(select auth.uid()) or public.has_role('admin'));
create policy "projects owner access" on public.projects for all to authenticated using(owner_id=(select auth.uid()) or public.has_role('admin')) with check(owner_id=(select auth.uid()) or public.has_role('admin'));
create policy "versions project owner read" on public.project_versions for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id and (p.owner_id=(select auth.uid()) or public.has_role('admin'))));
create policy "scenes project owner access" on public.scenes for all to authenticated using(exists(select 1 from public.projects p where p.id=project_id and (p.owner_id=(select auth.uid()) or public.has_role('admin')))) with check(exists(select 1 from public.projects p where p.id=project_id and (p.owner_id=(select auth.uid()) or public.has_role('admin'))));
create policy "characters project owner access" on public.characters for all to authenticated using(exists(select 1 from public.projects p where p.id=project_id and (p.owner_id=(select auth.uid()) or public.has_role('admin')))) with check(exists(select 1 from public.projects p where p.id=project_id and (p.owner_id=(select auth.uid()) or public.has_role('admin'))));
create policy "assets owner access" on public.media_assets for all to authenticated using(owner_id=(select auth.uid()) or public.has_role('admin')) with check(owner_id=(select auth.uid()) or public.has_role('admin'));
create policy "tracks project owner access" on public.timeline_tracks for all to authenticated using(exists(select 1 from public.projects p where p.id=project_id and (p.owner_id=(select auth.uid()) or public.has_role('admin')))) with check(exists(select 1 from public.projects p where p.id=project_id and (p.owner_id=(select auth.uid()) or public.has_role('admin'))));
create policy "clips owner access" on public.timeline_clips for all to authenticated using(owner_id=(select auth.uid()) or public.has_role('admin')) with check(owner_id=(select auth.uid()) or public.has_role('admin'));
create policy "render owner read" on public.render_jobs for select to authenticated using(owner_id=(select auth.uid()) or public.has_role('admin'));
create policy "outputs owner read" on public.render_outputs for select to authenticated using(exists(select 1 from public.render_jobs j where j.id=render_job_id and (j.owner_id=(select auth.uid()) or public.has_role('admin'))));
create policy "conversations owner access" on public.ai_conversations for all to authenticated using(owner_id=(select auth.uid()) or public.has_role('admin')) with check(owner_id=(select auth.uid()) or public.has_role('admin'));
create policy "messages conversation owner read" on public.ai_messages for select to authenticated using(exists(select 1 from public.ai_conversations c where c.id=conversation_id and (c.owner_id=(select auth.uid()) or public.has_role('admin'))));
create policy "messages owner can add user turns" on public.ai_messages for insert to authenticated with check(role='user' and exists(select 1 from public.ai_conversations c where c.id=conversation_id and c.owner_id=(select auth.uid())));
create policy "ai usage owner read" on public.ai_usage_logs for select to authenticated using(owner_id=(select auth.uid()) or public.has_role('admin'));
create policy "ai config admin only" on public.ai_provider_configs for all to authenticated using(public.has_role('admin')) with check(public.has_role('admin'));
create policy "system settings admin only" on public.system_settings for all to authenticated using(public.has_role('admin')) with check(public.has_role('admin'));
create policy "announcements visible" on public.announcements for select to authenticated using(active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) or public.has_role('admin'));
create policy "support owner read" on public.support_tickets for select to authenticated using(owner_id=(select auth.uid()));
create policy "support owner create" on public.support_tickets for insert to authenticated with check(owner_id=(select auth.uid()));
create policy "support admin read" on public.support_tickets for select to authenticated using(public.has_role('admin'));
revoke all on public.notifications from anon,authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
create policy "audit admin read" on public.audit_logs for select to authenticated using(public.has_role('admin'));
create policy "coupons admin only" on public.coupons for all to authenticated using(public.has_role('admin')) with check(public.has_role('admin'));
create policy "coupon redemption owner read" on public.coupon_redemptions for select to authenticated using(user_id=(select auth.uid()) or public.has_role('admin'));
create policy "notifications owner access" on public.notifications for select to authenticated using(owner_id=(select auth.uid()) or public.has_role('admin'));
create policy "notifications owner read update" on public.notifications for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "credit costs admin read write" on public.credit_costs for all to authenticated using(public.has_role('admin')) with check(public.has_role('admin'));

-- Keep updated_at reliable for rows edited directly by the authenticated owner or service.
do $$ declare t text; begin
  foreach t in array array['profiles','subscription_plans','subscriptions','payment_transactions','credit_wallets','projects','scenes','characters','render_jobs','ai_conversations','support_tickets','system_settings','ai_provider_configs'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',t);
  end loop;
end $$;

-- Private user-owned media bucket; object paths must begin with the authenticated UUID.
insert into storage.buckets(id,name,public) values ('motion-media','motion-media',false)
  on conflict(id) do update set public=false;
create policy "motion media read own folder" on storage.objects for select to authenticated
  using(bucket_id='motion-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "motion media insert own folder" on storage.objects for insert to authenticated
  with check(bucket_id='motion-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "motion media update own folder" on storage.objects for update to authenticated
  using(bucket_id='motion-media' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check(bucket_id='motion-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "motion media delete own folder" on storage.objects for delete to authenticated
  using(bucket_id='motion-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
