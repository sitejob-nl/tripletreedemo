-- Create function to update timestamps if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create sync_jobs table for the "remote control" sync system
CREATE TABLE public.sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  records_synced INTEGER DEFAULT 0,
  log_message TEXT,
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all sync jobs
CREATE POLICY "Authenticated users can read sync_jobs" 
ON public.sync_jobs 
FOR SELECT 
TO authenticated 
USING (true);

-- Authenticated users can insert sync jobs
CREATE POLICY "Authenticated users can insert sync_jobs" 
ON public.sync_jobs 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_sync_jobs_updated_at
BEFORE UPDATE ON public.sync_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for sync_jobs
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_jobs;