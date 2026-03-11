

# Batch Beheer & Dashboard Voortgang

## Overzicht
4 nieuwe bestanden, 2 bestaande bestanden aanpassen. Database en RLS zijn al ingericht. `remaining` is een generated column -- wordt NIET in Insert/Update types gezet.

## 1. `src/integrations/supabase/types.ts`
**Mag niet handmatig bewerkt worden** (komt van Supabase API). We typen de batches tabel in onze eigen code waar nodig.

## 2. `src/hooks/useBatches.ts` -- Nieuw
- `useBatches(projectId?)`: fetcht `batches` gefilterd op `project_id`, gesorteerd op `remaining` desc
- `useCreateBatch()`: insert mutation (name, basicall_batch_id, project_id) -- **geen `remaining`** in insert
- `useDeleteBatch()`: delete mutation op id
- Invalidate `['batches']` on success
- Type `Batch` lokaal defini&euml;ren met Row-velden (incl. remaining als read-only)

## 3. `src/components/Admin/BatchManager.tsx` -- Nieuw
- Project dropdown via `useProjects`
- Tabel: naam, basicall_batch_id, total, handled, remaining, status (1=Actief, 2=Inactief, 3=Alleen pers. TBA), last_synced_at
- Formulier: naam + basicall_batch_id inputs + "Toevoegen" knop
- Delete knop per rij met `AlertDialog` bevestiging
- Wrapped in `Card`

## 4. `src/pages/Admin.tsx` -- Aanpassen
- Import `BatchManager`
- `grid-cols-5` &rarr; `grid-cols-6`
- Nieuwe tab: `<TabsTrigger value="batches">Batches</TabsTrigger>`
- Nieuwe content: `<TabsContent value="batches"><BatchManager /></TabsContent>`

## 5. `src/components/Dashboard/BatchProgress.tsx` -- Nieuw
- Props: `projectId: string`
- Gebruikt `useBatches(projectId)`
- Return `null` als geen batches
- Per batch: naam, status badge, `Progress` bar (handled/total * 100), remaining getal, percentage
- Gesorteerd op remaining desc (vanuit hook)
- Onderaan: "Laatst bijgewerkt: [meest recente last_synced_at]"

## 6. `src/pages/Dashboard.tsx` -- Aanpassen
- Import `BatchProgress`
- Render `<BatchProgress projectId={currentProject.id} />` na KPI cards (rond regel 546), voor de view switcher

