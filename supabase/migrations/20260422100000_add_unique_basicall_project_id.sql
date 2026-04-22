-- Prevent duplicate BasiCall project IDs in public.projects.
-- Sync dedupe works on (basicall_record_id, project_id) so without this
-- constraint two rows with the same basicall_project_id would pull the
-- same records twice — one copy per project_id.
ALTER TABLE public.projects
  ADD CONSTRAINT projects_basicall_project_id_key UNIQUE (basicall_project_id);
