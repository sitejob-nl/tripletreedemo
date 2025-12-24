-- Voeg project_type kolom toe aan projects tabel
ALTER TABLE projects 
ADD COLUMN project_type TEXT DEFAULT 'outbound';

-- Voeg check constraint toe
ALTER TABLE projects
ADD CONSTRAINT projects_project_type_check 
CHECK (project_type IN ('outbound', 'inbound'));

-- Update bestaande inbound projecten op basis van naam
UPDATE projects 
SET project_type = 'inbound' 
WHERE LOWER(name) LIKE '%inbound%' 
   OR LOWER(project_key) LIKE '%inbound%';