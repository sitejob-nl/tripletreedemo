import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const HelpDialog = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Help en uitleg" className="text-muted-foreground hover:text-foreground">
          <HelpCircle className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Uitleg Formules & Berekeningen
          </DialogTitle>
          <DialogDescription>
            Overzicht van alle metrics en hoe deze worden berekend
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh] pr-4">
          <Accordion type="single" collapsible className="w-full">
            {/* Jaarwaarde */}
            <AccordionItem value="jaarwaarde">
              <AccordionTrigger className="text-left font-semibold">
                Jaarwaarde Berekening
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  De jaarwaarde geeft aan hoeveel een donatie op jaarbasis waard is.
                </p>
                <div className="bg-muted/50 p-3 rounded-md font-mono text-xs">
                  Jaarwaarde = Termijnbedrag × Frequentie Multiplier
                </div>
                <div className="space-y-2">
                  <p className="font-medium">Frequentie Multipliers:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li><span className="font-medium text-foreground">Maandelijks:</span> × 12</li>
                    <li><span className="font-medium text-foreground">Kwartaal:</span> × 4</li>
                    <li><span className="font-medium text-foreground">Halfjaarlijks:</span> × 2</li>
                    <li><span className="font-medium text-foreground">Jaarlijks:</span> × 1</li>
                    <li><span className="font-medium text-foreground">Eenmalig:</span> × 1 (telt niet als structureel)</li>
                  </ul>
                </div>
                <p className="text-muted-foreground text-xs">
                  Voorbeeld: €10 per maand = €10 × 12 = €120 jaarwaarde
                </p>
              </AccordionContent>
            </AccordionItem>

            {/* Conversie */}
            <AccordionItem value="conversie">
              <AccordionTrigger className="text-left font-semibold">
                Conversie Berekeningen
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <div className="space-y-4">
                  <div>
                    <p className="font-medium mb-2">Bruto Conversie</p>
                    <div className="bg-muted/50 p-3 rounded-md font-mono text-xs">
                      Bruto Conversie = (Aantal Sales / Totaal Gesprekken) × 100%
                    </div>
                    <p className="text-muted-foreground text-xs mt-1">
                      Alle gesprekken worden meegeteld, inclusief onbereikbaar.
                    </p>
                  </div>
                  
                  <div>
                    <p className="font-medium mb-2">Netto Conversie</p>
                    <div className="bg-muted/50 p-3 rounded-md font-mono text-xs">
                      Netto Conversie = (Aantal Sales / Bereikbare Gesprekken) × 100%
                    </div>
                    <p className="text-muted-foreground text-xs mt-1">
                      Alleen bereikbare gesprekken worden meegeteld (exclusief niet-bereikt, voicemail, etc.).
                    </p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Investering */}
            <AccordionItem value="investering">
              <AccordionTrigger className="text-left font-semibold">
                Investering & Kosten
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <div className="space-y-4">
                  <div>
                    <p className="font-medium mb-2">Investering Excl. BTW</p>
                    <div className="bg-muted/50 p-3 rounded-md font-mono text-xs">
                      Investering = (Totale Gesprekstijd in uren) × Uurtarief
                    </div>
                  </div>
                  
                  <div>
                    <p className="font-medium mb-2">Investering Incl. BTW</p>
                    <div className="bg-muted/50 p-3 rounded-md font-mono text-xs">
                      Investering Incl. BTW = Investering × 1.21
                    </div>
                  </div>
                  
                  <div>
                    <p className="font-medium mb-2">Investering per Donateur</p>
                    <div className="bg-muted/50 p-3 rounded-md font-mono text-xs">
                      Investering per Donateur = Totale Investering / Aantal Sales
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ROI */}
            <AccordionItem value="roi">
              <AccordionTrigger className="text-left font-semibold">
                ROI & Terugverdientijd
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <div className="space-y-4">
                  <div>
                    <p className="font-medium mb-2">Return on Investment (ROI)</p>
                    <div className="bg-muted/50 p-3 rounded-md font-mono text-xs">
                      ROI = Totale Jaarwaarde / Investering
                    </div>
                    <p className="text-muted-foreground text-xs mt-1">
                      Een ROI van 3.5× betekent dat elke geïnvesteerde euro 3,50 aan jaarwaarde oplevert.
                    </p>
                  </div>
                  
                  <div>
                    <p className="font-medium mb-2">Terugverdientijd</p>
                    <div className="bg-muted/50 p-3 rounded-md font-mono text-xs">
                      Terugverdientijd = (Investering / Jaarwaarde) × 12 maanden
                    </div>
                    <p className="text-muted-foreground text-xs mt-1">
                      Geeft aan hoeveel maanden het duurt voordat de investering is terugverdiend.
                    </p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Negatieve Resultaten */}
            <AccordionItem value="negatief">
              <AccordionTrigger className="text-left font-semibold">
                Negatieve Resultaten
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <div className="space-y-4">
                  <div>
                    <p className="font-medium mb-2">Beargumenteerd Negatief</p>
                    <p className="text-muted-foreground">
                      Gesprekken waarbij de persoon is bereikt en een inhoudelijke reden heeft gegeven voor afwijzing (bijv. geen interesse, geen geld, principieel tegen).
                    </p>
                  </div>
                  
                  <div>
                    <p className="font-medium mb-2">Niet Beargumenteerd Negatief</p>
                    <p className="text-muted-foreground">
                      Gesprekken waarbij geen inhoudelijk gesprek heeft plaatsgevonden (bijv. voicemail, niet bereikt, verkeerd nummer).
                    </p>
                  </div>
                  
                  <div>
                    <p className="font-medium mb-2">Onbereikbaar</p>
                    <p className="text-muted-foreground">
                      Gesprekken waarbij contact niet mogelijk was. Deze worden uitgesloten bij netto conversie berekeningen.
                    </p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Retentie (Inbound) */}
            <AccordionItem value="retentie">
              <AccordionTrigger className="text-left font-semibold">
                Retentie Metrics (Inbound)
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <p className="text-muted-foreground mb-3">
                  Voor inbound/retentie projecten worden specifieke metrics gebruikt:
                </p>
                <div className="space-y-4">
                  <div>
                    <p className="font-medium mb-2">Retentie Ratio</p>
                    <div className="bg-muted/50 p-3 rounded-md font-mono text-xs">
                      Retentie Ratio = Behouden / (Behouden + Verloren) × 100%
                    </div>
                  </div>
                  
                  <div>
                    <p className="font-medium mb-2">Save Rate</p>
                    <div className="bg-muted/50 p-3 rounded-md font-mono text-xs">
                      Save Rate = Volledig Behouden / Totaal Behandeld × 100%
                    </div>
                  </div>
                  
                  <div>
                    <p className="font-medium mb-2">Netto Bespaarde Waarde</p>
                    <div className="bg-muted/50 p-3 rounded-md font-mono text-xs">
                      Netto Bespaard = Behouden Waarde - Verloren Waarde
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Week Data */}
            <AccordionItem value="week">
              <AccordionTrigger className="text-left font-semibold">
                Week & Datum Selectie
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Het dashboard toont data per week, waarbij zowel het weeknummer als het jaar wordt meegenomen.
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Week 1 (2026) bevat alleen data uit 2026</li>
                  <li>Week 1 (2025) bevat alleen data uit 2025</li>
                  <li>Weeknummers volgen de ISO 8601 standaard</li>
                </ul>
                <p className="text-muted-foreground text-xs mt-2">
                  Tip: Gebruik de "Vorige" en "Volgende" knoppen om snel tussen weken te navigeren.
                </p>
              </AccordionContent>
            </AccordionItem>

            {/* Gesprekstijd */}
            <AccordionItem value="gesprekstijd">
              <AccordionTrigger className="text-left font-semibold">
                Gesprekstijd
              </AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Gesprekstijd wordt gemeten vanaf het moment van verbinding tot het einde van het gesprek.
                </p>
                <div className="space-y-2">
                  <div>
                    <p className="font-medium mb-2">Weergave</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Opgeslagen in seconden in de database</li>
                      <li>Weergegeven als uren:minuten in rapporten</li>
                      <li>Omgerekend naar uren voor kostencalculaties</li>
                    </ul>
                  </div>
                </div>
                <div className="bg-muted/50 p-3 rounded-md font-mono text-xs mt-2">
                  Gesprekstijd (uren) = Totaal Seconden / 3600
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
