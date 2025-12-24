-- Verwijder de composite constraint
ALTER TABLE call_records DROP CONSTRAINT IF EXISTS call_records_project_record_unique;

-- Herstel de originele single-column constraint die de VPS verwacht
ALTER TABLE call_records ADD CONSTRAINT call_records_basicall_record_id_key 
  UNIQUE (basicall_record_id);