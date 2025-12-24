-- Verwijder de oude (incorrecte) unique constraint op alleen basicall_record_id
ALTER TABLE call_records DROP CONSTRAINT IF EXISTS call_records_basicall_record_id_key;

-- Maak een nieuwe composite unique constraint op (project_id, basicall_record_id)
-- Dit zorgt ervoor dat record_id's uniek zijn PER PROJECT
ALTER TABLE call_records ADD CONSTRAINT call_records_project_record_unique 
  UNIQUE (project_id, basicall_record_id);