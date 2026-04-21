-- Add opt-in report template per project.
-- NULL = legacy behavior (ReportMatrix/InboundReportMatrix/ServiceReportMatrix + current Excel export).
-- Admin sets a template explicitly to switch a project to the historical rapportage layout.
ALTER TABLE public.projects
  ADD COLUMN report_template text
  CHECK (report_template IN ('outbound_standard', 'inbound_retention', 'inbound_service', 'flat'));

COMMENT ON COLUMN public.projects.report_template IS 'Optional report template variant. NULL = legacy behavior (ReportMatrix/InboundReportMatrix/ServiceReportMatrix). Set by admin per project to match historical Excel rapportage layout.';
