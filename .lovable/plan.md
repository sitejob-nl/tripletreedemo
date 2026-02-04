
# Plan: Demo Account met Demo Project en Demo Data

## Samenvatting
Maak een volledig functioneel demo-account aan zodat potentiële klanten of stakeholders de dashboard functionaliteit kunnen ervaren zonder toegang tot echte klantdata. Dit omvat:
1. Een demo gebruikersaccount
2. Een demo project met realistische configuratie
3. Representatieve demo call records met diverse resultaattypes

---

## Onderdelen

### 1. Demo Project
Een nieuw project in de `projects` tabel met:
- **Naam**: "Demo Campagne"
- **project_key**: "demo"
- **project_type**: "outbound"
- **basicall_project_id**: 0 (geen echte sync)
- **basicall_token**: "demo-token" (placeholder)
- **hourly_rate**: 35.00
- **vat_rate**: 21
- **mapping_config**: Standaard configuratie voor donatie-campagne

### 2. Demo Data (Call Records)
Circa 200-250 realistische call records verdeeld over 4-6 weken:
- **25% Sales** (Maandelijks, Jaarlijks, Eenmalig) - met bedragen €5-€50
- **35% Negatief met reden** (Financiële reden, Ander goed doel, Geen interesse)
- **15% Negatief zonder reden** (Geen gehoor, Voicemail, Max pogingen)
- **25% Overig** (Terugbelafspraak, Blacklisted, etc.)

Inclusief:
- Gesprekstijden (30-600 seconden)
- Locatiedata (Nederlandse steden) voor de geografische kaart
- Belpogingen (1-6) voor de belpogingen-analyse
- Frequenties en bedragen voor jaarwaarde-berekening

### 3. Demo Gebruikersaccount
- **Email**: demo@tripletree.nl (of door jou gekozen)
- **Wachtwoord**: Te bepalen door admin
- **Rol**: "user" (klantrol)
- **Gekoppeld project**: Alleen "Demo Campagne"

---

## Implementatie Stappen

### Stap 1: Demo Project aanmaken
SQL of via Admin UI een project toevoegen:

```sql
INSERT INTO projects (
  name, 
  project_key, 
  basicall_project_id, 
  basicall_token,
  hourly_rate,
  vat_rate,
  project_type,
  mapping_config,
  is_active
) VALUES (
  'Demo Campagne',
  'demo',
  0,
  'demo-token-niet-synchroniseren',
  35.00,
  21,
  'outbound',
  '{
    "amount_col": "termijnbedrag",
    "freq_col": "frequentie",
    "reason_col": "opzegreden",
    "freq_map": {
      "maand": 12, "maandelijks": 12, "mnd": 12, "m": 12,
      "kwartaal": 4, "k": 4,
      "jaar": 1, "jaarlijks": 1, "j": 1,
      "eenmalig": 1, "e": 1
    },
    "sale_results": ["Maandelijks", "Jaarlijks", "Eenmalig", "Sale", "Donateur"]
  }'::jsonb,
  true
);
```

### Stap 2: Demo Data Seed Script
Een seed script of SQL die 200+ demo records invoegt:

```sql
-- Voorbeeld: eerste 3 demo records (volledige script wordt gegenereerd)
INSERT INTO call_records (
  basicall_record_id,
  project_id,
  beldatum,
  beltijd,
  gesprekstijd_sec,
  resultaat,
  week_number,
  raw_data
) 
SELECT 
  seq as basicall_record_id,
  (SELECT id FROM projects WHERE project_key = 'demo') as project_id,
  date_value as beldatum,
  time_value as beltijd,
  duration_sec as gesprekstijd_sec,
  result_name as resultaat,
  EXTRACT(WEEK FROM date_value::date)::integer as week_number,
  raw_data::jsonb
FROM (
  VALUES 
    (1, '2026-01-05', '09:15:00', 245, 'Maandelijks', 
     '{"termijnbedrag": "10,00", "frequentie": "maand", "bc_belpogingen": 2, "woonplaats": "Amsterdam", "bc_agentnaam": "Demo Agent"}'),
    (2, '2026-01-05', '10:30:00', 180, 'Financiele reden', 
     '{"opzegreden": "Geen geld momenteel", "bc_belpogingen": 1, "woonplaats": "Rotterdam", "bc_agentnaam": "Demo Agent"}'),
    -- ... meer records
) AS data(seq, date_value, time_value, duration_sec, result_name, raw_data);
```

