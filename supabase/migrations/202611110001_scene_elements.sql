-- Persiste também os elementos de cena e o fundo escolhido (visual_config.image/elements).
-- Compatível: o RPC anterior gravava apenas color; cenas antigas continuam funcionando.
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
    if jsonb_array_length(coalesce(v_scene->'elements','[]'::jsonb))>40 then raise exception 'too many scene elements'; end if;
    insert into public.scenes(id,project_id,position,title,description,duration_seconds,visual_config)
      values((v_scene->>'id')::uuid,p_project_id,v_position,coalesce(v_scene->>'title','Scene'),coalesce(v_scene->>'description',''),
        (v_scene->>'duration')::numeric,
        jsonb_strip_nulls(jsonb_build_object(
          'color', coalesce(v_scene->>'color','#6548bb'),
          'image', v_scene->'image',
          'elements', coalesce(v_scene->'elements','[]'::jsonb)
        )));
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
