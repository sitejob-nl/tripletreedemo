

# Plan: PII-velden verwijderen uit raw_data

## Samenvatting
De veldnamen in BasiCall data variëren inderdaad sterk per project (bijv. `Telefoon` vs `Phone`, `achternaam` vs `Achternaam`, `IBAN` vs `Rekeningnummer`). De beste oplossing is een **blacklist-benadering**: verwijder alle velden die matchen met PII-patronen, ongeacht exacte schrijfwijze.

## Gevonden PII-velden in huidige data

| Categorie | Voorbeelden gevonden in database |
|-----------|--------------------------------|
| **Namen** | `Achternaam`, `achternaam`, `Voornaam`, `Tussenvoegsel`, `First_Name`, `Contact_Middlename`, `Aanhef` |
| **Telefoon** | `Telefoon`, `bc_bmn_telefoon`, `FoutiefMobiel`, `FoutiefTelefoonVast` |
| **Email** | `Email`, `E_mail`, `E-mail`, `emailadres`, `email_naar_yasmina` |
| **Adres** | `Address`, `Straat`, `Billing_Street`, `Aanvullend_adres`, `Billing_Housenumber` |
| **Postcode** | `Postcode`, `Billing_Zipcode`, `bc_bmn_postcode` |
| **Bankgegevens** | `IBAN`, `BIC`, `Rekeningnummer_laatste_drie` |
| **Identificatie** | `Donateursnummer`, `Donatienummer`, `Klantnummer`, `ContactID`, `AccountID` |
| **Gevoelige data** | `Geboortedatum`, `geslacht`, `Geslacht` |

## Te behouden velden (locatie voor kaart)
- `Plaats`, `plaats`, `Post_Woonplaats`, `Woonplaats`, `woonplaats`
- `City`, `Billing_City`, `Stad`  
- `provincie` (voor regionale analyse)

## Voorgestelde oplossing

### Aanpak: Pattern-based blacklist
In plaats van elke exacte veldnaam te noemen, gebruik regex-achtige patronen die hoofdletterongevoelig matchen:

```text
PII_PATTERNS (te verwijderen):
├── *naam* (maar NIET *agentnaam, *result_naam)
├── *name* (behalve agentnaam)
├── *telefoon*, *phone*, *mobiel*
├── *email*, *mail* (behalve email_verwerking)  
├── *adres*, *address*, *straat*, *street*
├── *postcode*, *zipcode* (postcode ≠ woonplaats)
├── *iban*, *bic*, *rekening*, *bank*
├── *geboortedatum*, *birthdate*
├── *klantnummer*, *donateur*, *contactid*, *accountid*
└── *aanhef*, *geslacht*, *gender*

TE BEHOUDEN:
├── *plaats*, *city*, *woonplaats*, *stad*
├── *provincie*, *province*
├── bc_* velden (BasiCall metadata)
├── *bedrag*, *amount*, *termijn*
├── *frequentie*, *frequency*
└── *result*, *beldatum*, *gesprekstijd*
```

### Implementatielocatie
Dit moet in de **VPS sync script** worden ingebouwd, zodat PII nooit in de database terechtkomt.

## Technische specificatie voor Kas

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
  
  // Case-safe IDs (Salesforce)
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

## Optioneel: Bestaande data opschonen

Na implementatie kan Kas ook een eenmalige cleanup doen van bestaande records:

```sql
-- Dit moet door Kas worden uitgevoerd na implementatie van de nieuwe sync
-- Update alle bestaande records om PII te verwijderen
-- (exacte query afhankelijk van PostgreSQL JSONB functies)
```

## Voordelen van deze aanpak
1. **Flexibel**: Werkt ongeacht exacte veldnaam of hoofdlettergebruik
2. **Veilig**: Nieuwe PII-velden worden automatisch geblokkeerd als ze matchen
3. **Behoudend**: Locatiedata voor de kaart blijft beschikbaar
4. **Eenmalig**: Hoeft alleen in VPS sync script, niet per project

## Alternatief: Frontend masking
Als backup kan de frontend ook een display-filter krijgen die PII-velden niet toont, maar dit lost het kernprobleem niet op (data staat nog steeds in de database).