### Stap 3: Demo Account aanmaken
Via de Admin UI (/admin > Klanten > Nieuwe klant):
- Email: demo@tripletree.nl
- Wachtwoord: DemoAccount2026!
- Project koppelen: Demo Campagne

OF via edge function `create-customer`.

---

## Data Distributie per Week

| Week | Datum Range | Records | Sales | Negatief | Overig |
|------|-------------|---------|-------|----------|--------|
| 2 | 6-10 jan | ~40 | 10 | 20 | 10 |
| 3 | 13-17 jan | ~45 | 12 | 22 | 11 |
| 4 | 20-24 jan | ~42 | 11 | 21 | 10 |
| 5 | 27-31 jan | ~38 | 9 | 19 | 10 |
| 6 | 3-7 feb | ~35 | 8 | 18 | 9 |

## Locaties voor Geografische Kaart
Steden worden random verdeeld uit een lijst van 20 Nederlandse steden:
Amsterdam, Rotterdam, Den Haag, Utrecht, Eindhoven, Tilburg, Groningen, Almere, Breda, Nijmegen, Apeldoorn, Haarlem, Arnhem, Enschede, Amersfoort, Zaanstad, Haarlemmermeer, Zwolle, Leiden, Maastricht

---

## Voordelen
1. **Veilig**: Geen echte klantdata wordt getoond aan demo-gebruikers
2. **Representatief**: Alle dashboard-onderdelen werken (KPIs, grafieken, kaart, matrix)
3. **Makkelijk te resetten**: Data kan met SQL script worden verwijderd en opnieuw gegenereerd
4. **Onafhankelijk**: Geen sync met BasiCall nodig

## Benodigde Acties
1. SQL script uitvoeren voor project + data (of via code)
2. Demo account aanmaken via Admin UI
3. Testen dat alle dashboard componenten correct werken met demo data

---

## Technische Details

### Mapping Config voor Demo Project
```json
{
  "amount_col": "termijnbedrag",
  "freq_col": "frequentie", 
  "reason_col": "opzegreden",
  "freq_map": {
    "maand": 12, "maandelijks": 12, "mnd": 12,
    "kwartaal": 4,
    "jaar": 1, "jaarlijks": 1,
    "eenmalig": 1
  },
  "sale_results": ["Maandelijks", "Jaarlijks", "Eenmalig", "Sale", "Donateur"],
  "negative_reasoned": ["Financiele reden", "Ander goed doel", "Geen interesse"],
  "negative_unreasoned": ["Geen gehoor", "Voicemail/antwoordapparaat", "Max. belpogingen bereikt"]
}
```

### Raw Data Structuur per Record Type

**Sales (Maandelijks):**
```json
{
  "termijnbedrag": "10,00",
  "frequentie": "maand",
  "bc_belpogingen": 2,
  "woonplaats": "Amsterdam",
  "bc_agentnaam": "Demo Agent",
  "bc_result_naam": "Maandelijks"
}
```

**Negatief met reden:**
```json
{
  "opzegreden": "Financiële situatie",
  "bc_belpogingen": 3,
  "woonplaats": "Utrecht",
  "bc_agentnaam": "Demo Agent",
  "bc_result_naam": "Financiele reden"
}
```

**Voicemail/Geen gehoor:**
```json
{
  "bc_belpogingen": 6,
  "woonplaats": "Groningen",
  "bc_agentnaam": "Demo Agent",
  "bc_result_naam": "Voicemail/antwoordapparaat"
}
```
