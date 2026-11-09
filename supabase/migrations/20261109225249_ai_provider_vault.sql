-- Additive migration: use Supabase Vault references for AI credentials.
-- Existing rows/columns are preserved; no legacy ciphertext is read or removed.
ALTER TABLE public.ai_provider_configs
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS vault_secret_id uuid,
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS last_tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_provider_configs'::regclass AND conname='ai_provider_configs_connection_status_check') THEN
    ALTER TABLE public.ai_provider_configs ADD CONSTRAINT ai_provider_configs_connection_status_check
      CHECK (connection_status IN ('not_configured','pending','connected','error','disabled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_provider_configs'::regclass AND conname='ai_provider_configs_provider_check') THEN
    ALTER TABLE public.ai_provider_configs ADD CONSTRAINT ai_provider_configs_provider_check
      CHECK (provider IN ('gemini','openai','anthropic','openrouter'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.ai_provider_configs'::regclass AND conname='ai_provider_configs_task_check') THEN
    ALTER TABLE public.ai_provider_configs ADD CONSTRAINT ai_provider_configs_task_check
      CHECK (task IN ('conversation','planning','script_generation','image_analysis','video_analysis'));
  END IF;
END $$;

-- Each task has at most one default route. Multiple providers/models can remain configured.
CREATE UNIQUE INDEX IF NOT EXISTS ai_provider_configs_one_default_per_task
  ON public.ai_provider_configs (task) WHERE is_default;
CREATE INDEX IF NOT EXISTS ai_provider_configs_provider_status_idx
  ON public.ai_provider_configs (provider, connection_status);

-- Durable per-admin endpoint rate limiting; inaccessible through PostgREST/client roles.
CREATE TABLE IF NOT EXISTS public.ai_provider_admin_rate_limits (
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bucket text NOT NULL CHECK (bucket IN ('provider_network','admin_mutation')),
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (actor_id, bucket)
);
ALTER TABLE public.ai_provider_admin_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_provider_admin_rate_limits FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_provider_admin_rate_limits TO service_role;

-- Keep the existing admin-only RLS policy on ai_provider_configs. The Next.js server
-- verifies the administrator's Supabase session before using its private DB connection.
