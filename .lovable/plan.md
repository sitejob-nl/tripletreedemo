
# Excel Export + InboundReportMatrix: Logged Time en Weekday Rates

## Samenvatting
Drie concrete fixes om de rapportage consistent te maken met wat de dashboard UI toont:

1. Excel export upgraden met weekday_rates, logged time, BTW, en meer metrics
2. InboundReportMatrix logged time ondersteuning toevoegen
3. Excel export geschikt maken voor inbound projecten

---

## 1. Excel Export Upgraden

### Probleem
De huidige `useExcelExport` hook:
- Gebruikt altijd gesprekstijd (praat-uren) in plaats van logged time (ingelogde uren)
- Gebruikt een flat `hourlyRate` zonder weekday-specifieke tarieven
- Mist metrics die wel in de ReportMatrix staan: BTW, netto conversie, ROI, gemiddeld bedrag
- Werkt alleen voor outbound projecten

### Wijzigingen in `src/hooks/useExcelExport.ts`

**Nieuwe parameters toevoegen:**
- `mappingConfig?: MappingConfig` (voor weekday_rates)
- `vatRate?: number` (voor BTW berekening)
- `loggedTimeHours?: number` (totaal ingelogde uren)
- `dailyLoggedHours?: DailyLoggedTimeBreakdown` (per dag)
- `projectType?: ProjectType`

**Berekening aanpassen:**
- `calcHours` per dag: als `dailyLoggedHours[dag]` beschikbaar, gebruik die; anders gesprekstijd
- `calcHours` totaal: als `loggedTimeHours` beschikbaar, gebruik die
- `calcInvestment` per dag: uren x `weekday_rates[dag]` (fallback naar default `hourlyRate`)
- `calcInvestment` totaal: som van alle dag-investeringen

**Extra Excel-rijen toevoegen:**
- Netto conversie
- Gemiddeld donatiebedrag
- ROI (jaarwaarde / investering)
- Investering incl. BTW
- BTW bedrag

---

## 2. InboundReportMatrix: Logged Time Support

### Probleem
`InboundReportMatrix` berekent uren altijd uit `durationSec` (gesprekstijd), terwijl `ReportMatrix` en `ServiceReportMatrix` al logged time ondersteunen.

### Wijzigingen in `src/components/Dashboard/InboundReportMatrix.tsx`

**Nieuwe props toevoegen:**
- `loggedTimeHours?: number`
- `dailyLoggedHours?: DailyLoggedTimeBreakdown`

**`calcHours` aanpassen:**
- Per dag: gebruik `dailyLoggedHours[dag]` als beschikbaar
- Totaal: gebruik `loggedTimeHours` als beschikbaar
- Fallback: `durationSec / 3600`

**Impact op afgeleide metrics:**
- `calcCallsPerHour` gebruikt automatisch de nieuwe uren
- `calcInvestment` gebruikt automatisch de nieuwe uren
- `calcCostPerRetained` idem

### Wijzigingen in `src/components/Dashboard/ReportViewSection.tsx`

Props `loggedTimeHours` en `dailyLoggedHours` doorgeven aan `InboundReportMatrix` (nu worden ze al ontvangen maar niet doorgestuurd).

---

## 3. Excel Export voor Inbound

### Wijzigingen in `src/hooks/useExcelExport.ts`

Conditionele Excel-structuur op basis van `projectType`:
- **Outbound**: huidige layout + extra metrics
- **Inbound**: behouden/verloren/retentie ratio/behouden waarde
- **Inbound Service**: afgehandeld/niet afgehandeld/ratio/calls per uur

---

## 4. Dashboard.tsx: Extra Props Doorgeven

### Wijzigingen in `src/pages/Dashboard.tsx`

`useExcelExport` aanroepen met de extra parameters:
```
useExcelExport({
  data: reportMatrixProcessedData,
  hourlyRate,
  selectedWeek: filterLabel,
  projectName: currentProject?.name || selectedProjectKey,
  mappingConfig: currentProject?.mapping_config,
  vatRate: currentProject?.vat_rate || 21,
  loggedTimeHours: loggedTime?.hasData ? loggedTime.totalHours : undefined,
  dailyLoggedHours: loggedTime?.dailyHours,
  projectType,
})
```

---

## Bestanden die wijzigen

| Bestand | Wijziging |
|---|---|
| `src/hooks/useExcelExport.ts` | Weekday rates, logged time, BTW, inbound/service support |
| `src/components/Dashboard/InboundReportMatrix.tsx` | Logged time props + berekeningen |
| `src/components/Dashboard/ReportViewSection.tsx` | loggedTime props doorgeven aan InboundReportMatrix |
| `src/pages/Dashboard.tsx` | Extra params aan useExcelExport |
