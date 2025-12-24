-- Trigger functie voor automatische datum conversie van DD-MM-YYYY naar YYYY-MM-DD
CREATE OR REPLACE FUNCTION public.convert_european_date()
RETURNS TRIGGER AS $$
DECLARE
  date_parts text[];
BEGIN
  -- Controleer of beldatum niet null is en in text formaat DD-MM-YYYY
  IF NEW.beldatum IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Probeer te detecteren of het in DD-MM-YYYY formaat is
  -- Dit gebeurt wanneer de dag > 12 is (dan weten we zeker dat het DD-MM-YYYY is)
  -- Of als de datum als text binnenkomt
  BEGIN
    -- Als de datum al correct is, gewoon doorgaan
    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    -- Bij een fout, probeer te converteren
    NULL;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Maak een trigger die VOOR insert/update de datum controleert
-- We gebruiken een andere aanpak: een text kolom voor raw datum input
-- en dan converteren we het naar de date kolom

-- Voeg een tijdelijke kolom toe voor de raw datum string
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS beldatum_raw text;

-- Maak een nieuwe trigger functie die de raw datum converteert
CREATE OR REPLACE FUNCTION public.process_beldatum()
RETURNS TRIGGER AS $$
DECLARE
  date_parts text[];
  day_part text;
  month_part text;
  year_part text;
BEGIN
  -- Als beldatum_raw is gezet, gebruik die voor conversie
  IF NEW.beldatum_raw IS NOT NULL AND NEW.beldatum_raw != '' THEN
    -- Check of het DD-MM-YYYY formaat is
    IF NEW.beldatum_raw ~ '^\d{1,2}-\d{1,2}-\d{4}$' THEN
      date_parts := string_to_array(NEW.beldatum_raw, '-');
      day_part := lpad(date_parts[1], 2, '0');
      month_part := lpad(date_parts[2], 2, '0');
      year_part := date_parts[3];
      
      -- Converteer naar YYYY-MM-DD en zet in beldatum
      NEW.beldatum := (year_part || '-' || month_part || '-' || day_part)::date;
    ELSE
      -- Probeer direct te parsen (misschien al in correct formaat)
      BEGIN
        NEW.beldatum := NEW.beldatum_raw::date;
      EXCEPTION WHEN OTHERS THEN
        -- Bij fout, laat beldatum leeg
        NEW.beldatum := NULL;
      END;
    END IF;
    
    -- Clear de raw kolom na verwerking
    NEW.beldatum_raw := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Maak de trigger
DROP TRIGGER IF EXISTS trigger_process_beldatum ON call_records;
CREATE TRIGGER trigger_process_beldatum
  BEFORE INSERT OR UPDATE ON call_records
  FOR EACH ROW
  EXECUTE FUNCTION process_beldatum();