-- Drop the overly permissive sync_jobs INSERT policy
DROP POLICY IF EXISTS "Authenticated users can insert sync_jobs" ON public.sync_jobs;

-- Create a more restrictive policy: only admins and superadmins can create sync jobs
CREATE POLICY "Admins and superadmins can insert sync_jobs"
ON public.sync_jobs
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'superadmin'::app_role)
);

-- Add UPDATE policy for sync_jobs (needed for status updates by the sync function)
-- Using service role for edge functions, but admins should also be able to update
CREATE POLICY "Admins and superadmins can update sync_jobs"
ON public.sync_jobs
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'superadmin'::app_role)
);

-- Add DELETE policy for sync_jobs (cleanup by admins)
CREATE POLICY "Admins and superadmins can delete sync_jobs"
ON public.sync_jobs
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR 
  public.has_role(auth.uid(), 'superadmin'::app_role)
);