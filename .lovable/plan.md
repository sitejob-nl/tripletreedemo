

# Jaarwaarde Breakdown: Bedragen en Rekensom Tonen

## Wat verandert er
De popover bij "Jaarwaarde" toont nu alleen het aantal donateurs en de totale jaarwaarde per frequentie. Na deze wijziging zie je per frequentie ook het totale termijnbedrag en de vermenigvuldiging, zodat de rekensom transparant is.

**Voorbeeld van hoe het eruit komt te zien:**

```text
Opbouw Jaarwaarde

Maandelijks (x12)
  3 donateurs | Bedrag: € 30,00 x 12 = € 360,00

Per kwartaal (x4)
  2 donateurs | Bedrag: € 50,00 x 4 = € 200,00

Eenmalig
  1 donateur | Bedrag: € 100,00

----------------------------------------------
Totaal                              € 660,00
```

---

## Technische details

### 1. `KPICardsSection.tsx` - Interface uitbreiden

De `AnnualValueBreakdown` interface krijgt een extra veld `totalAmount` per frequentie (het totale termijnbedrag voor die categorie):

```ts
export interface AnnualValueBreakdown {
  monthly: { count: number; value: number; totalAmount: number };
  quarterly: { count: number; value: number; totalAmount: number };
  halfYearly: { count: number; value: number; totalAmount: number };
  yearly: { count: number; value: number; totalAmount: number };
  oneoff: { count: number; value: number; totalAmount: number };
}
```

### 2. `KPICardsSection.tsx` - Popover layout aanpassen

Per frequentie toon:
- Aantal donateurs
- Totaal termijnbedrag x multiplier = jaarwaarde
- Voor eenmalig: alleen het bedrag (geen vermenigvuldiging)

Multipliers worden afgeleid uit de frequentie-key (monthly=12, quarterly=4, halfYearly=2, yearly=1).

### 3. `Dashboard.tsx` - `totalAmount` berekenen

In de `useMemo` voor `annualValueBreakdown` het originele bedrag uit `raw_data` parsen (via `parseDutchFloat` en `amount_col` uit de mapping config) en optellen bij `breakdown[key].totalAmount`.

### Bestanden die wijzigen

| Bestand | Wijziging |
|---|---|
| `src/components/Dashboard/KPICardsSection.tsx` | Interface + popover layout |
| `src/pages/Dashboard.tsx` | `totalAmount` berekenen in useMemo |

