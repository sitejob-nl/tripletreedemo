-- Verwijder de vorige trigger
DROP TRIGGER IF EXISTS trigger_process_beldatum ON call_records;
DROP FUNCTION IF EXISTS process_beldatum();
DROP FUNCTION IF EXISTS convert_european_date();

-- Verwijder de onnodige raw kolom
ALTER TABLE call_records DROP COLUMN IF EXISTS beldatum_raw;

-- Nieuwe aanpak: Wijzig de DateStyle voor deze database sessies
-- Dit zorgt ervoor dat PostgreSQL DD-MM-YYYY formaat accepteert

-- Maak een trigger die de datum converteert voordat deze wordt opgeslagen
-- We moeten een andere aanpak gebruiken: de datum als TEXT ontvangen

-- Aangezien beldatum al een DATE type is, kunnen we geen trigger gebruiken
-- die het formaat wijzigt voordat PostgreSQL het probeert te parsen.

-- De enige oplossing is om de VPS de datum in het juiste formaat te laten sturen
-- OF we maken een nieuwe TEXT kolom waar de VPS naar schrijft

-- Laten we de kolom tijdelijk veranderen naar TEXT en dan een trigger maken
-- die het converteert naar een aparte DATE kolom

-- Stap 1: Hernoem de huidige kolom
ALTER TABLE call_records RENAME COLUMN beldatum TO beldatum_date;

-- Stap 2: Maak een nieuwe TEXT kolom met de originele naam
ALTER TABLE call_records ADD COLUMN beldatum text;

-- Stap 3: Kopieer bestaande data naar de nieuwe kolom (als ISO formaat)
UPDATE call_records SET beldatum = beldatum_date::text WHERE beldatum_date IS NOT NULL;

-- Stap 4: Maak trigger die bij INSERT/UPDATE de TEXT converteert naar DATE
CREATE OR REPLACE FUNCTION public.sync_beldatum_to_date()
RETURNS TRIGGER AS $$
DECLARE
  date_parts text[];
BEGIN
  IF NEW.beldatum IS NOT NULL AND NEW.beldatum != '' THEN
    -- Check of het DD-MM-YYYY formaat is
    IF NEW.beldatum ~ '^\d{1,2}-\d{1,2}-\d{4}$' THEN
      date_parts := string_to_array(NEW.beldatum, '-');
      NEW.beldatum_date := (date_parts[3] || '-' || lpad(date_parts[2], 2, '0') || '-' || lpad(date_parts[1], 2, '0'))::date;
    ELSIF NEW.beldatum ~ '^\d{4}-\d{2}-\d{2}' THEN
      -- Al in ISO formaat
      NEW.beldatum_date := NEW.beldatum::date;
    ELSE
      -- Probeer standaard parsing
      BEGIN
        NEW.beldatum_date := NEW.beldatum::date;
      EXCEPTION WHEN OTHERS THEN
        NEW.beldatum_date := NULL;
      END;
    END IF;
  ELSE
    NEW.beldatum_date := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trigger_sync_beldatum
  BEFORE INSERT OR UPDATE ON call_records
  FOR EACH ROW
  EXECUTE FUNCTION sync_beldatum_to_date();