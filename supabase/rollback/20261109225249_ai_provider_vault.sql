-- Manual rollback counterpart for 202611090001_ai_provider_vault.sql.
-- Review and restore the prior application version before running.
-- This intentionally does NOT delete any Vault secrets or ai_provider_configs rows.
-- Remove the new fields only after exporting/backing up their metadata if needed.

DROP INDEX IF EXISTS public.ai_provider_configs_one_default_per_task;
DROP INDEX IF EXISTS public.ai_provider_configs_provider_status_idx;
DROP TABLE IF EXISTS public.ai_provider_admin_rate_limits;
ALTER TABLE public.ai_provider_configs DROP CONSTRAINT IF EXISTS ai_provider_configs_connection_status_check;
ALTER TABLE public.ai_provider_configs DROP CONSTRAINT IF EXISTS ai_provider_configs_provider_check;
ALTER TABLE public.ai_provider_configs DROP CONSTRAINT IF EXISTS ai_provider_configs_task_check;
ALTER TABLE public.ai_provider_configs
  DROP COLUMN IF EXISTS display_name,
  DROP COLUMN IF EXISTS vault_secret_id,
  DROP COLUMN IF EXISTS connection_status,
  DROP COLUMN IF EXISTS last_tested_at,
  DROP COLUMN IF EXISTS last_error,
  DROP COLUMN IF EXISTS capabilities,
  DROP COLUMN IF EXISTS updated_by;

-- vault.secrets entries are deliberately retained for manual review/cleanup.
