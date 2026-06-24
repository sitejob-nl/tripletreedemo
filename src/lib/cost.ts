import { MappingConfig } from '@/types/database';

/**
 * Per-sale facturatie. Sommige campagnes (bv. ANBO 734) betalen Triple Tree per sale
 * i.p.v. per uur: de klant-facing kosten/investering = aantal sales × cost_per_sale,
 * niet uren × uurtarief.
 *
 * Single source of truth voor die regel — gebruik dit op ELKE plek waar de investering/
 * kosten berekend wordt (ReportMatrix, Dashboard-KPI, Excel-export, WeekComparison) zodat
 * de paden niet uit elkaar lopen.
 *
 * Geeft het bedrag per sale terug als cost_per_sale > 0, anders null (→ val terug op uren × tarief).
 * Let op: cost_per_sale ≠ flat_sale_value. flat_sale_value bepaalt JAARWAARDE per sale;
 * cost_per_sale bepaalt KOSTEN per sale.
 */
export const getCostPerSale = (mc?: MappingConfig | null): number | null => {
  const v = Number(mc?.cost_per_sale);
  return Number.isFinite(v) && v > 0 ? v : null;
};
