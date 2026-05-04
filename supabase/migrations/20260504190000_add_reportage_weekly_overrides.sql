-- Aggregated Excel correction layer for historical Triple Tree reportages.
-- Raw BasiCall records remain untouched; this table stores non-PII weekly
-- report metrics imported from approved Excel workbooks.

CREATE TABLE IF NOT EXISTS public.reportage_weekly_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 53),
  template TEXT NOT NULL CHECK (
    template IN ('outbound_standard', 'inbound_retention', 'inbound_service', 'flat')
  ),
  source_file TEXT NOT NULL,
  source_sheet TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  daily_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_hash TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by TEXT,
  CONSTRAINT reportage_weekly_overrides_unique_week UNIQUE (project_id, year, week_number)
);

CREATE INDEX IF NOT EXISTS idx_reportage_weekly_overrides_project_year
  ON public.reportage_weekly_overrides(project_id, year, week_number);

ALTER TABLE public.reportage_weekly_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and assigned users can view reportage overrides"
  ON public.reportage_weekly_overrides;

CREATE POLICY "Admins and assigned users can view reportage overrides"
ON public.reportage_weekly_overrides
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'superadmin'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.customer_projects cp
    WHERE cp.project_id = reportage_weekly_overrides.project_id
      AND cp.user_id = auth.uid()
  )
);

COMMENT ON TABLE public.reportage_weekly_overrides IS
  'Auditbare aggregaat-correctielaag voor Excel rapportages. Bevat geen raw BasiCall PII en wijzigt call_records niet.';

COMMENT ON COLUMN public.reportage_weekly_overrides.metrics IS
  'Weektotalen uit de bronrapportage, zoals aantallen, jaarwaarde, conversies, uren en service metrics.';

COMMENT ON COLUMN public.reportage_weekly_overrides.daily_metrics IS
  'Dagcellen uit de bronrapportage waar beschikbaar, keyed by Nederlandse weekdag.';

COMMENT ON COLUMN public.reportage_weekly_overrides.result_rows IS
  'Flat-template resultaatrijen uit Excel: label/type/count/percentage.';
