

# Twee fixes: gecentraliseerde frequentie-detectie + week filter jaargrens bug

## Fix 1: `src/hooks/useReportMatrixData.ts` — calculateValuesFromRaw vervangen

**Huidige situatie**: Inline `calculateValuesFromRaw` (regels 7-74) doet eigen frequentie-detectie zonder `detectFrequencyFromConfig`. Return type mist `frequency_type`, `frequency_multiplier`, `frequency_matched_key`.

**Wijzigingen**:
- Verwijder de inline `calculateValuesFromRaw` (regels 7-74)
- Import `detectFrequencyFromConfig`, `FrequencyType` uit `@/lib/statsHelpers`
- Import `ProcessedDBCallRecordWithFreq` uit `./useCallRecords`
- Kopieer de `calculateValuesFromRaw` uit `useCallRecords.ts` (die `detectFrequencyFromConfig` gebruikt)
- Return type van de hook wordt `ProcessedDBCallRecordWithFreq[]` i.p.v. `ProcessedDBCallRecord[]`
- Map-functie uitbreiden met `frequency_type`, `frequency_multiplier`, `frequency_matched_key`
- `getDayName` en query logica blijven ongewijzigd

## Fix 2: Week filter jaargrens bug — 4 bestanden

In elk bestand het patroon met `dateFilter.year` jaargrenzen (`-01-01` / `-12-31`) vervangen door `dateFilter.startDate` / `dateFilter.endDate`. De `useDateFilter` hook berekent al de juiste ISO week grenzen.

| Bestand | Regels | Check op `dateFilter.year` verwijderen |
|---------|--------|---------------------------------------|
| `useCallRecords.ts` | 143-148 | `&& dateFilter.year !== null` + jaargrenzen |
| `useReportMatrixData.ts` | 127-131 | `&& dateFilter.year !== null` + jaargrenzen |
| `useAllCallRecordsForAnalysis.ts` | 38-42 | `&& dateFilter.year !== null` + jaargrenzen |
| `useKPIAggregates.ts` | 41-45 | `&& dateFilter.year !== null` + jaargrenzen |

**Nieuw patroon** (in alle 4):
```typescript
if (dateFilter.filterType === 'week' && dateFilter.weekNumber !== null) {
  query = query
    .eq('week_number', dateFilter.weekNumber)
    .gte('beldatum_date', dateFilter.startDate)
    .lte('beldatum_date', dateFilter.endDate);
}
```

## Samenvatting bestanden

| Bestand | Wijziging |
|---------|-----------|
| `src/hooks/useReportMatrixData.ts` | Vervang inline calc door gecentraliseerde versie + week filter fix |
| `src/hooks/useCallRecords.ts` | Alleen week filter fix (regel 143-148) |
| `src/hooks/useAllCallRecordsForAnalysis.ts` | Alleen week filter fix (regel 38-42) |
| `src/hooks/useKPIAggregates.ts` | Alleen week filter fix (regel 41-45) |

