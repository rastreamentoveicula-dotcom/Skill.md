-- Sound FX Library: assets stay private in Storage; only license-cleared active records are visible to customers.
create table public.sound_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check(char_length(name) between 1 and 80),
  description text not null default '',
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sound_categories_name_unique on public.sound_categories(lower(name));

create table public.sound_effects (
  id uuid primary key default gen_random_uuid(),
  name text not null check(char_length(name) between 1 and 240),
  description text not null default '',
  storage_path text not null unique,
  file_format text not null check(file_format in ('mp3','wav','ogg')),
  mime_type text not null check(mime_type in ('audio/mpeg','audio/wav','audio/ogg','audio/x-wav','audio/wave')),
  duration numeric(12,4) not null check(duration > 0 and duration <= 3600),
  file_size bigint not null check(file_size > 0 and file_size <= 104857600),
  category_id uuid references public.sound_categories(id) on delete set null,
  waveform_data jsonb not null default '[]'::jsonb check(jsonb_typeof(waveform_data)='array' and jsonb_array_length(waveform_data)<=512),
  tags text[] not null default '{}',
  mood_tags text[] not null default '{}',
  source text not null default 'upload' check(source in ('upload','google_drive','other')),
  source_reference text,
  rights_holder text not null default '',
  license_type text not null default 'unverified',
  commercial_use_allowed boolean not null default false,
  redistribution_allowed boolean not null default false,
  copyright_notes text not null default '',
  content_hash text check(content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  is_active boolean not null default false,
  is_featured boolean not null default false,
  imported_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sound_effects_content_hash_unique on public.sound_effects(content_hash) where content_hash is not null;
create index sound_effects_catalog_idx on public.sound_effects(category_id,name) where is_active and commercial_use_allowed and redistribution_allowed;
create index sound_effects_tags_idx on public.sound_effects using gin(tags);
create index sound_effects_mood_tags_idx on public.sound_effects using gin(mood_tags);

create table public.user_sound_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sound_effect_id uuid not null references public.sound_effects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id,sound_effect_id)
);
create index sound_favorites_user_idx on public.user_sound_favorites(user_id,created_at desc);

-- Sound FX are platform assets; direct browser access to the private bucket is intentionally not allowed.
alter table public.timeline_clips add column sound_effect_id uuid references public.sound_effects(id) on delete restrict;
alter table public.timeline_clips add column volume numeric(4,3) not null default 1 check(volume between 0 and 1);
alter table public.timeline_clips add column fade_in_seconds numeric(10,3) not null default 0 check(fade_in_seconds>=0);
alter table public.timeline_clips add column fade_out_seconds numeric(10,3) not null default 0 check(fade_out_seconds>=0);
alter table public.timeline_clips add column playback_rate numeric(5,3) not null default 1 check(playback_rate between 0.25 and 4);
alter table public.timeline_clips add column idempotency_key text;
alter table public.timeline_clips add constraint timeline_clip_single_asset check(num_nonnulls(asset_id,sound_effect_id)<=1);
alter table public.timeline_clips add constraint timeline_clip_fades_fit check(fade_in_seconds+fade_out_seconds<=duration_seconds);
create unique index timeline_clip_idempotency_unique on public.timeline_clips(idempotency_key) where idempotency_key is not null;
create index timeline_sfx_timeline_idx on public.timeline_clips(project_id,start_seconds) where sound_effect_id is not null;
create trigger sound_categories_set_updated_at before update on public.sound_categories for each row execute function public.set_updated_at();
create trigger sound_effects_set_updated_at before update on public.sound_effects for each row execute function public.set_updated_at();
create or replace function public.audit_sound_effect_change() returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_actor uuid;v_action text;v_meta jsonb;
begin
  if tg_op='DELETE' then v_id:=old.id;v_actor:=coalesce(auth.uid(),old.imported_by);v_action:='sound_effect.deleted';
    v_meta:=jsonb_build_object('name',old.name,'is_active',old.is_active,'category_id',old.category_id);
  else v_id:=new.id;v_actor:=coalesce(auth.uid(),new.imported_by);v_action:=case when tg_op='INSERT' then 'sound_effect.created' else 'sound_effect.updated' end;
    v_meta:=jsonb_build_object('name',new.name,'is_active',new.is_active,'is_featured',new.is_featured,'category_id',new.category_id,'license_type',new.license_type,'commercial_use_allowed',new.commercial_use_allowed,'redistribution_allowed',new.redistribution_allowed);
  end if;
  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values(v_actor,v_action,'sound_effect',v_id::text,v_meta);
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
create trigger audit_sound_effect_changes after insert or update or delete on public.sound_effects for each row execute function public.audit_sound_effect_change();
revoke all on function public.audit_sound_effect_change() from public,anon,authenticated;
create or replace function public.audit_sound_category_change() returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_actor uuid;v_action text;v_meta jsonb;
begin
  if tg_op='DELETE' then v_id:=old.id;v_actor:=auth.uid();v_action:='sound_category.deleted';v_meta:=jsonb_build_object('name',old.name,'is_active',old.is_active);
  else v_id:=new.id;v_actor:=auth.uid();v_action:=case when tg_op='INSERT' then 'sound_category.created' else 'sound_category.updated' end;v_meta:=jsonb_build_object('name',new.name,'is_active',new.is_active,'is_system',new.is_system);
  end if;
  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values(v_actor,v_action,'sound_category',v_id::text,v_meta);
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
create trigger audit_sound_category_changes after insert or update or delete on public.sound_categories for each row execute function public.audit_sound_category_change();
revoke all on function public.audit_sound_category_change() from public,anon,authenticated;

