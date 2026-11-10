-- Additive migration: RPC wrappers so the Next.js server can manage Supabase
-- Vault and AI provider credentials through PostgREST with the existing
-- SUPABASE_SERVICE_ROLE_KEY. No direct Postgres connection (SUPABASE_DB_URL)
-- is required. Each function is SECURITY DEFINER owned by postgres, so it can
-- reach the vault schema, and only service_role may execute it; anon and
-- authenticated are explicitly revoked.

-- Vault CRUD ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ai_vault_create(p_secret text, p_name text, p_description text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN vault.create_secret(p_secret, p_name, p_description, NULL::uuid);
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_vault_read(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT s.decrypted_secret INTO v_secret FROM vault.decrypted_secrets AS s WHERE s.id = p_id;
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'VAULT_SECRET_NOT_FOUND';
  END IF;
  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_vault_update(p_id uuid, p_secret text, p_name text, p_description text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM vault.update_secret(p_id, p_secret, p_name, p_description, NULL::uuid);
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_vault_delete(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = p_id;
  RETURN FOUND;
END;
$$;

-- Provider config operations (atomic updates + audit trail) ----------------

CREATE OR REPLACE FUNCTION public.ai_provider_consume_rate_limit(p_actor uuid, p_bucket text, p_threshold integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.ai_provider_admin_rate_limits AS r (actor_id, bucket, window_start, request_count)
  VALUES (p_actor, p_bucket, now(), 1)
  ON CONFLICT (actor_id, bucket) DO UPDATE SET
    request_count = CASE WHEN r.window_start < now() - interval '1 minute' THEN 1 ELSE r.request_count + 1 END,
    window_start = CASE WHEN r.window_start < now() - interval '1 minute' THEN now() ELSE r.window_start END
  RETURNING request_count INTO v_count;
  RETURN v_count <= p_threshold;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_provider_mark_test_passed(p_id uuid, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row jsonb;
BEGIN
  UPDATE public.ai_provider_configs AS c
     SET connection_status = 'connected', last_tested_at = now(), last_error = NULL, updated_at = now()
   WHERE c.id = p_id AND c.vault_secret_id IS NOT NULL
  RETURNING to_jsonb(c.*) INTO v_row;
  IF v_row IS NULL THEN
    RAISE EXCEPTION 'CONFIG_NOT_FOUND';
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (p_actor, 'ai_provider.connection_tested', 'ai_provider_config', p_id::text,
          jsonb_build_object('provider', v_row->>'provider', 'task', v_row->>'task', 'model', v_row->>'model', 'success', true));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_provider_persist(
  p_provider text,
  p_model text,
  p_task text,
  p_secret text,
  p_actor uuid,
  p_make_default boolean,
  p_display_name text,
  p_capabilities jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_vault_id uuid;
  v_vault_id uuid;
  v_created_secret_id uuid := NULL;
  v_secret_name text;
  v_description text;
  v_row jsonb;
BEGIN
  SELECT c.vault_secret_id INTO v_old_vault_id
    FROM public.ai_provider_configs AS c
   WHERE c.provider = p_provider AND c.model = p_model AND c.task = p_task
   FOR UPDATE;

  v_secret_name := left('ai-' || p_provider || '-' || p_task || '-' || p_model, 120);
  v_description := 'Credential for Recriar Motion AI provider ' || p_provider || '; task ' || p_task || '.';

  IF v_old_vault_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_old_vault_id, p_secret, v_secret_name, v_description, NULL::uuid);
    v_vault_id := v_old_vault_id;
  ELSE
    v_vault_id := vault.create_secret(p_secret, v_secret_name, v_description, NULL::uuid);
    v_created_secret_id := v_vault_id;
  END IF;

  IF p_make_default THEN
    UPDATE public.ai_provider_configs SET is_default = false WHERE task = p_task AND is_default = true;
  END IF;

  INSERT INTO public.ai_provider_configs AS c
    (provider, display_name, model, task, enabled, is_default, secret_ref, vault_secret_id,
     connection_status, last_tested_at, last_error, capabilities, updated_by)
  VALUES
    (p_provider, p_display_name, p_model, p_task, true, p_make_default, v_vault_id::text, v_vault_id,
     'connected', now(), NULL, COALESCE(p_capabilities, '{}'::jsonb), p_actor)
  ON CONFLICT (provider, model, task) DO UPDATE SET
    display_name = excluded.display_name,
    enabled = true,
    is_default = excluded.is_default,
    secret_ref = excluded.secret_ref,
    vault_secret_id = excluded.vault_secret_id,
    connection_status = 'connected',
    last_tested_at = now(),
    last_error = NULL,
    capabilities = excluded.capabilities,
    updated_by = excluded.updated_by,
    updated_at = now()
  RETURNING to_jsonb(c.*) INTO v_row;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (p_actor, 'ai_provider.credential_saved', 'ai_provider_config', v_row->>'id',
          jsonb_build_object('provider', p_provider, 'task', p_task, 'model', p_model, 'vault_backed', true));

  RETURN v_row;
EXCEPTION WHEN OTHERS THEN
  IF v_created_secret_id IS NOT NULL THEN
    BEGIN
      DELETE FROM vault.secrets WHERE id = v_created_secret_id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_provider_record_failure(
  p_id uuid,
  p_provider text,
  p_model text,
  p_task text,
  p_code text,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target uuid := NULL;
BEGIN
  IF p_id IS NOT NULL THEN
    UPDATE public.ai_provider_configs
       SET connection_status = 'error', last_tested_at = now(), last_error = p_code, updated_at = now()
     WHERE id = p_id AND provider = p_provider AND model = p_model AND task = p_task
     RETURNING id INTO v_target;
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (p_actor, 'ai_provider.connection_tested', 'ai_provider_config', v_target::text,
          jsonb_build_object('provider', p_provider, 'task', p_task, 'model', p_model, 'success', false, 'error_code', p_code));
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_provider_set_state(p_id uuid, p_actor uuid, p_operation text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_provider text;
  v_task text;
  v_vault_id uuid;
  v_row jsonb;
  v_vault_deleted boolean := false;
BEGIN
  IF p_operation NOT IN ('disable', 'delete') THEN
    RAISE EXCEPTION 'INVALID_OPERATION';
  END IF;
  SELECT provider, task, vault_secret_id INTO v_provider, v_task, v_vault_id
    FROM public.ai_provider_configs WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFIG_NOT_FOUND';
  END IF;

  IF p_operation = 'disable' THEN
    UPDATE public.ai_provider_configs AS c
       SET enabled = false, is_default = false, connection_status = 'disabled', updated_by = p_actor, updated_at = now()
     WHERE c.id = p_id
    RETURNING to_jsonb(c.*) INTO v_row;
    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (p_actor, 'ai_provider.disabled', 'ai_provider_config', p_id::text,
            jsonb_build_object('provider', v_provider, 'task', v_task));
    RETURN jsonb_build_object('deleted', false, 'config', v_row);
  END IF;

  DELETE FROM public.ai_provider_configs WHERE id = p_id;
  IF v_vault_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ai_provider_configs WHERE vault_secret_id = v_vault_id
  ) THEN
    DELETE FROM vault.secrets WHERE id = v_vault_id;
    v_vault_deleted := FOUND;
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (p_actor, 'ai_provider.config_deleted', 'ai_provider_config', p_id::text,
          jsonb_build_object('provider', v_provider, 'task', v_task, 'vault_secret_deleted', v_vault_deleted));
  RETURN jsonb_build_object('deleted', true, 'config', NULL);
END;
$$;

-- Keep the wrappers callable only by the server-side service role. ---------
ALTER FUNCTION public.ai_vault_create(text, text, text) OWNER TO postgres;
ALTER FUNCTION public.ai_vault_read(uuid) OWNER TO postgres;
ALTER FUNCTION public.ai_vault_update(uuid, text, text, text) OWNER TO postgres;
ALTER FUNCTION public.ai_vault_delete(uuid) OWNER TO postgres;
ALTER FUNCTION public.ai_provider_consume_rate_limit(uuid, text, integer) OWNER TO postgres;
ALTER FUNCTION public.ai_provider_mark_test_passed(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.ai_provider_persist(text, text, text, text, uuid, boolean, text, jsonb) OWNER TO postgres;
ALTER FUNCTION public.ai_provider_record_failure(uuid, text, text, text, text, uuid) OWNER TO postgres;
ALTER FUNCTION public.ai_provider_set_state(uuid, uuid, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.ai_vault_create(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_vault_read(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_vault_update(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_vault_delete(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_provider_consume_rate_limit(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_provider_mark_test_passed(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_provider_persist(text, text, text, text, uuid, boolean, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_provider_record_failure(uuid, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_provider_set_state(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ai_vault_create(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_vault_read(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_vault_update(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_vault_delete(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_provider_consume_rate_limit(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_provider_mark_test_passed(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_provider_persist(text, text, text, text, uuid, boolean, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_provider_record_failure(uuid, text, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_provider_set_state(uuid, uuid, text) TO service_role;
