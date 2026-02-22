

# Fix: CHECK constraint uitbreiden met `inbound_service`

## Probleem
De database heeft een CHECK constraint `projects_project_type_check` die alleen `'outbound'` en `'inbound'` toestaat. Het nieuwe type `'inbound_service'` is wel in de TypeScript code toegevoegd, maar de database constraint is niet bijgewerkt.

## Oplossing
Een nieuwe migratie die de bestaande constraint verwijdert en opnieuw aanmaakt met alle drie de types.

## Technische details

### Nieuw bestand: `supabase/migrations/xxx_add_inbound_service_type.sql`

```sql
ALTER TABLE projects DROP CONSTRAINT projects_project_type_check;
ALTER TABLE projects ADD CONSTRAINT projects_project_type_check
  CHECK (project_type = ANY (ARRAY['outbound', 'inbound', 'inbound_service']));
```

Dat is alles -- na deze migratie kun je projecten opslaan met type `inbound_service`.

