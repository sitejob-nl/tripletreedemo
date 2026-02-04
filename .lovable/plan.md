
# Professionele Refactor: Authenticatie en Sessie Management

## Geïdentificeerde Problemen

### Probleem 1: Logout Button Werkt Niet
**Huidige implementatie (Dashboard.tsx lijn 398-402):**
```typescript
const handleLogout = async () => {
  await signOut();
  window.location.href = '/auth';
};
```

**Root cause:** De `await signOut()` blokkeert potentieel forever als:
- De sessie al verlopen is (Supabase gooit "session_not_found")
- Netwerkproblemen optreden
- De Promise nooit resolved

De functie hangt en de redirect wordt nooit uitgevoerd.

---

### Probleem 2: Menu Items Verdwijnen Intermitterend
**Root cause:** Race condition in `useAuth.ts` tussen twee bronnen van waarheid:

```typescript
// Bron 1: onAuthStateChange callback (lijn 14-27)
supabase.auth.onAuthStateChange((event, session) => {
  setSession(session);
  setUser(session?.user ?? null);
  setLoading(false);  // ← Zet loading false
});

// Bron 2: getSession() promise (lijn 31-35)
supabase.auth.getSession().then(({ data: { session } }) => {
  setSession(session);
  setUser(session?.user ?? null);
  setLoading(false);  // ← Zet NOGMAALS loading false
});
```

**Race condition scenario:**
1. Component mount → `loading = true`
2. `onAuthStateChange` vuur event → `user = X`, `loading = false`
3. React rendert Dashboard → vraagt `userRole` query
4. `getSession()` resolved → overschrijft state (mogelijk met andere waarde)
5. `useUserRole` query start opnieuw → `roleLoading = true`
6. Sidebar checkt `role === 'admin'` → false (want query loopt nog)
7. Menu items verdwijnen

---

## Oplossing

### 1. Robuuste Logout Handler

```typescript
const handleLogout = useCallback(async () => {
  // Voorkom dubbele kliks
  if (isLoggingOut) return;
  setIsLoggingOut(true);
  
  try {
    // Timeout: als signOut langer dan 3 seconden duurt, forceer redirect
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Logout timeout')), 3000)
    );
    
    await Promise.race([
      signOut(),
      timeoutPromise
    ]);
  } catch (error) {
    // Negeer alle errors - we willen ALTIJD uitloggen
    console.warn('Logout warning:', error);
  } finally {
    // Clear alle lokale state en cache
    queryClient.clear();
    // Forceer volledige page reload naar auth
    window.location.replace('/auth');
  }
}, [signOut, queryClient]);
```

---

### 2. Correcte Auth State Management

Implementeer het **"Single Source of Truth"** pattern:

```typescript
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    let isMounted = true;

    // 1. EERST: Haal initiële sessie op
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
          setIsInitialized(true);
        }
      }
    };

    initializeAuth();

    // 2. DAARNA: Luister naar wijzigingen (maar alleen NA initialisatie)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;
        
        // Negeer events totdat we geïnitialiseerd zijn
        // (voorkomt race condition)
        if (!isInitialized && event === 'INITIAL_SESSION') return;

        setSession(session);
        setUser(session?.user ?? null);

        // Invalidate cache bij auth wijzigingen
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          // Defer to avoid Supabase internal deadlock
          setTimeout(() => {
            queryClient.invalidateQueries();
          }, 0);
        }

        // Bij SIGNED_OUT: extra cleanup
        if (event === 'SIGNED_OUT') {
          queryClient.clear();
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient, isInitialized]);

  // ... rest van de hook
}
```

---

### 3. Stabiele Role Loading in ProtectedRoute

```typescript
export function ProtectedRoute({ children, requireAdmin, requireSuperAdmin }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin(user?.id);
  const { isSuperAdmin, isLoading: superAdminLoading } = useIsSuperAdmin(user?.id);

  // CRITICAL: Wacht tot ALLES geladen is voordat we renderen
  const isFullyLoaded = !authLoading && 
    (!requireAdmin || !adminLoading) && 
    (!requireSuperAdmin || !superAdminLoading);

  if (!isFullyLoaded) {
    return <LoadingSpinner />;
  }

  // ... rest van de component
}
```

---

### 4. Sidebar: Stabiele Rendering

Voorkom flicker door role als dependency correct af te handelen:

```typescript
const Sidebar = ({ role, isSuperAdmin, onLogout, ...props }) => {
  // Memoize menu items om onnodige re-renders te voorkomen
  const adminMenuItems = useMemo(() => {
    if (role !== 'admin') return null;
    
    return (
      <>
        <Link to="/admin">Projectbeheer</Link>
        <Link to="/admin/users">Gebruikers</Link>
        <Link to="/admin/customers">Klantenbeheer</Link>
      </>
    );
  }, [role]);

  const devMenuItem = useMemo(() => {
    if (!isSuperAdmin) return null;
    return <Link to="/developer">Developer</Link>;
  }, [isSuperAdmin]);

  // ...
};
```

---

## Bestanden die worden aangepast

| Bestand | Wijziging |
|---------|-----------|
| `src/hooks/useAuth.ts` | Volledige refactor met isInitialized pattern, correcte volgorde, cleanup |
| `src/pages/Dashboard.tsx` | Robuuste logout met timeout, loading state, queryClient.clear() |
| `src/components/ProtectedRoute.tsx` | Correcte loading check voor alle vereiste roles |
| `src/components/Dashboard/Sidebar.tsx` | Memoized menu items voor stabiele rendering |

---

## Verwacht Resultaat

1. **Logout werkt altijd** - ongeacht sessie status of netwerkproblemen
2. **Menu items blijven stabiel** - geen flicker bij page load of navigatie
3. **Correcte volgorde van events** - eerst initialiseren, dan luisteren
4. **Professionele error handling** - graceful degradation bij problemen

---

## Test Scenario's na Implementatie

1. Klik op Uitloggen → Direct redirect naar `/auth`
2. Log in als admin → Alle menu items direct zichtbaar
3. Refresh de pagina → Menu items blijven stabiel
4. Open `/admin/users` direct → Geen flicker, correcte rendering
5. Log uit terwijl sessie al verlopen is → Nog steeds correcte redirect

