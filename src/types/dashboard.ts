export type Role = 'admin' | 'client';
export type ViewMode = 'dashboard' | 'report' | 'analytics';
export type AnalyticsTab = 'geographic' | 'attempts' | 'results' | 'time';
export type Project = 'hersenstichting' | 'anbo' | 'cliniclowns';

export interface RawCallRecord {
  id: number;
  bc_result_naam: string;
  bc_gesprekstijd: number;
  bc_beldatum: string;
  Nbedrag?: string;
  Ntermijn?: string;
  Frequentie?: string;
  bedrag?: string;
  DonatieBedrag?: string;
}

export interface ProcessedCallRecord extends RawCallRecord {
  normalized_date: string;
  day_name: string;
  week_number: number;
  annual_value: number;
  is_recurring: boolean;
  is_sale: boolean;
  call_duration_min: number;
}

export interface ProjectMapping {
  amount_col: string;
  freq_col: string;
  hourly_rate: number;
  freq_map: Record<string, number>;
}

export interface FreqBreakdown {
  count: number;
  annualValue: number;
}

export interface DayStats {
  calls: number;
  sales: number;
  recurring: number;
  oneoff: number;
  annualValue: number;
  annualValueRecurring: number;
  annualValueOneoff: number;
  durationSec: number;
  totalAttempts: number;
  totalAmount: number;
  negativeResults: Record<string, number>;
  negativeCount: number;
  // Frequency breakdown
  freqBreakdown: {
    monthly: FreqBreakdown;
    quarterly: FreqBreakdown;
    halfYearly: FreqBreakdown;
    yearly: FreqBreakdown;
    oneoff: FreqBreakdown;
  };
  // Negative categorization
  negativeArgumented: Record<string, number>;
  negativeNotArgumented: Record<string, number>;
  negativeArgumentedCount: number;
  negativeNotArgumentedCount: number;
  // Unreachable for netto conversion
  unreachableCount: number;
}
