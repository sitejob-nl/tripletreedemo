-- basicall_record_id is not unique per call — BasiCall reuses the same ID across
-- multiple afhandelingen of the same prospect (e.g. Mon: Terugbelafspraak, Wed: Sale).
-- Composite unique on (basicall_record_id, project_id, beldatum_date) lets us store
-- each afhandeling as a separate row while staying idempotent for same-day re-syncs.
ALTER TABLE public.call_records
  DROP CONSTRAINT call_records_project_record_unique;

ALTER TABLE public.call_records
  ADD CONSTRAINT call_records_project_record_date_unique
  UNIQUE (basicall_record_id, project_id, beldatum_date);
