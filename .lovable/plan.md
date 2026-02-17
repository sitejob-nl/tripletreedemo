


# Fase 2 Implementatie: Status

## Afgerond

### Fase 1 (eerder)
- Jaarwaarde/frequentie berekening fix
- Configureerbare negatieve redenen
- Handmatige urencorrectie per dag

### Fase 2 Sprint 1 (zojuist)
- **Afwijkend uurtarief per weekdag**: MappingConfig uitgebreid met `weekday_rates`, ReportMatrix en InboundReportMatrix gebruiken dag-specifieke tarieven, MappingTool heeft UI voor 7 weekdagen
- **Badges / Te bellen restant**: `total_to_call` kolom toegevoegd aan projects, ProjectDialog heeft invoerveld, KPICardsSection toont voortgangsbalk

---

## Nog te bouwen

### Sprint 2
1. **Inbound Klantenservice Type** - ProjectType uitbreiden naar `inbound_retention` | `inbound_service`, ServiceReportMatrix component
2. **Globale Correctiefactor** - `hours_factor` kolom, useLoggedTime vermenigvuldiging

### Parallel / extern
3. Nachtelijke sync (VPS cronjob)
4. Custom domein (DNS instructies)
5. Badges via API (zodra beschikbaar)
6. Steam connector (toekomst)
7. Excel export weekday rates integratie
