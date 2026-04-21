import { Package } from 'lucide-react';
import { useBatchSummary } from '@/hooks/useBatchSummary';

interface StockHeaderProps {
  projectId: string;
}

// Compact voorraad-header used at the top of historical-style report templates.
// Renders the same 4 lines as the header of each weektab in legacy rapportages
// (Totaal aangeleverd / Afgehandeld / Nog te bellen / Bereikpercentage).
// Numbers reflect *current* batch state — we don't retain week-by-week snapshots
// in DB, so every week shows today's totals. Acceptable for ongoing campaigns.
export function StockHeader({ projectId }: StockHeaderProps) {
  const summary = useBatchSummary(projectId);

  if (!summary.hasData) return null;

  const fmt = (n: number) => n.toLocaleString('nl-NL');
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

  return (
    <div className="mb-4 rounded-md border border-border bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Package className="h-3.5 w-3.5" aria-hidden="true" />
        Voorraad
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <StockCell label="Totaal aangeleverd" value={fmt(summary.totalSupplied)} />
        <StockCell label="Afgehandeld" value={fmt(summary.totalHandled)} />
        <StockCell label="Nog te bellen" value={fmt(summary.totalRemaining)} />
        <StockCell label="Bereikpercentage" value={pct(summary.reachPercentage)} />
      </div>
    </div>
  );
}

function StockCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold text-foreground">{value}</div>
    </div>
  );
}
