

## Plan: Integratie daily_logged_time Tabel voor Kostenberekening

### Overzicht

De VPS sync script gaat nu ook de daadwerkelijke ingelogde tijd van agents ophalen via `Project.getIngelogdeTijden`. Dit is nauwkeuriger dan de gesommeerde gesprekstijd (`gesprekstijd_sec`) die nu wordt gebruikt. Ik ga:

1. De nieuwe database tabel aanmaken
2. RLS policies toevoegen
3. Een hook maken om deze data op te halen
4. Het Dashboard bijwerken om de echte kosten te berekenen

---

### Stap 1: Database Migratie

Nieuwe tabel `daily_logged_time` aanmaken:

```sql
CREATE TABLE public.daily_logged_time (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  date date NOT NULL,
  total_seconds integer NOT NULL DEFAULT 0,
  synced_at timestamp with time zone DEFAULT now(),
  
  CONSTRAINT daily_logged_time_pkey PRIMARY KEY (id),
  CONSTRAINT daily_logged_time_project_id_fkey 
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT daily_logged_time_unique_project_date UNIQUE (project_id, date)
);

CREATE INDEX idx_daily_logged_time_project_id ON public.daily_logged_time(project_id);
CREATE INDEX idx_daily_logged_time_date ON public.daily_logged_time(date);
```

**RLS Policies** (zelfde patroon als call_records):

```sql
ALTER TABLE public.daily_logged_time ENABLE ROW LEVEL SECURITY;

-- Admins en superadmins kunnen alles zien
CREATE POLICY "Admins can view all logged time"
ON public.daily_logged_time FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'superadmin'::app_role)
);

-- Customers kunnen eigen projecten zien
CREATE POLICY "Customers can view own project logged time"
ON public.daily_logged_time FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM customer_projects
    WHERE customer_projects.project_id = daily_logged_time.project_id
    AND customer_projects.user_id = auth.uid()
  )
);
```

---

### Stap 2: Nieuwe Hook `useLoggedTime.ts`

Creëer een nieuwe hook voor het ophalen van ingelogde tijd:

```typescript
// src/hooks/useLoggedTime.ts

interface LoggedTimeData {
  totalSeconds: number;
  totalHours: number;
  totalCost: number;
}

interface UseLoggedTimeOptions {
  projectId?: string;
  weekYearValue?: string | 'all';
  hourlyRate: number;
}

export const useLoggedTime = ({ projectId, weekYearValue, hourlyRate }: UseLoggedTimeOptions) => {
  return useQuery({
    queryKey: ['logged_time', projectId, weekYearValue],
    queryFn: async (): Promise<LoggedTimeData> => {
      // Bouw query op basis van week/year filter
      let query = supabase
        .from('daily_logged_time')
        .select('total_seconds, date')
        .eq('project_id', projectId);
      
      // Filter op week als specifieke week geselecteerd
      if (weekYearValue && weekYearValue !== 'all') {
        // Parse "2026-01" naar week en year
        // Filter dates die in die week vallen
      }
      
      const { data, error } = await query;
      
      const totalSeconds = data?.reduce((sum, r) => sum + r.total_seconds, 0) || 0;
      const totalHours = totalSeconds / 3600;
      const totalCost = totalHours * hourlyRate;
      
      return { totalSeconds, totalHours, totalCost };
    },
    enabled: !!projectId
  });
};
```

---

### Stap 3: Update Dashboard.tsx

Wijzig de kostenberekening om de echte ingelogde tijd te gebruiken:

**Huidige situatie (regel 181-184):**
```typescript
const totalHours = (kpiAggregates?.totalGesprekstijdSec ?? 0) / 3600; // Gesprekstijd
const totalCost = totalHours * hourlyRate;
```

**Nieuwe situatie:**
```typescript
// Gebruik echte inlogtijd als beschikbaar, anders fallback naar gesprekstijd
const { data: loggedTime, isLoading: loggedTimeLoading } = useLoggedTime({
  projectId: currentProject?.id,
  weekYearValue: selectedWeek,
  hourlyRate: currentMapping.hourly_rate
});

// Fallback naar gesprekstijd als inlogtijd niet beschikbaar
const totalHours = loggedTime?.totalHours ?? (kpiAggregates?.totalGesprekstijdSec ?? 0) / 3600;
const totalCost = loggedTime?.totalCost ?? totalHours * hourlyRate;
```

---

### Stap 4: Update KPI Aggregates Hook (optioneel)

Breid `useKPIAggregates` uit om ook de logged time mee te nemen via een JOIN of aparte query.

Alternatief: Maak een database functie:

```sql
CREATE OR REPLACE FUNCTION get_project_logged_time(
  p_project_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE(total_seconds bigint, total_hours numeric, total_cost numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(dlt.total_seconds), 0)::BIGINT,
    COALESCE(SUM(dlt.total_seconds) / 3600.0, 0)::NUMERIC,
    COALESCE(SUM(dlt.total_seconds) / 3600.0 * p.hourly_rate, 0)::NUMERIC
  FROM daily_logged_time dlt
  JOIN projects p ON dlt.project_id = p.id
  WHERE dlt.project_id = p_project_id
    AND (p_start_date IS NULL OR dlt.date >= p_start_date)
    AND (p_end_date IS NULL OR dlt.date <= p_end_date);
END;
$$;
```

---

### Stap 5: Visualisatie Verbetering (optioneel)

Voeg een aparte KPI kaart toe voor "Inzet Uren" die de echte inlogtijd toont, of pas de bestaande kaart aan om duidelijk te maken dat dit de agent-tijd is (niet gesprekstijd).

---

### Technische Details

**Week filtering:**
De `daily_logged_time` tabel gebruikt `date` in plaats van `week_number`. Om te filteren op week:

```typescript
// Parse "2026-01" naar start/end date
const getWeekDateRange = (weekYearValue: string) => {
  const [year, week] = weekYearValue.split('-').map(Number);
  // Bereken eerste en laatste dag van ISO week
  // ...
};
```

**Fallback strategie:**
- Als er nog geen `daily_logged_time` data is → gebruik `gesprekstijd_sec` (huidige gedrag)
- Dit zorgt voor backwards compatibility

---

### Samenvatting Wijzigingen

| Bestand | Actie |
|---------|-------|
| `supabase/migrations/...` | Nieuwe tabel + RLS policies |
| `src/hooks/useLoggedTime.ts` | Nieuwe hook (aanmaken) |
| `src/pages/Dashboard.tsx` | Import hook, gebruik echte kosten |
| `src/hooks/useKPIAggregates.ts` | Optioneel: integreer logged time |

