-- Create daily_logged_time table for storing agent login time per day
CREATE TABLE public.daily_logged_time (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  date date NOT NULL,
  total_seconds integer NOT NULL DEFAULT 0,
  synced_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT daily_logged_time_pkey PRIMARY KEY (id),
  CONSTRAINT daily_logged_time_project_id_fkey 
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT daily_logged_time_unique_project_date UNIQUE (project_id, date)
);

-- Create indexes for efficient querying
CREATE INDEX idx_daily_logged_time_project_id ON public.daily_logged_time(project_id);
CREATE INDEX idx_daily_logged_time_date ON public.daily_logged_time(date);

-- Enable Row Level Security
ALTER TABLE public.daily_logged_time ENABLE ROW LEVEL SECURITY;

-- Admins and superadmins can view all logged time
CREATE POLICY "Admins can view all logged time"
ON public.daily_logged_time FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- Customers can view logged time for their own projects
CREATE POLICY "Customers can view own project logged time"
ON public.daily_logged_time FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM customer_projects
    WHERE customer_projects.project_id = daily_logged_time.project_id
    AND customer_projects.user_id = auth.uid()
  )
);