alter table public.sound_categories enable row level security;
alter table public.sound_effects enable row level security;
alter table public.user_sound_favorites enable row level security;
create policy "customers see active sound categories" on public.sound_categories for select to authenticated using(is_active or public.has_role('admin'));
create policy "only admins manage sound categories" on public.sound_categories for all to authenticated using(public.has_role('admin')) with check(public.has_role('admin'));
create policy "customers see cleared active sounds" on public.sound_effects for select to authenticated using((is_active and commercial_use_allowed and redistribution_allowed) or public.has_role('admin'));
create policy "only admins manage sound effects" on public.sound_effects for all to authenticated using(public.has_role('admin')) with check(public.has_role('admin'));
create policy "users manage own sound favorites" on public.user_sound_favorites for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create or replace function public.validate_sound_favorite() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.sound_effects where id=new.sound_effect_id and is_active and commercial_use_allowed and redistribution_allowed) then
    raise exception 'sound effect unavailable or not licensed for customer use';
  end if;
  return new;
end; $$;
create trigger validate_sound_favorite_before_write before insert or update on public.user_sound_favorites for each row execute function public.validate_sound_favorite();
revoke all on function public.validate_sound_favorite() from public,anon,authenticated;

create or replace function public.validate_sound_fx_clip() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_track_kind text; v_effect_duration numeric;
begin
  if new.sound_effect_id is null then return new; end if;
  select kind into v_track_kind from public.timeline_tracks where id=new.track_id and project_id=new.project_id;
  if v_track_kind is distinct from 'audio' then raise exception 'sound effects require an audio track'; end if;
  select duration into v_effect_duration from public.sound_effects
    where id=new.sound_effect_id and is_active and commercial_use_allowed and redistribution_allowed;
  if v_effect_duration is null then raise exception 'sound effect unavailable or not licensed for customer use'; end if;
  if new.trim_start_seconds+new.duration_seconds>v_effect_duration or new.fade_in_seconds+new.fade_out_seconds>new.duration_seconds then raise exception 'invalid sound clip timing'; end if;
  return new;
end; $$;
create trigger validate_sound_fx_clip_before_write before insert or update on public.timeline_clips
  for each row execute function public.validate_sound_fx_clip();
revoke all on function public.validate_sound_fx_clip() from public,anon,authenticated;

