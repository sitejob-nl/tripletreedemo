# Plan: PII-velden verwijderen uit raw_data

**Status: ✅ GOEDGEKEURD - Klaar voor implementatie door Kas**

## Samenvatting
De veldnamen in BasiCall data variëren sterk per project (bijv. `Telefoon` vs `Phone`, `achternaam` vs `Achternaam`, `IBAN` vs `Rekeningnummer`). De oplossing is een **blacklist-benadering**: verwijder alle velden die matchen met PII-patronen, ongeacht exacte schrijfwijze.

## Te verwijderen PII-velden (patronen)

| Categorie | Voorbeelden gevonden in database |
|-----------|--------------------------------|
| **Namen** | `Achternaam`, `Voornaam`, `Tussenvoegsel`, `First_Name`, `Contact_Middlename`, `Aanhef` |
| **Telefoon** | `Telefoon`, `bc_bmn_telefoon`, `FoutiefMobiel`, `FoutiefTelefoonVast` |
| **Email** | `Email`, `E_mail`, `E-mail`, `emailadres` |
| **Adres** | `Address`, `Straat`, `Billing_Street`, `Billing_Housenumber` |
| **Postcode** | `Postcode`, `Billing_Zipcode`, `bc_bmn_postcode` |
| **Bankgegevens** | `IBAN`, `BIC`, `Rekeningnummer_laatste_drie` |
| **Identificatie** | `Donateursnummer`, `Klantnummer`, `ContactID`, `AccountID` |
| **Gevoelige data** | `Geboortedatum`, `geslacht` |

## Te behouden velden (locatie voor kaart)
- `Plaats`, `Post_Woonplaats`, `Woonplaats`, `City`, `Billing_City`, `Stad`
- `provincie` (voor regionale analyse)

---

## Technische specificatie voor Kas (VPS sync script)

### Functie: `stripPIIFromRawData(rawData)`

```javascript
const PII_BLACKLIST_PATTERNS = [
  // Namen (uitgezonderd agentnaam, result_naam)
  /^(?!bc_agentnaam$|bc_result_naam$).*naam$/i,
  /^(?!bc_agentnaam$|bc_result_naam$).*name$/i,
  /voorletter/i, /tussenvoegsel/i, /aanhef/i,
  
  // Contact
  /telefoon/i, /phone/i, /mobiel/i, /mobile/i,
  /email/i, /e-mail/i, /e_mail/i, /^mail/i,
  
  // Adres (behalve woonplaats/plaats/city/stad)
  /^(?!.*plaats|.*city|.*stad|.*woonplaats|.*provincie).*adres/i,
  /street/i, /straat/i,
  /^postcode$/i, /zipcode/i, /bc_bmn_postcode/i,
  /huisnummer/i, /housenumber/i,
  
  // Bank/Financieel identificatie
  /iban/i, /^bic$/i, /rekening/i, /bank.*nummer/i,
  
  // Persoonlijke identificatie  
  /geboortedatum/i, /birthdate/i, /birth_date/i,
  /geslacht/i, /gender/i,
  /klantnummer/i, /donateur.*nummer/i, /donatienummer/i,
  /contactid/i, /accountid/i, /contact_id/i, /account_id/i,
  
  // Salesforce IDs
  /casesafeid/i,
];

// Velden die expliciet NIET verwijderd mogen worden
const WHITELIST_PATTERNS = [
  /bc_agentnaam/i,
  /bc_result_naam/i,
  /bc_email_verwerking/i,
  /plaats/i, /woonplaats/i, /city/i, /stad/i,
  /provincie/i, /province/i,
  /billing_city/i,
];

function stripPIIFromRawData(rawData) {
  const cleaned = {};
  
  for (const [key, value] of Object.entries(rawData)) {
    // Check whitelist first - always keep these
    const isWhitelisted = WHITELIST_PATTERNS.some(p => p.test(key));
    if (isWhitelisted) {
      cleaned[key] = value;
      continue;
    }
    
    // Check blacklist - remove if matches
    const isBlacklisted = PII_BLACKLIST_PATTERNS.some(p => p.test(key));
    if (!isBlacklisted) {
      cleaned[key] = value;
    }
  }
  
  return cleaned;
}
```

### Integratie in sync script
```javascript
// In de upsert loop, vóór opslag:
const cleanedRawData = stripPIIFromRawData(normalizeRawData(record));

const recordsToUpsert = batch.map((record) => ({
  // ... andere velden
  raw_data: cleanedRawData, // Nu zonder PII
  // ...
}));
```

---

## Na implementatie: Bestaande data opschonen

Kas kan een eenmalige cleanup doen van bestaande records met een SQL script dat de JSONB velden filtert.

## Voordelen
1. **Flexibel**: Werkt ongeacht exacte veldnaam of hoofdlettergebruik
2. **Veilig**: Nieuwe PII-velden worden automatisch geblokkeerd
3. **Behoudend**: Locatiedata voor de kaart blijft beschikbaar
4. **Eenmalig**: Hoeft alleen in VPS sync script
