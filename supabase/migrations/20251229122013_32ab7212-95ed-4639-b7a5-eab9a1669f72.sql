-- Update all call_records with correct ISO-8601 week numbers based on beldatum_date
UPDATE call_records
SET week_number = EXTRACT(WEEK FROM beldatum_date)::INTEGER
WHERE beldatum_date IS NOT NULL;