

# Actieplan: Meeting Follow-up - Prioriteiten en Gaps

Dit plan analyseert de besproken punten uit de meeting en vergelijkt ze met de huidige implementatie. Per onderwerp wordt aangegeven wat er al werkt, wat er mist, en wat de prioriteit is.

---

## Status Overzicht

| Functionaliteit | Status | Prioriteit |
|---|---|---|
| Jaarwaarde/frequentie berekening | ~80% af, fixen nodig | HOOG |
| Configureerbare negatieve redenen (netto KPI) | Hardcoded, moet configureerbaar | HOOG |
| Handmatige urencorrectie per dag | Niet gebouwd | HOOG |
| Badges / te bellen restant | Niet gebouwd (API nodig) | HOOG |
| Afwijkend uurtarief per weekdag | Niet gebouwd | MIDDEL |
| Nachtelijke automatische sync | Infra staat, moet geactiveerd | MIDDEL |
| Inbound klantenservice (niet-financieel) | Niet gebouwd | MIDDEL |
| Globale correctiefactor uren | Niet gebouwd | LAAG |
| Steam connector | Toekomst | LAAG |
| Custom domein (app.triple3.nl) | DNS-instructies geven | LAAG |

---

## 1. Jaarwaarde / Frequentie Berekening Fixen (HOOG)

### Wat er al is
- Gecentraliseerde `detectFrequencyFromConfig()` in `statsHelpers.ts`
- Flexibele field parsing: checkt `frequency`, `frequentie`, `Frequentie` en `mappingConfig.freq_col`
- Numerieke multipliers (1, 4, 12) en tekstuele matching via `freq_map`
- Preview tool in MappingTool toont hoe records worden berekend

### Wat er mist
- **Frequentie uit resultaatnaam**: Als het resultaat "Machtiging per Maand" heet, moet dit als maandelijks (x12) worden herkend. Dit is een fallback die nog niet in `detectFrequencyFromConfig()` zit.
- **Inconsistentie**: ReportMatrix gebruikt `detectFrequency()` (legacy wrapper met lege freq_map) in plaats van `detectFrequencyFromConfig()` met de daadwerkelijke project freq_map. Dit veroorzaakt verkeerde frequentie-toewijzingen.

### Aanpak
1. ReportMatrix updaten om `detectFrequencyFromConfig()` te gebruiken met de project freq_map (wordt als prop doorgegeven)
2. Fallback toevoegen in `detectFrequencyFromConfig()` die ook de `resultaat`-naam parsed voor frequentie-keywords
3. Preview tool uitbreiden zodat admin direct ziet of de match correct is

---

## 2. Configureerbare Negatieve Redenen voor Netto KPI (HOOG)

### Wat er al is
- Hardcoded arrays `NEGATIVE_ARGUMENTATED`, `NEGATIVE_NOT_ARGUMENTATED`, en `UNREACHABLE_RESULTS` in `statsHelpers.ts`
- `categorizeNegativeResult()` en `isUnreachable()` functies

### Wat er mist
- Deze categorisatie is **niet per project configureerbaar**. De meeting benadrukt dat per klant/campagne moet kunnen worden ingesteld welke redenen meetellen in netto conversie.
- Er is geen plek in `MappingConfig` voor unreachable/negative configuratie.

### Aanpak
1. `MappingConfig` uitbreiden met:
   - `unreachable_results: string[]` - resultaten die niet meetellen (voor netto conversie)
   - `negative_argumentated: string[]` - beargumenteerde weigeringen
   - `negative_not_argumentated: string[]` - niet-beargumenteerde weigeringen
2. `isUnreachable()` en `categorizeNegativeResult()` aanpassen om per project te werken (config als parameter)
3. MappingTool UI uitbreiden met secties voor deze categorisering (zoals de bestaande resultaat-selectors)
4. Hardcoded arrays behouden als **defaults** voor nieuwe projecten
5. Database migratie: default waardes toevoegen aan bestaande mapping_configs

---

## 3. Handmatige Urencorrectie per Dag + Audit Trail (HOOG)

### Wat er al is
- `daily_logged_time` tabel met `project_id`, `date`, `total_seconds`
- `useLoggedTime` hook met dagelijkse breakdown per weekdag
- ReportMatrix gebruikt logged time voor investerings-berekeningen

### Wat er mist
- Geen UI om uren handmatig aan te passen
- Geen `corrected_seconds` of `correction_note` velden
- Geen audit trail (wie, wanneer, waarom)

### Aanpak
1. Database migratie - kolommen toevoegen aan `daily_logged_time`:

```text
corrected_seconds  INTEGER  (nullable, als NULL dan gebruik total_seconds)
corrected_by       UUID     (wie de correctie deed)
corrected_at       TIMESTAMPTZ
correction_note    TEXT     (reden van correctie)
```

2. RLS policy toevoegen voor UPDATE door admins
3. Nieuwe UI-component "Urencorrectie" in admin dashboard:
   - Tabel met per dag: originele uren, gecorrigeerde uren, verschil, notitie
   - Inline editing per dag
   - Visuele indicator als er een correctie actief is
4. `useLoggedTime` hook aanpassen: gebruik `corrected_seconds` als die gevuld is, anders `total_seconds`
5. Audit log tabel (optioneel): `hours_corrections_log` met alle wijzigingen

---

## 4. Badges / Te Bellen Restant (HOOG - afhankelijk van API)

### Wat er al is
- Niets - dit is een nieuw feature

### Wat er mist
- BasiCall API endpoint voor badges/restant is nog niet beschikbaar/gedocumenteerd
- UI component voor restant weergave

