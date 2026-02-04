# ✅ Demo Account Setup - GEÏMPLEMENTEERD

## Samenvatting
Demo omgeving is klaar. Volg onderstaande stappen om te activeren.

---

## Stap 1: Seed de demo data (als admin)

**Optie A: Via de browser console (aanbevolen)**

Log in als admin op het dashboard, open de browser console (F12) en voer uit:

```javascript
const { data, error } = await supabase.functions.invoke('seed-demo-data');
console.log(data, error);
```

**Optie B: Via curl**

```bash
curl -X POST "https://tvsdbztjqksxybxjwtrf.supabase.co/functions/v1/seed-demo-data" \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

Dit maakt:
- ✅ Demo project "Demo Campagne" (project_key: `demo`)
- ✅ ~200 call records verspreid over 5 weken (week 2-6 van 2026)
- ✅ Realistische verdeling: 25% sales, 35% negatief met reden, 15% negatief zonder reden, 25% overig
- ✅ Locaties voor geografische kaart (20 Nederlandse steden)
- ✅ Bedragen en frequenties voor jaarwaarde berekening

---

## Stap 2: Maak demo account aan

Ga naar **Admin → Klanten → Nieuwe klant**:

| Veld | Waarde |
|------|--------|
| **Email** | `demo@tripletree.nl` |
| **Wachtwoord** | `DemoAccount2026!` |
| **Project** | Demo Campagne |

---

## Stap 3: Test de demo

1. Log uit als admin
2. Log in met `demo@tripletree.nl` / `DemoAccount2026!`
3. Controleer:
   - ✓ KPIs tonen data
   - ✓ Resultaten matrix werkt
   - ✓ Geografische kaart toont steden
   - ✓ Tijdsanalyse toont gesprekken per uur
   - ✓ Belpogingen analyse werkt

---

## Data opnieuw genereren

De `seed-demo-data` edge function kan opnieuw worden aangeroepen om de data te verversen. Bestaande demo records worden eerst verwijderd.

## Technische Details

### Gegenereerde data structuur

**Sales (Maandelijks/Jaarlijks/Eenmalig):**
```json
{
  "termijnbedrag": "10,00",
  "frequentie": "maand",
  "bc_belpogingen": 2,
  "woonplaats": "Amsterdam",
  "bc_agentnaam": "Demo Agent"
}
```

**Mapping config:**
```json
{
  "amount_col": "termijnbedrag",
  "freq_col": "frequentie",
  "reason_col": "opzegreden",
  "freq_map": { "maand": 12, "jaar": 1, "eenmalig": 1 },
  "sale_results": ["Maandelijks", "Jaarlijks", "Eenmalig", "Sale", "Donateur"]
}
```
