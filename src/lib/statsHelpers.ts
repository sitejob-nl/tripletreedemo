import { DayStats, FreqBreakdown } from '@/types/dashboard';

export const createEmptyFreqBreakdown = (): FreqBreakdown => ({
  count: 0,
  annualValue: 0,
});

export const createEmptyStats = (): DayStats => ({
  calls: 0,
  sales: 0,
  recurring: 0,
  oneoff: 0,
  annualValue: 0,
  annualValueRecurring: 0,
  annualValueOneoff: 0,
  durationSec: 0,
  totalAttempts: 0,
  totalAmount: 0,
  negativeResults: {},
  negativeCount: 0,
  freqBreakdown: {
    monthly: createEmptyFreqBreakdown(),
    quarterly: createEmptyFreqBreakdown(),
    halfYearly: createEmptyFreqBreakdown(),
    yearly: createEmptyFreqBreakdown(),
    oneoff: createEmptyFreqBreakdown(),
  },
  negativeArgumented: {},
  negativeNotArgumented: {},
  negativeArgumentedCount: 0,
  negativeNotArgumentedCount: 0,
  unreachableCount: 0,
});

// Negative results categorization - argumentated (explained by prospect)
export const NEGATIVE_ARGUMENTATED = [
  'geen geld',
  'heeft al machtiging',
  'steunt al te veel goede doelen',
  'te oud',
  'doet geen zaken telefonisch',
  'geen medewerking',
  'is bot',
  'wil niet',
  'geen interesse',
  'te jong',
  'geen budget',
  'financiele redenen',
];

// Negative results categorization - not argumentated (external factors)
export const NEGATIVE_NOT_ARGUMENTATED = [
  'onjuiste naw-gegevens',
  'onjuiste naw',
  'is bedrijf',
  'contactpersoon overleden',
  'overleden',
  'fax',
  'is verhuisd',
  'verhuisd',
  'spreekt geen nederlands',
  'geen telemarketing',
  'al donateur',
  'foutief telefoonnummer',
  'bmnr',
  'niet bereikbaar',
  'geen gehoor',
  'voicemail',
  'in gesprek',
  'terugbellen',
  'niet beschikbaar',
];

// Unreachable results (for netto conversion calculation)
export const UNREACHABLE_RESULTS = [
  'geen gehoor',
  'voicemail',
  'in gesprek',
  'niet bereikbaar',
  'terugbellen',
  'niet beschikbaar',
  'onjuiste naw-gegevens',
  'onjuiste naw',
  'foutief telefoonnummer',
  'fax',
];

export const categorizeNegativeResult = (resultName: string): 'argumentated' | 'not_argumentated' | 'unknown' => {
  const lower = resultName.toLowerCase().trim();
  
  if (NEGATIVE_ARGUMENTATED.some(r => lower.includes(r))) {
    return 'argumentated';
  }
  
  if (NEGATIVE_NOT_ARGUMENTATED.some(r => lower.includes(r))) {
    return 'not_argumentated';
  }
  
  return 'unknown';
};

export const isUnreachable = (resultName: string): boolean => {
  const lower = resultName.toLowerCase().trim();
  return UNREACHABLE_RESULTS.some(r => lower.includes(r));
};

// Frequency detection from raw_data.frequentie
export type FrequencyType = 'monthly' | 'quarterly' | 'halfYearly' | 'yearly' | 'oneoff';

export const detectFrequency = (freq: unknown): FrequencyType => {
  if (!freq) return 'oneoff';
  
  const lower = String(freq).toLowerCase().trim();
  
  // Monthly
  if (lower === 'maand' || lower === 'maandelijks' || lower === 'per maand' || lower === '12' || lower === 'mnd') {
    return 'monthly';
  }
  
  // Quarterly
  if (lower === 'kwartaal' || lower === 'per kwartaal' || lower === '4') {
    return 'quarterly';
  }
  
  // Half yearly
  if (lower === 'halfjaar' || lower === 'half jaar' || lower === 'per half jaar' || lower === '2') {
    return 'halfYearly';
  }
  
  // Yearly
  if (lower === 'jaar' || lower === 'jaarlijks' || lower === 'per jaar' || lower === '1') {
    return 'yearly';
  }
  
  // One-off
  if (lower === 'eenmalig' || lower === 'eenmalige' || lower === '0') {
    return 'oneoff';
  }
  
  return 'oneoff';
};

export const getFrequencyLabel = (type: FrequencyType): string => {
  switch (type) {
    case 'monthly': return 'Per Maand';
    case 'quarterly': return 'Per Kwartaal';
    case 'halfYearly': return 'Per Half jaar';
    case 'yearly': return 'Per Jaar';
    case 'oneoff': return 'Eenmalig';
  }
};
