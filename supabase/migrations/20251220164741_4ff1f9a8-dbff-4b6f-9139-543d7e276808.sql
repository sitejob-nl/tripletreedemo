-- 1. Project Configuratie Tabel
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_key TEXT UNIQUE NOT NULL,
  basicall_project_id INTEGER NOT NULL,
  basicall_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  hourly_rate DECIMAL(10,2) DEFAULT 35.00,
  vat_rate INTEGER DEFAULT 21,
  mapping_config JSONB DEFAULT '{
    "amount_col": "termijnbedrag", 
    "freq_col": "frequentie", 
    "reason_col": "opzegreden",
    "freq_map": {"maand": 12, "maandelijks": 12, "kwartaal": 4, "jaar": 1, "jaarlijks": 1, "eenmalig": 1, "mnd": 12},
    "sale_results": ["Sale", "Donateur", "Toezegging"]
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Call Records Tabel
CREATE TABLE public.call_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  basicall_record_id INTEGER UNIQUE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  beldatum DATE,
  beltijd TIME,
  gesprekstijd_sec INTEGER DEFAULT 0,
  resultaat TEXT,
  raw_data JSONB,
  week_number INTEGER,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexen voor snelle queries
CREATE INDEX idx_call_records_project ON public.call_records(project_id);
CREATE INDEX idx_call_records_beldatum ON public.call_records(beldatum);
CREATE INDEX idx_call_records_week ON public.call_records(week_number);

-- 3. Sync Logs Tabel
CREATE TABLE public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('running', 'success', 'failed')),
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  sync_from TIMESTAMPTZ,
  sync_to TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Read for authenticated users
CREATE POLICY "Projects leesbaar voor dashboard" ON public.projects 
  FOR SELECT TO authenticated USING (true);
  
CREATE POLICY "Call records leesbaar voor dashboard" ON public.call_records 
  FOR SELECT TO authenticated USING (true);
  
CREATE POLICY "Sync logs leesbaar voor dashboard" ON public.sync_logs 
  FOR SELECT TO authenticated USING (true);

-- Demo projecten toevoegen
INSERT INTO public.projects (name, project_key, basicall_project_id, basicall_token, hourly_rate, mapping_config)
VALUES 
  ('Hersenstichting', 'hersenstichting', 1001, 'placeholder_token', 35.00, 
   '{"amount_col": "Nbedrag", "freq_col": "Ntermijn", "freq_map": {"maand": 12, "jaar": 1, "kwartaal": 4, "eenmalig": 1}, "sale_results": ["Sale", "Donateur"]}'::jsonb),
  ('ANBO', 'anbo', 1002, 'placeholder_token', 32.50,
   '{"amount_col": "bedrag", "freq_col": "Frequentie", "freq_map": {"maand": 12, "jaar": 1, "kwartaal": 4}, "sale_results": ["Sale"]}'::jsonb),
  ('CliniClowns', 'cliniclowns', 1003, 'placeholder_token', 30.00,
   '{"amount_col": "DonatieBedrag", "freq_col": "Frequentie", "freq_map": {"mnd": 12, "jaar": 1, "eenmalig": 1}, "sale_results": ["Donateur"]}'::jsonb);