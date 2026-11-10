-- Manual rollback for the ai_vault_rpc migration. Drops the RPC wrappers that
-- give the service role access to Supabase Vault and AI provider operations.
DROP FUNCTION IF EXISTS public.ai_vault_create(text, text, text);
DROP FUNCTION IF EXISTS public.ai_vault_read(uuid);
DROP FUNCTION IF EXISTS public.ai_vault_update(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.ai_vault_delete(uuid);
DROP FUNCTION IF EXISTS public.ai_provider_consume_rate_limit(uuid, text, integer);
DROP FUNCTION IF EXISTS public.ai_provider_mark_test_passed(uuid, uuid);
DROP FUNCTION IF EXISTS public.ai_provider_persist(text, text, text, text, uuid, boolean, text, jsonb);
DROP FUNCTION IF EXISTS public.ai_provider_record_failure(uuid, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.ai_provider_set_state(uuid, uuid, text);
