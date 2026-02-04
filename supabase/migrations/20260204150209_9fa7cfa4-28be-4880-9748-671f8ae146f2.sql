-- Tabel voor pending invitations (projectkoppelingen vóór acceptatie)
CREATE TABLE public.pending_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  project_ids UUID[] DEFAULT '{}',
  invited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: alleen admins kunnen pending invitations beheren
ALTER TABLE pending_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view pending invitations"
  ON pending_invitations FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Admins can insert pending invitations"
  ON pending_invitations FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Admins can update pending invitations"
  ON pending_invitations FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Admins can delete pending invitations"
  ON pending_invitations FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- Trigger functie om projecten te koppelen na signup via invitation
CREATE OR REPLACE FUNCTION public.handle_new_user_from_invite()
RETURNS TRIGGER AS $$
DECLARE
  pending_record RECORD;
BEGIN
  -- Check of er een pending invitation is voor deze email
  SELECT * INTO pending_record 
  FROM public.pending_invitations 
  WHERE email = NEW.email;
  
  IF pending_record IS NOT NULL THEN
    -- Wijs 'user' rol toe
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
    
    -- Koppel projecten
    IF pending_record.project_ids IS NOT NULL AND array_length(pending_record.project_ids, 1) > 0 THEN
      INSERT INTO public.customer_projects (user_id, project_id, created_by)
      SELECT NEW.id, unnest(pending_record.project_ids), pending_record.invited_by
      ON CONFLICT DO NOTHING;
    END IF;
    
    -- Verwijder pending invitation
    DELETE FROM public.pending_invitations WHERE email = NEW.email;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger op auth.users voor nieuwe gebruikers
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_from_invite();