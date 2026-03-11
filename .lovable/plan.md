

# Optimalisaties doorvoeren

Vijf gerichte wijzigingen, geen nieuwe bestanden. De `types.ts` heeft al de juiste RPC-types (eerder bijgewerkt).

## 1. `src/App.tsx` — regel 24
`staleTime: 1000` → `staleTime: 5 * 60 * 1000`

## 2. `src/hooks/useKPIAggregates.ts`
- **Regel 3**: Verwijder `import { parseDutchFloat } from '@/lib/dataProcessing';`
- **Regels 85-139**: Vervang volledige `annualValueQuery` met RPC-call naar `get_project_annual_value` (geen client-side berekening meer)

## 3. `src/integrations/supabase/types.ts`
Al correct — bevat reeds `get_project_annual_value` en een enkele `get_project_kpi_totals` definitie. Geen wijzigingen nodig.

## 4. Console.logs verwijderen
| Bestand | Regel | Inhoud |
|---------|-------|--------|
| `useAllCallRecordsForAnalysis.ts` | 65 | `[useAllCallRecordsForAnalysis] Fetched` |
| `useCallRecords.ts` | 217 | `[useAvailableWeeks] projectId=` |
| `useGeocoding.ts` | 63 | `Geocoding ${citiesToFetch.length}` |
| `useGeocoding.ts` | 87 | `Geocoded ${Object.keys(newCoords).length}` |
| `Dashboard.tsx` | 132 | `[ProjectSwitch] Switched to:` |

## 5. `supabase/functions/sync-project/index.ts` — regel 1
Deprecation commentaar toevoegen vóór de eerste import.

