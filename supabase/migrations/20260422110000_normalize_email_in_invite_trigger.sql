-- Case-insensitive email match in the invite-completion trigger.
-- pending_invitations rows are stored lowercased by the create-customer edge
-- function, but Supabase auth doesn't guarantee that auth.users.email comes
-- back with the same casing. A case mismatch meant the trigger silently
-- skipped role assignment and project linking — the invited user ended up
-- logged in with zero permissions.
CREATE OR REPLACE FUNCTION public.handle_new_user_from_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  pending_record RECORD;
BEGIN
  SELECT * INTO pending_record
  FROM public.pending_invitations
  WHERE LOWER(email) = LOWER(NEW.email);

  IF pending_record IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;

    IF pending_record.project_ids IS NOT NULL AND array_length(pending_record.project_ids, 1) > 0 THEN
      INSERT INTO public.customer_projects (user_id, project_id, created_by)
      SELECT NEW.id, unnest(pending_record.project_ids), pending_record.invited_by
      ON CONFLICT DO NOTHING;
    END IF;

    DELETE FROM public.pending_invitations WHERE LOWER(email) = LOWER(NEW.email);
  END IF;

  RETURN NEW;
END;
$function$;
