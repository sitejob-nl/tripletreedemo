

# Uitgebreide Onboarding Tour - Klanten en Admins

## Overzicht

Een volledige, interactieve rondleiding die zich automatisch aanpast aan de rol van de gebruiker. Klanten krijgen uitleg over het dashboard, rapporten en analyses. Admins krijgen daarbovenop uitleg over de configuratietool, urenregistratie, "bekijk als klant"-toggle, en het volledige admin-panel.

## Tour-stappen per rol

### Klant-tour (8 stappen)

| Stap | Element | Titel | Uitleg |
|------|---------|-------|--------|
| 1 | Overlay | Welkom | "Welkom bij Triple Tree! We laten je in een paar stappen zien hoe het dashboard werkt." |
| 2 | Sidebar campagnes | Campagnes kiezen | "Hier vind je al je campagnes. Klik op een campagne om de bijbehorende data te zien." |
| 3 | Datumfilter | Periode selecteren | "Filter op een specifieke week of kies een datumbereik om precies de juiste periode te bekijken." |
| 4 | Weergaveknoppen | Drie weergaven | "Wissel tussen Rapport (tabeloverzicht), Visueel (grafieken) en Analyse (geavanceerde statistieken)." |
| 5 | KPI-kaarten | Prestatie-indicatoren | "De KPI-kaarten tonen de belangrijkste cijfers: conversies, jaarwaarde, kosten per donateur en gewerkte uren." |
| 6 | Rapport tabel | Resultatenmatrix | "De rapporttabel toont alle belresultaten per dag. Je kunt het rapport exporteren naar Excel." |
| 7 | Help-knop | Formules en uitleg | "Wil je weten hoe een getal wordt berekend? Klik hier voor uitleg over alle formules." |
| 8 | Overlay | Klaar! | "Je bent helemaal klaar! Je kunt de rondleiding altijd opnieuw starten via het vraagteken-icoontje." |

### Admin-tour (14 stappen)

De admin-tour bevat alle klant-stappen plus:

| Stap | Element | Titel | Uitleg |
|------|---------|-------|--------|
| 1 | Overlay | Welkom (Admin) | "Welkom! Als admin heb je extra tools. We laten je zien hoe alles werkt." |
| 2 | Sidebar campagnes | Campagnes | (zelfde als klant) |
| 3 | Sidebar admin-links | Beheertools | "Vanuit de sidebar kun je naar Projectbeheer, Gebruikers en Klantenbeheer navigeren." |
| 4 | "Bekijk als klant" toggle | Perspectief wisselen | "Schakel deze toggle in om het dashboard te zien zoals je klanten het zien -- handig voor controle." |
| 5 | Datumfilter | Periode selecteren | (zelfde als klant) |
| 6 | Weergaveknoppen | Drie weergaven | (zelfde als klant) |
| 7 | Configuratietool (MappingTool) | Project configuratie | "Hier stel je de kolommen, tarieven en resultaatmapping in voor elk project. Dit bepaalt hoe de KPI's worden berekend." |
| 8 | Urencorrectie | Uren aanpassen | "Wanneer er een datumfilter actief is, kun je hier de geregistreerde uren per dag bekijken en corrigeren." |
| 9 | Sync-status | Synchronisatie | "Hier zie je wanneer de data voor het laatst is gesynchroniseerd met BasiCall." |
| 10 | KPI-kaarten | Prestatie-indicatoren | (zelfde als klant) |
| 11 | Rapport tabel | Resultatenmatrix | (zelfde als klant + "De berekeningen zijn gebaseerd op jouw configuratie hierboven.") |
| 12 | Help-knop | Formules | (zelfde als klant) |
| 13 | Admin-pagina hint | Admin panel | "In het admin-panel (/admin) kun je projecten toevoegen, klanten beheren, gebruikersrollen instellen en sync-jobs starten." |
| 14 | Overlay | Klaar! | "Je bent helemaal klaar! Vergeet niet: je kunt de rondleiding altijd herstarten." |

## Gebruikerservaring

