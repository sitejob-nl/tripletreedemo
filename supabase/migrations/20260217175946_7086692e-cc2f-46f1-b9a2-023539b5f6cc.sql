
-- Urencorrectie kolommen toevoegen aan daily_logged_time
ALTER TABLE public.daily_logged_time 
  ADD COLUMN IF NOT EXISTS corrected_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS corrected_by UUID,
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS correction_note TEXT;

-- RLS policy voor UPDATE door admins op daily_logged_time
CREATE POLICY "Admins can update logged time"
  ON public.daily_logged_time FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) 
      OR has_role(auth.uid(), 'superadmin'::app_role));
