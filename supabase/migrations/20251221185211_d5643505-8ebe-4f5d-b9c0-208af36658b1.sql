-- Stap 1: Voeg superadmin toe aan het bestaande app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';