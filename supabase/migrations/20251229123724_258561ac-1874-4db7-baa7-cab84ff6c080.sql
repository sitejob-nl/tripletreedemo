-- Create customer_projects linking table
CREATE TABLE public.customer_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  UNIQUE(user_id, project_id)
);

-- Enable RLS
ALTER TABLE public.customer_projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies for customer_projects
CREATE POLICY "Admins and superadmins can view all customer_projects"
ON public.customer_projects
FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Admins and superadmins can insert customer_projects"
ON public.customer_projects
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Admins and superadmins can delete customer_projects"
ON public.customer_projects
FOR DELETE
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Customers can view own project links"
ON public.customer_projects
FOR SELECT
USING (user_id = auth.uid());

-- Update projects RLS: Replace the open SELECT policy with role-based access
DROP POLICY IF EXISTS "Projects leesbaar voor dashboard" ON public.projects;

CREATE POLICY "Users can view projects based on role or assignment"
ON public.projects
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'superadmin') OR
  EXISTS (
    SELECT 1 FROM public.customer_projects 
    WHERE customer_projects.project_id = projects.id 
    AND customer_projects.user_id = auth.uid()
  )
);

-- Update call_records RLS: Replace the open SELECT policy with role-based access
DROP POLICY IF EXISTS "Call records leesbaar voor dashboard" ON public.call_records;

CREATE POLICY "Users can view call_records based on role or project assignment"
ON public.call_records
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'superadmin') OR
  EXISTS (
    SELECT 1 FROM public.customer_projects 
    WHERE customer_projects.project_id = call_records.project_id 
    AND customer_projects.user_id = auth.uid()
  )
);