- **Eerste bezoek**: Tour start automatisch bij het eerste bezoek na inloggen (detectie via `localStorage`)
- **Herstarten**: Een "Rondleiding" knop naast de bestaande help-knop in de header
- **Navigatie**: Elke stap heeft "Vorige", "Volgende", "Overslaan" knoppen en een voortgangsbalk
- **Spotlight**: Het actieve element wordt uitgelicht met een semi-transparante overlay eromheen
- **Scroll**: Het element wordt automatisch in beeld gescrolld
- **Mobiel**: Op mobiel worden sidebar-stappen overgeslagen (sidebar is een drawer). Tooltips verschijnen altijd boven of onder, gecentreerd
- **Stappen overslaan**: Als een element niet zichtbaar is (bijv. MappingTool is ingeklapt, of geen data), wordt die stap automatisch overgeslagen

## Technische aanpak

### Nieuwe bestanden

1. **`src/hooks/useOnboardingTour.ts`**
   - State management: `isActive`, `currentStep`, `totalSteps`
   - Acties: `startTour()`, `nextStep()`, `prevStep()`, `skipTour()`, `resetTour()`
   - Stappen-definitie per rol (`getStepsForRole(role, isAdmin)`)
   - `localStorage` key: `tripletree_onboarding_v2` (met versienummer voor toekomstige tour-updates)
   - Detectie van eerste bezoek

2. **`src/components/Dashboard/OnboardingTour.tsx`**
   - Rendert overlay + spotlight + tooltip-kaart
   - Gebruikt `data-tour="step-id"` attributen om elementen te vinden via `document.querySelector`
   - Berekent positie via `getBoundingClientRect()` en kiest optimale tooltip-zijde
   - `ResizeObserver` + `scroll` listener om positie te updaten
   - Spotlight via CSS `box-shadow: 0 0 0 9999px rgba(0,0,0,0.7)` op een absoluut gepositioneerd element
   - Overlay-stappen (welkom/einde) zonder spotlight, gecentreerd op scherm
   - Voortgangsbalk met `Progress` component
   - Keyboard support: Escape = overslaan, pijltjes = navigatie

3. **`src/components/Dashboard/OnboardingButton.tsx`**
   - Kleine knop met `BookOpen` icoon naast de help-knop
   - Tooltip: "Start rondleiding"
   - Roept `startTour()` aan

### Aanpassingen bestaande bestanden

4. **`src/components/Dashboard/Sidebar.tsx`**
   - `data-tour="sidebar-projects"` op de campagne-lijst (`<nav>`)
   - `data-tour="sidebar-admin-links"` op de admin menu-items wrapper

5. **`src/components/Dashboard/Header.tsx`**
   - `data-tour="date-filter"` op het DateFilterSelector wrapper-element
   - `data-tour="view-buttons"` op de weergaveknoppen container
   - `data-tour="help-button"` op de HelpDialog wrapper
   - Render `<OnboardingButton />` naast de help-knop

6. **`src/components/Dashboard/KPICardsSection.tsx`**
   - `data-tour="kpi-cards"` op de buitenste wrapper div

7. **`src/components/Dashboard/ReportViewSection.tsx`**
   - `data-tour="report-section"` op de buitenste wrapper

8. **`src/components/Dashboard/AdminViewToggle.tsx`**
   - `data-tour="admin-view-toggle"` op de toggle wrapper

9. **`src/components/Dashboard/MappingTool.tsx`**
   - `data-tour="mapping-tool"` op de buitenste Accordion wrapper

10. **`src/components/Dashboard/SyncStatus.tsx`**
    - `data-tour="sync-status"` op de sync-status element

11. **`src/pages/Dashboard.tsx`**
    - Importeer en render `<OnboardingTour />` met huidige rol als prop
    - `data-tour="hours-correction"` op het HoursCorrection wrapper

### Geen nieuwe dependencies

Alles wordt gebouwd met bestaande componenten: `Card`, `Button`, `Progress`, `cn()`. Geen externe tour-libraries.

### Tour-stap definitie (datastructuur)

```text
interface TourStep {
  id: string               // unieke identifier
  target: string           // data-tour waarde, of null voor overlay-stappen
  title: string            // korte titel
  description: string      // uitleg in 1-3 zinnen
  position: 'top' | 'bottom' | 'left' | 'right' | 'center'
  requiredRole?: 'admin'   // alleen tonen voor admins
  optional?: boolean       // overslaan als element niet gevonden
}
```

