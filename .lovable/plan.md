

# Globale Correctiefactor (hours_factor) Toevoegen

De per-dag urencorrectie is al gebouwd en werkt. Dit voegt een **extra** globale factor toe die bovenop de dagelijkse waarden wordt toegepast.

---

## Wat verandert er

### Database
- Nieuw veld `hours_factor` (NUMERIC, default 1.0) op de `projects` tabel
- Voorbeeld: factor 0.8 betekent dat alle uren met 80% worden vermenigvuldigd

### useLoggedTime Hook
- Na het ophalen van de dagdata (met eventuele per-dag correcties) wordt alles vermenigvuldigd met `hours_factor`
- Prioriteit: `corrected_seconds` -> `total_seconds`, daarna x `hours_factor`

### Admin UI (MappingTool)
- Nieuw invoerveld in de financiele sectie: "Globale urenfactor"
- Uitleg: "Factor waarmee alle gelogde uren worden vermenigvuldigd (1.0 = geen aanpassing, 0.8 = 20% minder)"

### ProjectDialog (Admin)
- Optioneel: hours_factor invoerveld bij project aanmaken/bewerken

---

## Technische Details

### Bestanden die wijzigen

| Bestand | Wijziging |
|---|---|
| `supabase/migrations/xxx.sql` | `ALTER TABLE projects ADD COLUMN hours_factor NUMERIC DEFAULT 1.0` |
| `src/types/database.ts` | `hours_factor` toevoegen aan `DBProject` en `DBProjectPublic` |
| `src/hooks/useLoggedTime.ts` | Nieuwe parameter `hoursFactor`, vermenigvuldigen na aggregatie |
| `src/components/Dashboard/MappingTool.tsx` | Invoerveld voor hours_factor in financiele sectie |
| `src/pages/Dashboard.tsx` | `hoursFactor` doorgeven aan useLoggedTime |

### Berekening
```text
effectieve_uren_per_dag = (corrected_seconds ?? total_seconds) * hours_factor / 3600
```

De globale factor werkt als aanvulling op de per-dag correcties - niet als vervanging.
