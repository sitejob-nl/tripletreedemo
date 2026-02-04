
# Plan: Fix Admin Menu Visibility voor SuperAdmin Gebruikers

## Probleem
Je bent ingelogd als `kas@sitejob.nl` met rol `superadmin` in de database, maar je ziet alleen "Developer" en "Uitloggen" in de sidebar, niet de admin menu items (Projectbeheer, Gebruikers, Klantenbeheer).

## Root Cause Analyse
Na grondig onderzoek heb ik de bug gevonden in `src/pages/Dashboard.tsx`:

**Regel 50:**
```typescript
const { isSuperAdmin } = useIsSuperAdmin(user?.id);
```

De `isLoading` state van `useIsSuperAdmin` wordt **niet opgehaald**, terwijl deze wel nodig is voor een correcte loading guard. Hoewel React Query queries met dezelfde key zou moeten dedupliceren, is er een subtle timing issue waarbij `isSuperAdmin` `false` kan zijn voordat de data volledig geladen is.

**Belangijkste probleem:**
De loading guard op regel 455 checkt:
```typescript
if (authLoading || roleLoading) { ... }
```

Maar `roleLoading` komt alleen van de eerste `useUserRole` call. De `isLoading` van `useIsSuperAdmin` wordt genegeerd.

## Oplossing

### 1. Dashboard.tsx: Haal isLoading op uit useIsSuperAdmin
In `src/pages/Dashboard.tsx`:
- Wijzig regel 50 van:
  - `const { isSuperAdmin } = useIsSuperAdmin(user?.id);`
- Naar:
  - `const { isSuperAdmin, isLoading: superAdminLoading } = useIsSuperAdmin(user?.id);`
- Voeg `superAdminLoading` toe aan de loading guard op regel 455:
  - `if (authLoading || roleLoading || superAdminLoading) { ... }`

### 2. Sidebar.tsx: Verbeter de admin check voor superadmins
Momenteel toont `adminMenuItems` alleen als `role === 'admin'`. Maar dit is correct omdat `effectiveRole` al naar `'admin'` wordt gemapped voor superadmins in Dashboard.tsx.

Het probleem is dat als de rol nog aan het laden is, `effectiveRole` = `'client'` wordt (omdat `isDbAdmin` = `false` als `userRole` = `undefined`).

De fix in Dashboard.tsx zou dit moeten oplossen, maar voor extra robuustheid pas ik ook de Sidebar aan:
- Voeg `isAdmin` prop toe aan Sidebar (boolean, expliciet)
- Gebruik `isAdmin` in plaats van `role !== 'admin'` check

### Bestanden die worden aangepast
1. **`src/pages/Dashboard.tsx`** (3 wijzigingen):
   - Destructure `superAdminLoading` uit `useIsSuperAdmin`
   - Voeg toe aan loading guard
   - (Optioneel) Voeg `isAdmin` prop toe aan Sidebar call

2. **`src/components/Dashboard/Sidebar.tsx`** (2 wijzigingen):
   - Voeg `isAdmin` prop toe aan interface
   - Gebruik `isAdmin` in `adminMenuItems` check

## Code Wijzigingen

### Dashboard.tsx (regel 50)
Van:
```typescript
const { isSuperAdmin } = useIsSuperAdmin(user?.id);
```
Naar:
```typescript
const { isSuperAdmin, isLoading: superAdminLoading } = useIsSuperAdmin(user?.id);
```

### Dashboard.tsx (regel 455)
Van:
```typescript
if (authLoading || roleLoading) {
```
Naar:
```typescript
if (authLoading || roleLoading || superAdminLoading) {
```

### Dashboard.tsx (regel 471-478 - Sidebar call)
Van:
```typescript
<Sidebar
  selectedProject={selectedProjectKey as any}
  onProjectChange={(key) => setSelectedProjectKey(key)}
  projects={projectKeys as any}
  role={effectiveRole}
  onLogout={handleLogout}
  isSuperAdmin={isSuperAdmin}
/>
```
Naar:
```typescript
<Sidebar
  selectedProject={selectedProjectKey as any}
  onProjectChange={(key) => setSelectedProjectKey(key)}
  projects={projectKeys as any}
  role={effectiveRole}
  onLogout={handleLogout}
  isSuperAdmin={isSuperAdmin}
  isAdmin={isDbAdmin}
/>
```

### Sidebar.tsx - Interface (regel 7-14)
Voeg `isAdmin?: boolean` toe aan SidebarProps interface.

### Sidebar.tsx - adminMenuItems check (regel 27-28)
Van:
```typescript
const adminMenuItems = useMemo(() => {
  if (role !== 'admin') return null;
```
Naar:
```typescript
const adminMenuItems = useMemo(() => {
  // Use explicit isAdmin prop for reliable admin status (handles superadmin too)
  if (!isAdmin && role !== 'admin') return null;
```

Of simpeler:
```typescript
const adminMenuItems = useMemo(() => {
  if (!isAdmin) return null;
```

## Verwacht Resultaat
Na deze fix:
1. De loading screen wordt getoond totdat ALLE role data geladen is
2. Superadmins zien zowel de admin menu items (Projectbeheer, Gebruikers, Klantenbeheer) als de Developer link
3. Reguliere admins zien de admin menu items maar niet de Developer link
4. Gewone users zien alleen Uitloggen

## Test Plan
1. Log in als kas@sitejob.nl (superadmin)
2. Verifieer dat je ziet: Projectbeheer, Gebruikers, Klantenbeheer, Developer, Uitloggen
3. Log in als een admin user (niet superadmin)
4. Verifieer dat je ziet: Projectbeheer, Gebruikers, Klantenbeheer, Uitloggen (geen Developer)
5. Log in als een gewone user
6. Verifieer dat je alleen Uitloggen ziet
