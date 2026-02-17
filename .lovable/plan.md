

# Fase 2 Implementatie: Volgende Stappen

Nu Fase 1 is afgerond (frequentie fix, configureerbare redenen, urencorrectie), zijn dit de resterende items.

---

## Overzicht: Wat is AF vs Wat moet nog

### Afgerond (Fase 1)
- Jaarwaarde/frequentie berekening: detectie uit freq_map, numerieke waarden, EN resultaatnaam ("per maand")
- Configureerbare negatieve redenen: per project instelbaar via MappingTool (unreachable, beargumenteerd, niet-beargumenteerd)
- Handmatige urencorrectie per dag: tabel met origineel/gecorrigeerd/verschil/notitie, audit trail (wie, wanneer)
- useLoggedTime en ReportMatrix gebruiken gecorrigeerde uren waar beschikbaar

### Nog te bouwen

---

## 1. Afwijkend Uurtarief per Weekdag (MIDDEL)

Sommige campagnes draaien op zaterdag/zondag met een hoger uurtarief.

### Aanpak
1. MappingConfig uitbreiden met optioneel `weekday_rates` object
2. Als niet gezet: terugvallen op standaard `hourly_rate`
3. ReportMatrix `calcInvestment()` aanpassen: per dag het juiste tarief gebruiken
4. MappingTool UI: optionele sectie "Afwijkende tarieven per weekdag" met 7 invoervelden

### Bestanden
- `src/types/database.ts` - MappingConfig type uitbreiden
- `src/components/Dashboard/ReportMatrix.tsx` - calcInvestment per dag
- `src/components/Dashboard/InboundReportMatrix.tsx` - idem
- `src/components/Dashboard/MappingTool.tsx` - UI voor weekday rates
- `src/hooks/useExcelExport.ts` - export moet juiste tarieven gebruiken

---

## 2. Badges / Te Bellen Restant (HOOG - wacht op API)

Dit is een must voor klantenrapportage maar de BasiCall API endpoint is nog niet beschikbaar.

### Tijdelijke aanpak (handmatig)
1. Nieuw veld `total_to_call` toevoegen aan `projects` tabel (integer, nullable)
2. Admin kan dit handmatig invullen in ProjectDialog
3. KPI card "Voortgang" tonen: `aantal gebeld / total_to_call` als percentage

### Definitieve aanpak (zodra API beschikbaar)
1. Sync engine uitbreiden met badges-endpoint
2. Automatisch bijwerken bij elke sync

### Database migratie
```sql
ALTER TABLE projects ADD COLUMN total_to_call INTEGER;
```

### Bestanden
- `supabase/migrations/xxx.sql` - kolom toevoegen
- `src/components/Admin/ProjectDialog.tsx` - invoerveld
- `src/components/Dashboard/KPICardsSection.tsx` - voortgangskaart

---

## 3. Inbound Klantenservice Type (MIDDEL)

Momenteel ondersteunt inbound alleen het retentie/financiele type. Klantenservice (niet-financieel) mist.

### Aanpak
1. ProjectType uitbreiden: `'outbound' | 'inbound_retention' | 'inbound_service'`
2. Nieuw component `ServiceReportMatrix`:
   - Afgehandeld / niet-afgehandeld ratio
   - Geen jaarwaarde kolommen
   - Gesprekken per uur, gemiddelde gespreksduur
3. MappingTool: derde optie in project type selector
4. Dashboard: automatisch juiste matrix tonen

### Bestanden
- `src/types/database.ts` - ProjectType uitbreiden
- `src/components/Dashboard/ServiceReportMatrix.tsx` - nieuw component
- `src/components/Dashboard/MappingTool.tsx` - derde type optie
- `src/components/Dashboard/ReportViewSection.tsx` - routing naar juiste matrix
- `src/hooks/useExcelExport.ts` - service export formaat

---

## 4. Globale Correctiefactor voor Uren (LAAG)

Als alternatief voor per-dag correctie: een simpele vermenigvuldigingsfactor.

### Aanpak
1. Optioneel veld `hours_factor` in projects tabel (default 1.0)
2. useLoggedTime: vermenigvuldig alle uren met factor
3. MappingTool: slider of input in financiele sectie

### Database migratie
```sql
ALTER TABLE projects ADD COLUMN hours_factor NUMERIC DEFAULT 1.0;
```

---

## 5. Nachtelijke Sync Activeren (MIDDEL - VPS taak)

Dit is geen code-wijziging maar een VPS configuratie:

1. Cronjob instellen: `0 2 * * * node /path/to/sync-script.js`
2. Script loopt alle actieve projecten door
3. Sync status is al zichtbaar in dashboard (SyncStatus component)

---

## 6. Custom Domein (app.triple3.nl) - DNS Instructies

Stappen voor de klant/beheerder:
1. In Lovable: Settings > Custom Domains > `app.triple3.nl`
2. Bij domeinregistrar: CNAME record toevoegen dat wijst naar het Lovable domein
3. SSL wordt automatisch geregeld door Lovable

---

## Aanbevolen Implementatievolgorde

```text
Sprint 1 (direct):
  1. Afwijkend uurtarief per weekdag
  2. Badges/restant (handmatige versie)

Sprint 2 (daarna):
  3. Inbound klantenservice type
  4. Globale correctiefactor

Parallel / extern:
  5. Nachtelijke sync (VPS config)
  6. Custom domein (DNS)
  7. Badges via API (zodra beschikbaar)
  8. Steam connector (toekomst)
```

---

## Technische Details

### Database Migraties

```sql
-- Badges: total_to_call veld
ALTER TABLE projects ADD COLUMN total_to_call INTEGER;

-- Globale correctiefactor
ALTER TABLE projects ADD COLUMN hours_factor NUMERIC DEFAULT 1.0;
```

### MappingConfig Uitbreiding (weekday_rates)

```text
weekday_rates?: {
  maandag?: number;
  dinsdag?: number;
  woensdag?: number;
  donderdag?: number;
  vrijdag?: number;
  zaterdag?: number;
  zondag?: number;
}
```

Als een dag niet is ingesteld of weekday_rates ontbreekt, valt het systeem terug op de standaard hourly_rate van het project.

### ProjectType Uitbreiding

```text
Huidig:  'outbound' | 'inbound'
Nieuw:   'outbound' | 'inbound_retention' | 'inbound_service'
```

Backward compatible: bestaande 'inbound' projecten worden behandeld als 'inbound_retention'.

