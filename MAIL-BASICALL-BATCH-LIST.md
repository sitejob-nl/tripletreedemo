Onderwerp: Feature-request API v2.12 — `Batch.list(project_id)` endpoint

Hoi [naam],

Eerst nogmaals dank voor het toevoegen van `Batch.getTotal` + `Batch.getHandled` in v2.11 (10-03). Werkt netjes in onze sync-integratie.

Nu we ermee werken, lopen we tegen één praktisch ding aan: we hebben geen manier om te ontdekken **welke** batch-IDs er voor een project bestaan. De `getTotal`/`getHandled`-calls vereisen een `batch_id` als input, maar er is geen list-endpoint. Gevolg: onze admin moet per project handmatig de batch-IDs uit jullie beheer-UI kopiëren — foutgevoelig en niet schaalbaar zodra klanten zelf batches aanmaken.

Kunnen jullie in de volgende release een `Batch.list` endpoint toevoegen?

**Voorstel (v2.12 `Batch.list`)**

- **Namespace**: `v3.0/Batch` (zelfde als bestaande Batch-endpoints)
- **Header**: Token + Project (v2.0 SOAP-header, zoals bij andere endpoints)
- **Request body**: leeg (project-context zit al in Project-header) — of optioneel `status_filter` (bv. `1` = actief)
- **Response** (array):
  ```xml
  <return SOAP-ENC:arrayType="tns:Batch[]">
      <item>
          <batch_id xsi:type="xsd:int">12345</batch_id>
          <naam xsi:type="xsd:string">ANBO voorjaar 2026</naam>
          <status xsi:type="xsd:int">1</status>
          <aangemaakt xsi:type="xsd:dateTime">2026-03-15T09:00:00</aangemaakt>
      </item>
      <item>...</item>
  </return>
  ```

Minimum velden waar we iets aan hebben: `batch_id` + `naam`. `status` en `aangemaakt` zijn optioneel maar handig voor filtering (alleen actieve batches tonen, sorteren op nieuwste).

**Use-case**: ons klantportaal wil per project automatisch tonen *"X van Y nummers gebeld, Z nog te gaan"* zonder dat onze admin per project handmatig batch-ID's invult. Met `Batch.list` kan het dashboard self-service batches discoveren en de `getTotal`/`getHandled`-calls er vervolgens tegenaan doen.

**Impact aan jullie kant**: één SQL-query + SOAP-wrapper; vergelijkbaar met de bestaande list-endpoints (zoals `Result.get`). Geen extra tokens of scopes nodig — project-context regelt autorisatie al.

Is dit haalbaar? Graag horen of het in v2.12 kan, en welke doorlooptijd jullie daarvoor inschatten. Als `naam` of `status` er niet makkelijk bij kan, zijn we ook blij met een versie met alleen `batch_id`.

Groet,
Kas