### Aanpak
1. **Eerst**: Afwachten tot BasiCall API endpoint beschikbaar is
2. Nieuw veld in `projects` tabel: `total_to_call` (optioneel, handmatig invulbaar als backup)
3. Sync engine uitbreiden met badges-endpoint zodra beschikbaar
4. KPI card toevoegen: "Restant te bellen" met voortgangsbalk
5. Als API niet beschikbaar: handmatig invoerveld in admin voor "totaal te bellen"

---

## 5. Afwijkend Uurtarief per Weekdag (MIDDEL)

### Wat er al is
- Enkelvoudig `hourly_rate` per project (in `projects` tabel)
- ReportMatrix berekent investering als `uren x uurtarief`

### Wat er mist
- Geen weekdag-specifiek tarief (bijv. zaterdag hoger tarief)

### Aanpak
1. `MappingConfig` uitbreiden met optioneel `weekday_rates`:

```text
weekday_rates: {
  maandag: 35,
  dinsdag: 35,
  woensdag: 35,
  donderdag: 35,
  vrijdag: 35,
  zaterdag: 45,
  zondag: 50
}
```

2. Als `weekday_rates` niet gezet is, valt het systeem terug op de standaard `hourly_rate`
3. ReportMatrix `calcInvestment()` aanpassen per dag
4. MappingTool UI: optionele sectie "Afwijkende tarieven per weekdag"

---

## 6. Nachtelijke Automatische Sync Activeren (MIDDEL)

### Wat er al is
- VPS sync script (Node.js) met incrementele sync
- `sync_jobs` tabel met status tracking
- Handmatige sync via admin UI (incl. bulk)
- `daily_logged_time` sync bij elke sync

### Wat er mist
- Cronjob op de VPS is nog niet geactiveerd
- Geen pg_cron of andere scheduler actief

### Aanpak
Dit is een **VPS configuratie taak**, niet een code-wijziging:
1. Cronjob instellen op VPS: `0 2 * * * node /path/to/sync-script.js`
2. Script moet alle actieve projecten doorlopen
3. Sync status zichtbaar in dashboard (al gebouwd via SyncStatus component)

---

## 7. Inbound Klantenservice Type (MIDDEL)

### Wat er al is
- `project_type: 'outbound' | 'inbound'` in database
- `InboundReportMatrix` component met retentie-specifieke KPI's
- Configureerbare retention/lost/partial results in MappingTool

### Wat er mist
- Inbound heeft nu alleen het "retentie/financieel" type
- **Klantenservice type** (niet-financieel): KPI = "afgehandeld" vs "niet afgehandeld" ratio, zonder geldwaarde

### Aanpak
1. `ProjectType` uitbreiden: `'outbound' | 'inbound_retention' | 'inbound_service'`
2. Nieuw component `ServiceReportMatrix` met:
   - Afgehandeld / niet-afgehandeld ratio
   - Geen jaarwaarde kolommen
   - Productiviteitsmetrieken (gesprekken per uur, etc.)
3. MappingTool: derde tab "Inbound (Service)" met aangepaste configuratie
4. Dashboard automatisch juiste matrix tonen op basis van project_type

---

## 8. Globale Correctiefactor voor Uren (LAAG)

### Aanpak
1. Optioneel veld `hours_factor` in `projects` tabel (default 1.0)
2. `useLoggedTime` hook: vermenigvuldig alle uren met factor
3. UI: simpele slider of input in MappingTool financieel sectie

---

## Aanbevolen Implementatievolgorde

```text
Fase 1 (deze sprint - kritisch voor correcte rapportage):
  1. Jaarwaarde/frequentie fix (ReportMatrix + resultaatnaam fallback)
  2. Configureerbare negatieve redenen
  3. Handmatige urencorrectie

Fase 2 (volgende sprint - uitbreiding):
  4. Afwijkend uurtarief per weekdag
  5. Badges/restant (zodra API beschikbaar)
  6. Nachtelijke sync activeren (VPS config)

Fase 3 (later - nice-to-have):
  7. Inbound klantenservice type
  8. Globale correctiefactor
  9. Steam connector (als API beschikbaar)
```

---

## Technische Details per Fase

### Database Migraties Fase 1

```sql
-- Urencorrectie kolommen
ALTER TABLE daily_logged_time 
  ADD COLUMN corrected_seconds INTEGER,
  ADD COLUMN corrected_by UUID,
  ADD COLUMN corrected_at TIMESTAMPTZ,
  ADD COLUMN correction_note TEXT;

-- RLS voor UPDATE op daily_logged_time
CREATE POLICY "Admins can update logged time"
  ON daily_logged_time FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) 
      OR has_role(auth.uid(), 'superadmin'::app_role));

-- INSERT policy voor sync engine (service role)
CREATE POLICY "Service role can insert logged time"
  ON daily_logged_time FOR INSERT
  WITH CHECK (true);
```

### Bestanden die Wijzigen in Fase 1

| Bestand | Wijziging |
|---|---|
| `src/types/database.ts` | MappingConfig uitbreiden met unreachable/negative arrays |
| `src/lib/statsHelpers.ts` | `isUnreachable()` en `categorizeNegativeResult()` config-aware maken |
| `src/components/Dashboard/ReportMatrix.tsx` | `detectFrequencyFromConfig()` met freq_map gebruiken |
| `src/components/Dashboard/MappingTool.tsx` | Nieuwe secties voor negatieve categorisering |
| `src/hooks/useLoggedTime.ts` | `corrected_seconds` ondersteuning |
| `src/components/Dashboard/HoursCorrection.tsx` | Nieuw component voor urencorrectie |
| `supabase/migrations/xxx.sql` | Kolommen + policies |

