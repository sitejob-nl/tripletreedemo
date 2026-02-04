
# Plan: Analyse Views Volledige Dataset Geven (100 → Alle Records)

## Probleem
De analyse tabs (Geografisch, Belpogingen, Resultaten, Tijd) tonen statistieken gebaseerd op slechts **100 records** terwijl er **2600+ records** bestaan voor projecten zoals STC giftgevers.

## Root Cause
```
Dashboard.tsx regel 42:   const [dashboardPageSize, setDashboardPageSize] = useState(100);
Dashboard.tsx regel 70-78: useCallRecords(..., { pageSize: dashboardPageSize })
Dashboard.tsx regel 744-756: <GeographicAnalysis data={processedData} /> etc.
```

De analyse componenten ontvangen `processedData`, wat slechts de gepagineerde subset is (100 records). Voor correcte statistieken zoals conversieratio's, geografische spreiding en tijdsanalyse heb je **alle** data nodig.

## Architectuur Beslissing
Er zijn twee benaderingen:

### Optie A: Server-side Aggregatie (Aanbevolen voor grote datasets)
- Maak RPC functies voor elke analyse (geografische stats, attempt stats, etc.)
- Voordelen: Schaalbaar, geen memory issues bij 100k+ records
- Nadelen: Meer database functies nodig, minder flexibel

### Optie B: Client-side met Volledige Fetch voor Analyse (Sneller te implementeren)
- Maak een aparte hook `useAllCallRecords` die ALLE records ophaalt met paginatie
- Alleen gebruiken voor analyse views (niet voor de hoofdtabel)
- Voordelen: Snel te bouwen, flexibel
- Nadelen: Memory-intensief bij zeer grote datasets (>10k records)

**Gekozen: Optie B** - omdat je projecten typisch 1000-5000 records per week hebben, en dit sneller te implementeren is.

## Implementatie

### 1. Nieuwe hook: `useAllCallRecordsForAnalysis`
Bestand: `src/hooks/useAllCallRecordsForAnalysis.ts`

```typescript
// Haalt ALLE records op via batch pagination (1000 per batch)
// Gebruikt voor analyse views waar volledige dataset nodig is
export const useAllCallRecordsForAnalysis = (
  project: DBProject | undefined,
  weekYearValue: string | 'all'
) => {
  return useQuery({
    queryKey: ['all_call_records_analysis', project?.id, weekYearValue],
    queryFn: async () => {
      if (!project) return [];
      
      const allRecords = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('call_records')
          .select('*')
          .eq('project_id', project.id)
          // + week filter
          .range(offset, offset + batchSize - 1);
          
        if (error) throw error;
        if (data?.length > 0) {
          allRecords.push(...data);
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      
      // Process records met mapping_config
      return allRecords.map(record => processRecord(record, project.mapping_config));
    },
    enabled: !!project?.id,
    staleTime: 5 * 60 * 1000, // 5 min cache (analyse data verandert niet snel)
  });
};
```

### 2. Dashboard.tsx: Aparte data voor analyse
```typescript
// Bestaande gepagineerde data voor tabel
const { data: callRecords = [] } = useCallRecords(currentProject, { 
  weekYearValue, page, pageSize 
});

// Nieuwe: volledige data alleen voor analyse views
const { data: allCallRecordsForAnalysis = [], isLoading: analysisLoading } = 
  useAllCallRecordsForAnalysis(
    currentProject,
    selectedWeek === 'all' ? 'all' : String(selectedWeek)
  );

// Analyse componenten krijgen de volledige dataset
<CallAttemptsAnalysis data={allCallRecordsForAnalysis} />
<GeographicAnalysis data={allCallRecordsForAnalysis} />
// etc.
```

### 3. Loading state voor analyse
Toon loading indicator in analyse tabs terwijl volledige dataset wordt opgehaald.

## Bestanden die worden aangepast/gecreëerd

| Bestand | Actie |
|---------|-------|
| `src/hooks/useAllCallRecordsForAnalysis.ts` | **Nieuw** - hook voor volledige dataset |
| `src/pages/Dashboard.tsx` | **Wijzig** - gebruik nieuwe hook voor analyse views |

## Verwacht Resultaat
- Analyse tabs tonen statistieken over ALLE records (2600+ voor STC)
- Hoofdtabel blijft gepagineerd (snel en memory-efficiënt)
- Loading indicator tijdens ophalen volledige dataset

## Risico's
- Bij projecten met >10.000 records kan dit traag worden
- Als dat voorkomt, upgraden we naar server-side aggregatie (Optie A)

## Performance Optimalisatie
- `staleTime: 5 min` voorkomt onnodige refetches
- Query key bevat week filter, dus cache is per week
- Analyse data wordt alleen opgehaald als je naar analyse tab navigeert (lazy loading optioneel)
