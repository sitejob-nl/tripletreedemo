Onderwerp: Vragen over de Web API (v2.11) — inbound-tijd per campagne

Hoi,

We hebben onze koppeling met jullie Web API flink uitgebreid en lopen nog tegen één inhoudelijk punt aan, plus een algemene vraag.

**1. Inbound: uren/tijd per campagne.**
Voor de inbound-campagnes 849 (Hersenstichting inbound), 870 (Sligro tintelingen) en 901 (NL Tour Rides) geeft `Project.getIngelogdeTijden` "Geen resultaten" (404). De ingelogde tijd lijkt volledig onder de gedeelde wachtrij "Inbound opvang" (500) te staan, niet per campagne. In jullie eigen rapportage zien we per inbound-campagne tóch uren staan.

- Hoe berekenen jullie die per-campagne inbound-uren, en is dat via de API per campagne op te halen?
- Concreet: geeft `getIngelogdeTijden` voor project 500 bij een 'Gesprek'-status een `record_id` terug die naar de specifieke call verwijst?
- En bestaat er een volledige lijst van de mogelijke statussen (gesprek / nawerk / beschikbaar / pauze / …) en wat `status_id` betekent?

**2. Missen we iets?**
We willen het dashboard zo dicht mogelijk op jullie eigen rapportages laten aansluiten. Zijn er endpoints of velden die we mogelijk over het hoofd zien voor (a) afhandel-/nawerktijd per call, of (b) statistiek/rapportage per project?

Alvast dank — een korte call mag ook als dat makkelijker is.

Groet,
Kas
