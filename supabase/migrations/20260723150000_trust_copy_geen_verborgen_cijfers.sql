-- Trustlaag-copy vertelde dat cijfers "tijdelijk verborgen" of "niet getoond" worden,
-- maar enforcement staat overal uit: er wordt niets verborgen. De banner beloofde dus
-- iets dat niet gebeurt (QA-rapport 23-07-2026, punt A6). Boodschappen zeggen nu
-- "kunnen nog wijzigen". Herschrijft evaluate_project_quality in-place zodat de rest
-- van de functie gegarandeerd ongewijzigd blijft, en werkt de openstaande issues bij.
-- Toegepast op live via MCP apply_migration op 23-07-2026 (trust_copy_geen_verborgen_cijfers).
DO $do$
DECLARE
  src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'evaluate_project_quality';

  src := replace(src, 'rapportcijfers zijn tijdelijk verborgen.', 'de cijfers kunnen nog wijzigen.');
  src := replace(src, 'De jaarwaarde wordt tijdelijk niet getoond omdat', 'De jaarwaarde kan nog wijzigen omdat');
  src := replace(src, 'de geraakte cijfers zijn tijdelijk verborgen.', 'de geraakte cijfers kunnen nog wijzigen.');
  src := replace(src, 'Uren en kosten zijn tijdelijk verborgen omdat', 'Uren en kosten kunnen nog wijzigen omdat');

  EXECUTE src;
END
$do$;

UPDATE public.data_quality_issues
SET public_message = replace(replace(replace(replace(public_message,
      'rapportcijfers zijn tijdelijk verborgen.', 'de cijfers kunnen nog wijzigen.'),
      'De jaarwaarde wordt tijdelijk niet getoond omdat', 'De jaarwaarde kan nog wijzigen omdat'),
      'de geraakte cijfers zijn tijdelijk verborgen.', 'de geraakte cijfers kunnen nog wijzigen.'),
      'Uren en kosten zijn tijdelijk verborgen omdat', 'Uren en kosten kunnen nog wijzigen omdat')
WHERE resolved_at IS NULL
  AND (public_message ILIKE '%tijdelijk verborgen%' OR public_message ILIKE '%tijdelijk niet getoond%');
