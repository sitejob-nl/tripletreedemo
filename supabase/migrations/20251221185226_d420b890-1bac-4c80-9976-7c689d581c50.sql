-- Stap 2: Update RLS policies voor user_roles zodat superadmins ook toegang hebben
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins and superadmins can view all roles" ON public.user_roles
  FOR SELECT USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin')
  );

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Admins and superadmins can insert roles" ON public.user_roles
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin')
  );

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins and superadmins can update roles" ON public.user_roles
  FOR UPDATE USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin')
  );

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins and superadmins can delete roles" ON public.user_roles
  FOR DELETE USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin')
  );

-- Update project policies voor superadmins
DROP POLICY IF EXISTS "Admins can insert projects" ON public.projects;
CREATE POLICY "Admins and superadmins can insert projects" ON public.projects
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin')
  );

DROP POLICY IF EXISTS "Admins can update projects" ON public.projects;
CREATE POLICY "Admins and superadmins can update projects" ON public.projects
  FOR UPDATE USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin')
  );

DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;
CREATE POLICY "Admins and superadmins can delete projects" ON public.projects
  FOR DELETE USING (
    has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'superadmin')
  );