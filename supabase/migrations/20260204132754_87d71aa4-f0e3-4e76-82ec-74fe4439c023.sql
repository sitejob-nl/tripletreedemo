-- ========================================
-- SECURITY FIX 1: Verscherp sync_logs RLS
-- ========================================
DROP POLICY IF EXISTS "Sync logs leesbaar voor dashboard" ON sync_logs;

CREATE POLICY "Only admins can view sync_logs"
  ON sync_logs FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'superadmin'::app_role)
  );

-- ========================================
-- SECURITY FIX 2: Maak publieke projects view
-- Dit verbergt de basicall_token voor niet-admins
-- ========================================
CREATE OR REPLACE VIEW public.projects_public
WITH (security_invoker = true) AS
  SELECT 
    id,
    name,
    project_key,
    basicall_project_id,
    is_active,
    hourly_rate,
    vat_rate,
    project_type,
    mapping_config,
    created_at,
    updated_at
  FROM public.projects;
-- NOTE: basicall_token is bewust NIET opgenomen in deze view