create or replace function public.add_sound_effect_to_scene(
  p_project_id uuid,p_scene_id uuid,p_sound_effect_id uuid,p_start_time numeric,
  p_volume numeric default 1,p_fade_in numeric default 0,p_fade_out numeric default 0,p_idempotency_key uuid default gen_random_uuid()
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_owner uuid; v_track uuid; v_clip uuid; v_duration numeric; v_position integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_start_time<0 or p_volume<0 or p_volume>1 or p_fade_in<0 or p_fade_out<0 then raise exception 'invalid clip parameters'; end if;
  select owner_id into v_owner from public.projects where id=p_project_id and deleted_at is null for update;
  if v_owner is distinct from v_user then raise exception 'project access denied'; end if;
  if not exists(select 1 from public.scenes where id=p_scene_id and project_id=p_project_id) then raise exception 'scene access denied'; end if;
  select id into v_clip from public.timeline_clips where project_id=p_project_id and idempotency_key=p_idempotency_key;
  if v_clip is not null then return v_clip; end if;
  select duration into v_duration from public.sound_effects where id=p_sound_effect_id and is_active and commercial_use_allowed and redistribution_allowed;
  if v_duration is null then raise exception 'sound effect unavailable or not licensed for customer use'; end if;
  if p_fade_in+p_fade_out>v_duration then raise exception 'fade durations exceed sound duration'; end if;
  select id into v_track from public.timeline_tracks where project_id=p_project_id and kind='audio' and name='Sound FX' order by position limit 1 for update;
  if v_track is null then
    select coalesce(max(position)+1,0) into v_position from public.timeline_tracks where project_id=p_project_id;
    insert into public.timeline_tracks(project_id,name,kind,position) values(p_project_id,'Sound FX','audio',v_position) returning id into v_track;
  end if;
  insert into public.timeline_clips(id,project_id,owner_id,track_id,scene_id,sound_effect_id,position,start_seconds,duration_seconds,volume,fade_in_seconds,fade_out_seconds,idempotency_key)
   values(p_idempotency_key,p_project_id,v_user,v_track,p_scene_id,p_sound_effect_id,coalesce((select max(position)+1 from public.timeline_clips where track_id=v_track),0),p_start_time,v_duration,p_volume,p_fade_in,p_fade_out,p_idempotency_key)
   returning id into v_clip;
  return v_clip;
end; $$;
revoke all on function public.add_sound_effect_to_scene(uuid,uuid,uuid,numeric,numeric,numeric,numeric,uuid) from public,anon;
grant execute on function public.add_sound_effect_to_scene(uuid,uuid,uuid,numeric,numeric,numeric,numeric,uuid) to authenticated;

create or replace function public.search_sound_effects(
  p_search text default null,p_category_id uuid default null,p_max_duration numeric default null,
  p_mood text default null,p_favorites_only boolean default false
) returns setof public.sound_effects
language sql stable security invoker set search_path = '' as $$
  select s.* from public.sound_effects s
  where (p_search is null or length(trim(p_search))=0 or s.name ilike '%'||trim(p_search)||'%' or s.description ilike '%'||trim(p_search)||'%' or exists(select 1 from unnest(s.tags) as t(tag) where t.tag ilike '%'||trim(p_search)||'%'))
    and (p_category_id is null or s.category_id=p_category_id)
    and (p_max_duration is null or s.duration<=p_max_duration)
    and (p_mood is null or exists(select 1 from unnest(s.mood_tags||s.tags) as m(tag) where lower(m.tag)=lower(p_mood)))
    and (not coalesce(p_favorites_only,false) or exists(select 1 from public.user_sound_favorites f where f.user_id=(select auth.uid()) and f.sound_effect_id=s.id))
  order by s.is_featured desc,s.name limit 200;
$$;
revoke all on function public.search_sound_effects(text,uuid,numeric,text,boolean) from public,anon;
grant execute on function public.search_sound_effects(text,uuid,numeric,text,boolean) to authenticated;

create or replace function public.duplicate_sound_fx_clip(p_project_id uuid,p_clip_id uuid,p_new_clip_id uuid,p_start_time numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_clip public.timeline_clips%rowtype; v_owner uuid; v_position integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select owner_id into v_owner from public.projects where id=p_project_id and deleted_at is null for update;
  if v_owner is distinct from v_user then raise exception 'project access denied'; end if;
  if exists(select 1 from public.timeline_clips where id=p_new_clip_id and project_id=p_project_id) then return p_new_clip_id; end if;
  select * into v_clip from public.timeline_clips where id=p_clip_id and project_id=p_project_id and owner_id=v_user and sound_effect_id is not null;
  if not found then raise exception 'sound clip not found'; end if;
  select coalesce(max(position)+1,0) into v_position from public.timeline_clips where track_id=v_clip.track_id;
  insert into public.timeline_clips(id,project_id,owner_id,track_id,scene_id,sound_effect_id,position,start_seconds,duration_seconds,trim_start_seconds,volume,fade_in_seconds,fade_out_seconds,playback_rate,idempotency_key)
  values(p_new_clip_id,p_project_id,v_user,v_clip.track_id,v_clip.scene_id,v_clip.sound_effect_id,v_position,p_start_time,v_clip.duration_seconds,v_clip.trim_start_seconds,v_clip.volume,v_clip.fade_in_seconds,v_clip.fade_out_seconds,v_clip.playback_rate,p_new_clip_id);
  return p_new_clip_id;
end; $$;
revoke all on function public.duplicate_sound_fx_clip(uuid,uuid,uuid,numeric) from public,anon;
grant execute on function public.duplicate_sound_fx_clip(uuid,uuid,uuid,numeric) to authenticated;

create or replace function public.split_sound_fx_clip(p_project_id uuid,p_clip_id uuid,p_new_clip_id uuid,p_split_time numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_clip public.timeline_clips%rowtype; v_owner uuid; v_before numeric; v_after numeric; v_position integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  select owner_id into v_owner from public.projects where id=p_project_id and deleted_at is null for update;
  if v_owner is distinct from v_user then raise exception 'project access denied'; end if;
  if exists(select 1 from public.timeline_clips where id=p_new_clip_id and project_id=p_project_id) then return p_new_clip_id; end if;
  select * into v_clip from public.timeline_clips where id=p_clip_id and project_id=p_project_id and owner_id=v_user and sound_effect_id is not null for update;
  if not found then raise exception 'sound clip not found'; end if;
  v_before:=p_split_time-v_clip.start_seconds;v_after:=v_clip.duration_seconds-v_before;
  if v_before<0.05 or v_after<0.05 then raise exception 'split point must be inside the clip'; end if;
  select coalesce(max(position)+1,0) into v_position from public.timeline_clips where track_id=v_clip.track_id;
  update public.timeline_clips set duration_seconds=v_before,fade_in_seconds=least(fade_in_seconds,v_before),fade_out_seconds=0 where id=p_clip_id;
  insert into public.timeline_clips(id,project_id,owner_id,track_id,scene_id,sound_effect_id,position,start_seconds,duration_seconds,trim_start_seconds,volume,fade_in_seconds,fade_out_seconds,playback_rate,idempotency_key)
  values(p_new_clip_id,p_project_id,v_user,v_clip.track_id,v_clip.scene_id,v_clip.sound_effect_id,v_position,p_split_time,v_after,v_clip.trim_start_seconds+v_before,v_clip.volume,0,least(v_clip.fade_out_seconds,v_after),v_clip.playback_rate,p_new_clip_id);
  return p_new_clip_id;
end; $$;
revoke all on function public.split_sound_fx_clip(uuid,uuid,uuid,numeric) from public,anon;
grant execute on function public.split_sound_fx_clip(uuid,uuid,uuid,numeric) to authenticated;

-- Preserve timeline clip references when project autosaves update scene data.
create or replace function public.save_project_snapshot(p_project_id uuid,p_project jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_existing_owner uuid;v_scene jsonb;v_character jsonb;v_position integer:=0;v_scene_count integer;v_character_count integer;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_project is null or octet_length(p_project::text)>1000000 then raise exception 'project payload too large'; end if;
  if jsonb_typeof(p_project->'scenes')<>'array' or jsonb_array_length(p_project->'scenes')<1 or jsonb_array_length(p_project->'scenes')>100 then raise exception 'invalid scene count'; end if;
  if jsonb_typeof(coalesce(p_project->'characters','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_project->'characters','[]'::jsonb))>100 then raise exception 'invalid character count'; end if;
  select count(*),count(distinct (value->>'id')::uuid) into v_scene_count,v_character_count from jsonb_array_elements(p_project->'scenes');
  if v_scene_count<>v_character_count then raise exception 'duplicate scene ids'; end if;
  select count(*),count(distinct (value->>'id')::uuid) into v_scene_count,v_character_count from jsonb_array_elements(coalesce(p_project->'characters','[]'::jsonb));
  if v_scene_count<>v_character_count then raise exception 'duplicate character ids'; end if;
  select owner_id into v_existing_owner from public.projects where id=p_project_id for update;
  if found then
    if v_existing_owner<>v_user then raise exception 'project access denied'; end if;
    update public.projects set name=p_project->>'name',aspect_ratio=p_project->>'aspect',updated_at=now() where id=p_project_id and owner_id=v_user and deleted_at is null;
    if not found then raise exception 'project not found'; end if;
  else
    insert into public.projects(id,owner_id,name,aspect_ratio) values(p_project_id,v_user,p_project->>'name',p_project->>'aspect');
  end if;
  update public.scenes set position=position+1000 where project_id=p_project_id;
  for v_scene in select value from jsonb_array_elements(p_project->'scenes') loop
    insert into public.scenes as target(id,project_id,position,title,description,duration_seconds,visual_config)
      values((v_scene->>'id')::uuid,p_project_id,v_position,coalesce(v_scene->>'title','Scene'),coalesce(v_scene->>'description',''),(v_scene->>'duration')::numeric,jsonb_build_object('color',coalesce(v_scene->>'color','#6548bb')))
      on conflict(id) do update set position=excluded.position,title=excluded.title,description=excluded.description,duration_seconds=excluded.duration_seconds,visual_config=excluded.visual_config
      where target.project_id=p_project_id;
    if not found then raise exception 'scene id belongs to another project'; end if;
    v_position:=v_position+1;
  end loop;
  delete from public.scenes s where s.project_id=p_project_id and not exists(select 1 from jsonb_array_elements(p_project->'scenes') j where (j->>'id')::uuid=s.id);
  for v_character in select value from jsonb_array_elements(coalesce(p_project->'characters','[]'::jsonb)) loop
    insert into public.characters as target(id,project_id,name,role,description,personality,consistency_config)
      values((v_character->>'id')::uuid,p_project_id,coalesce(v_character->>'name','Character'),coalesce(v_character->>'role',''),coalesce(v_character->>'description',''),coalesce(v_character->>'personality',''),jsonb_build_object('color',coalesce(v_character->>'color','#a78bfa')))
      on conflict(id) do update set name=excluded.name,role=excluded.role,description=excluded.description,personality=excluded.personality,consistency_config=excluded.consistency_config
      where target.project_id=p_project_id;
    if not found then raise exception 'character id belongs to another project'; end if;
  end loop;
  delete from public.characters c where c.project_id=p_project_id and not exists(select 1 from jsonb_array_elements(coalesce(p_project->'characters','[]'::jsonb)) j where (j->>'id')::uuid=c.id);
  return p_project_id;
end; $$;
revoke all on function public.save_project_snapshot(uuid,jsonb) from public,anon;
grant execute on function public.save_project_snapshot(uuid,jsonb) to authenticated;

-- Categories explicitly requested by the owner; no inferred categorization is assigned to imported files.
insert into public.sound_categories(name,description,is_system) values
 ('Cinematic','',true),('Whoosh','',true),('UI Sounds','',true),('Transitions','',true),('Ambient','',true),
 ('Futuristic','',true),('Impact','',true),('Mechanical','',true),('Nature','',true),('Human Sounds','',true),('Music','',true),('Other','',true)
on conflict do nothing;
