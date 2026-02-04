
# UI Optimalisatie Plan

## Huidige Situatie Analyse
Na het doorlopen van de dashboard UI heb ik de volgende verbeterpunten geidentificeerd:

---

## 1. Header Vereenvoudiging (Quick Win)

**Probleem**: De header bevat veel elementen (breadcrumb, titel, date filter, view switcher, help) die op mobiel/tablet rommelig overkomen.

**Oplossing**:
- Breadcrumb verwijderen (redundant - projectnaam staat al groot)
- "ADMIN MODE" badge verplaatsen naar sidebar (bij admin menu items)
- Help icon kleiner en inline met date filter

---

## 2. Sidebar Verbeteringen

**Probleem**: 
- Geen actieve route indicator voor admin links
- Projecten hebben geen scroll-indicator bij veel projecten
- Sidebar collapsible state ontbreekt (neemt altijd 256px in)

**Oplossing**:
- Active state styling toevoegen aan admin/developer links (gebruik bestaande NavLink pattern)
- Collapsible sidebar met mini-variant (alleen icons) voor meer schermruimte
- Project scroll area met subtle gradient fade

---

## 3. KPI Cards Compacter (Mobile)

**Probleem**: 4 kaarten op mobiel nemen veel verticale ruimte in, user moet scrollen voordat content zichtbaar is.

**Oplossing**:
- Op mobiel: 2x2 grid in plaats van 4x1
- Kleinere padding (p-4 i.p.v. p-6) op mobiel
- Icon size verkleinen op mobiel (20px i.p.v. 28px)

---

## 4. View Switcher Optimalisatie

**Probleem**: 3 tabs (Rapport/Visueel/Analyse) met iconen + tekst neemt veel ruimte in.

**Oplossing**:
- Op mobiel: alleen iconen tonen met tooltip
- Actieve tab duidelijker highlighten met animatie
- Optie: Segmented control stijl i.p.v. pill buttons

---

## 5. Date Filter UX Verbetering

**Probleem**: 
- Week dropdown is native HTML select (inconsistent met rest van UI)
- "Alle weken" staat niet visueel apart van specifieke weken

**Oplossing**:
- Vervang native select door Radix Select (consistent met rest)
- "Alle weken" als aparte toggle button voor snelle toegang
- Week selector met jaar-groepering indien weken over meerdere jaren

---

## 6. Loading States Consistentie

**Probleem**: Verschillende loading spinners en states door de app heen.

**Oplossing**:
- Skeleton loaders voor KPI cards (al aanwezig, maar inconsistent toegepast)
- Shimmer effect voor tabel rows
- Progress indicator voor analyse data laden (huidige "Volledige dataset laden..." is goed)

---

## 7. Analyse Tabs Navigatie

**Probleem**: TabsList met 4 tabs neemt veel breedte in, vooral met iconen + tekst.

**Oplossing**:
- Op desktop: huidige layout behouden
- Op tablet: iconen + korte labels
- Op mobiel: dropdown of swipeable tabs

---

## 8. Empty States Verrijken

**Probleem**: "Geen data beschikbaar" is kaal en geeft geen actie-opties.

**Oplossing**:
- Illustratie toevoegen (simpele SVG)
- Context-specifieke melding ("Geen resultaten voor Week X" vs "Project nog niet gesynchroniseerd")
- CTA button indien relevant (bijv. "Sync nu starten" voor admin)

---

## Implementatie Prioriteit

| # | Onderdeel | Impact | Effort |
|---|-----------|--------|--------|
| 1 | KPI Cards responsive grid | Hoog | Laag |
| 2 | Native select → Radix Select | Medium | Laag |
| 3 | View switcher mobile-only icons | Medium | Laag |
| 4 | Sidebar active states | Medium | Laag |
| 5 | Header cleanup | Medium | Medium |
| 6 | Collapsible sidebar | Hoog | Hoog |
| 7 | Analyse tabs mobile | Medium | Medium |
| 8 | Empty states | Laag | Laag |

---

## Aanbevolen Eerste Stappen

Ik stel voor te beginnen met de **quick wins** (impact/effort ratio):

1. **KPI Cards responsive**: `grid-cols-2` op mobiel
2. **Week selector naar Radix Select**: consistente styling
3. **Admin links active state**: visuele feedback

---

## Technische Details

### KPI Cards Grid (Dashboard.tsx regel 612)
```
Van:  grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4
Naar: grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4
+ responsive padding: p-4 sm:p-6
```

### Week Selector (DateFilterSelector.tsx regel 111-126)
Vervang native `<select>` door:
```tsx
<Select value={selectedWeek} onValueChange={onWeekChange}>
  <SelectTrigger className="...">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">Alle Weken</SelectItem>
    {availableWeeks.map(...)}
  </SelectContent>
</Select>
```

### Sidebar Active States (Sidebar.tsx)
Voeg active state checking toe met `useLocation()` en conditional styling:
```tsx
const location = useLocation();
const isActive = (path: string) => location.pathname === path;

// In Link component:
className={cn(
  "flex items-center gap-2 ...",
  isActive('/admin') && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
)}
```

---

## Bestanden die worden aangepast

| Bestand | Wijzigingen |
|---------|-------------|
| `src/pages/Dashboard.tsx` | KPI grid responsive classes |
| `src/components/Dashboard/DateFilterSelector.tsx` | Native select → Radix Select |
| `src/components/Dashboard/Sidebar.tsx` | Active state voor admin links |
| `src/components/Dashboard/KPICard.tsx` | Responsive padding/icon sizing |
| `src/components/Dashboard/Header.tsx` | View switcher mobile optimalisatie |

