

# Security Fixes Implementatieplan

Dit plan pakt alle geïdentificeerde security issues aan: het verscherpen van RLS policies, het verbergen van API tokens voor reguliere gebruikers, en het verplaatsen van de Mapbox token naar een environment variable.

---

## Samenvatting van de Problemen

### 1. RLS Policy Issues
- **sync_logs**: `SELECT` policy met `USING (true)` - alle geauthenticeerde gebruikers kunnen logs zien
- **error_logs INSERT**: `WITH CHECK (true)` - bewust open voor client-side error reporting (gedocumenteerd als acceptabel)

### 2. API Token Blootstelling
- De `basicall_token` kolom in `projects` tabel is zichtbaar voor alle gebruikers die toegang hebben tot een project
- Reguliere gebruikers (customers) kunnen via `customer_projects` de projecten zien inclusief de gevoelige API token
- De token wordt alleen server-side gebruikt (in edge functions) en hoeft nooit naar de client te gaan

### 3. Mapbox Token Hardcoded
- Token staat hardcoded in `src/components/Dashboard/GeographicAnalysis.tsx` (lijn 312)
- Token staat hardcoded in `supabase/functions/geocode-city/index.ts` (lijn 9)
- Hoewel dit een **publishable** Mapbox token is (geen secret), is centralisatie beter voor onderhoud

---

## Implementatieplan

### Stap 1: Verscherp sync_logs RLS Policy

De huidige policy `USING (true)` voor SELECT wordt vervangen door een restrictievere policy die alleen admins/superadmins toegang geeft.

```sql
-- Verwijder de permissive policy
DROP POLICY IF EXISTS "Sync logs leesbaar voor dashboard" ON sync_logs;

-- Nieuwe restrictieve policy alleen voor admins
CREATE POLICY "Only admins can view sync_logs"
  ON sync_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
```

### Stap 2: Verberg basicall_token via Database View

De oplossing is het maken van een "projects_public" view die de gevoelige token verbergt, terwijl admins nog steeds toegang hebben tot de volledige data.

**Database wijzigingen:**

```sql
-- 1. Maak een publieke view zonder gevoelige velden
CREATE VIEW public.projects_public
WITH (security_invoker=on) AS
  SELECT 
    id,
    name,
    project_key,
    basicall_project_id,
    is_active,
    hourly_rate,
    vat_rate,
    project_type,
    mapping_config,
    created_at,
    updated_at
  FROM public.projects;
  -- LET OP: basicall_token is bewust NIET opgenomen

-- 2. RLS op de view toepassen
-- View erft automatisch RLS via security_invoker=on
```

**Frontend wijzigingen:**

De frontend code wordt aangepast om:
- Voor reguliere gebruikers (customers): de `projects_public` view te gebruiken
- Voor admins: de `projects` tabel te blijven gebruiken (voor token beheer)

Bestanden die worden aangepast:
- `src/hooks/useProjects.ts` - Conditionally query view vs table based on role
- `src/types/database.ts` - Nieuw type `DBProjectPublic` zonder token
- `src/hooks/useCustomerProjects.ts` - Gebruik de publieke view

### Stap 3: Centraliseer Mapbox Token

Hoewel de Mapbox token een **publishable** (publieke) key is, is centralisatie beter:

1. **Frontend**: Verplaats token naar een constante in een config bestand
2. **Edge function**: Verplaats token naar Supabase secrets (optioneel, maar beter)

**Nieuwe config file**: `src/config/mapbox.ts`
```typescript
// Mapbox publieke token - veilig voor frontend gebruik
export const MAPBOX_PUBLIC_TOKEN = 'pk.eyJ1Ijoic2l0ZWpvYi1ubCIsImEiOiJjbWQzZ29pYngwNDN5MmpxbmNldTN1c3ZmIn0.unL-G3gacXta2WVCKK6Rcg';
```

---

## Technische Details

### Database Migratie

```sql
-- ========================================
-- 1. Fix sync_logs RLS
-- ========================================
DROP POLICY IF EXISTS "Sync logs leesbaar voor dashboard" ON sync_logs;

CREATE POLICY "Only admins can view sync_logs"
  ON sync_logs FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'superadmin'::app_role)
  );

-- ========================================
-- 2. Maak publieke projects view
-- ========================================
CREATE VIEW public.projects_public
WITH (security_invoker=on) AS
  SELECT 
    id,
    name,
    project_key,
    basicall_project_id,
    is_active,
    hourly_rate,
    vat_rate,
    project_type,
    mapping_config,
    created_at,
    updated_at
  FROM public.projects;

-- View RLS werkt via security_invoker - erft table policies
```

### Frontend Type Updates

**Nieuw type** in `src/types/database.ts`:
```typescript
// Publieke project data (zonder gevoelige velden)
export interface DBProjectPublic {
  id: string;
  name: string;
  project_key: string;
  basicall_project_id: number;
  is_active: boolean;
  hourly_rate: number;
  vat_rate: number;
  project_type: ProjectType;
  mapping_config: MappingConfig;
  created_at: string;
  updated_at: string;
  // GEEN basicall_token
}
```

### Hook Wijzigingen

**useProjects.ts** - Nieuwe versie met role-based query:
```typescript
export const useProjects = (onlyActive = true, userId?: string, isAdmin = false) => {
  const query = useQuery({
    queryKey: ['projects', onlyActive, userId, isAdmin],
    queryFn: async () => {
      // Admins krijgen volledige data, anderen de publieke view
      const tableName = isAdmin ? 'projects' : 'projects_public';
      
      let queryBuilder = supabase
        .from(tableName)
        .select('*')
        .order('name');

      if (onlyActive) {
        queryBuilder = queryBuilder.eq('is_active', true);
      }

      const { data, error } = await queryBuilder;
      // ... rest van de logica
    },
  });
};
```

---

## Bestanden die Worden Aangepast

| Bestand | Wijziging |
|---------|-----------|
| `supabase/migrations/[new].sql` | Nieuwe migratie met RLS fixes en view |
| `src/types/database.ts` | Nieuw `DBProjectPublic` type |
| `src/hooks/useProjects.ts` | Role-based table/view selectie |
| `src/hooks/useCustomerProjects.ts` | Gebruik `projects_public` view |
| `src/config/mapbox.ts` | **Nieuw**: Gecentraliseerde Mapbox config |
| `src/components/Dashboard/GeographicAnalysis.tsx` | Import token van config |
| `supabase/functions/geocode-city/index.ts` | Import token van environment of config |
| `src/integrations/supabase/types.ts` | Auto-gegenereerd na migratie |

---

## Impact Analyse

### Wat blijft werken:
- Admins kunnen nog steeds projecten aanmaken/bewerken met tokens
- Sync functionaliteit blijft werken (edge functions hebben service role)
- Customers zien hun toegewezen projecten (zonder token)
- Kaart functionaliteit blijft werken

### Beveiligingsverbeteringen:
- Reguliere gebruikers kunnen geen API tokens meer zien
- sync_logs alleen zichtbaar voor admins
- Gecentraliseerde token beheer voor betere maintainability

### Breaking Changes:
- Geen - de publieke view heeft dezelfde velden als wat customers nu gebruiken (minus de token die ze nooit nodig hadden)

