import { useMemo } from 'react';
import { useBatches } from './useBatches';

export interface BatchSummary {
  totalSupplied: number;
  totalHandled: number;
  totalRemaining: number;
  reachPercentage: number;
  batchCount: number;
  hasData: boolean;
}

// Compact project-wide batch totals for the voorraad-header shown above
// historical-style report templates. Only active batches (status=1) count toward
// reach%, matching how BasiCall reports voorraad in the legacy rapportages.
export function useBatchSummary(projectId?: string): BatchSummary {
  const { data: batches } = useBatches(projectId);

  return useMemo(() => {
    const active = (batches ?? []).filter((b) => (b.status ?? 1) === 1);
    const totalSupplied = active.reduce((sum, b) => sum + (b.total ?? 0), 0);
    const totalHandled = active.reduce((sum, b) => sum + (b.handled ?? 0), 0);
    const totalRemaining = active.reduce(
      (sum, b) => sum + (b.remaining ?? Math.max(0, (b.total ?? 0) - (b.handled ?? 0))),
      0
    );
    const reachPercentage = totalSupplied > 0 ? totalHandled / totalSupplied : 0;

    return {
      totalSupplied,
      totalHandled,
      totalRemaining,
      reachPercentage,
      batchCount: active.length,
      hasData: active.length > 0 && totalSupplied > 0,
    };
  }, [batches]);
}
