import { DayStats, FreqBreakdown, InboundStats } from '@/types/dashboard';
import { ProjectType, MappingConfig } from '@/types/database';

// ============= FREQUENCY DETECTION (CENTRALIZED) =============

export type FrequencyType = 'monthly' | 'quarterly' | 'halfYearly' | 'yearly' | 'oneoff';

export interface FrequencyDetectionResult {
  type: FrequencyType;
  multiplier: number;
  matchedKey: string | null;
  isOneOff: boolean;
}

/**
 * Centralized frequency detection that uses the project's freq_map configuration.
 * This is the single source of truth for frequency detection.
 * 
 * @param freqRaw - Raw frequency value from raw_data (string, number, or null)
 * @param freqMap - Frequency mapping from project's mapping_config
 * @returns FrequencyDetectionResult with type, multiplier, matchedKey, and isOneOff
 */
export const detectFrequencyFromConfig = (
  freqRaw: unknown,
  freqMap: Record<string, number>,
  resultaat?: string | null
): FrequencyDetectionResult => {
  const defaultResult: FrequencyDetectionResult = {
    type: 'oneoff',
    multiplier: 1,
    matchedKey: null,
    isOneOff: true,
  };

  if (!freqRaw) return defaultResult;

  const freqStr = String(freqRaw).toLowerCase().trim();
  
  // Check if it's a numeric value first
  const freqNum = parseInt(freqStr, 10);
  if (!isNaN(freqNum) && freqNum > 0 && freqStr === String(freqNum)) {
    // It's a pure number (e.g., "12", "4", "1")
    return {
      type: mapMultiplierToType(freqNum),
      multiplier: freqNum,
      matchedKey: `(numeriek: ${freqNum})`,
      isOneOff: freqNum === 1,
    };
  }

  // Check one-off patterns first (highest priority)
  if (freqStr.includes('eenmalig') || freqStr === '0' || freqStr === 'e') {
    return {
      type: 'oneoff',
      multiplier: 1,
      matchedKey: 'eenmalig',
      isOneOff: true,
    };
  }

  // Try to match against freq_map using substring matching
  for (const [mapKey, mapValue] of Object.entries(freqMap)) {
    const lowerMapKey = mapKey.toLowerCase();
    if (freqStr.includes(lowerMapKey) || lowerMapKey.includes(freqStr)) {
      return {
        type: mapMultiplierToType(mapValue),
        multiplier: mapValue,
        matchedKey: mapKey,
        isOneOff: mapValue === 1 && !freqStr.includes('jaar'),
      };
    }
  }

  // Fallback: use pattern matching for common terms
  if (freqStr.includes('maand') || freqStr.includes('mnd') || freqStr === 'm') {
    return { type: 'monthly', multiplier: 12, matchedKey: '(patroon: maand)', isOneOff: false };
  }
  if (freqStr.includes('kwartaal') || freqStr === 'k') {
    return { type: 'quarterly', multiplier: 4, matchedKey: '(patroon: kwartaal)', isOneOff: false };
  }
  if (freqStr.includes('halfjaar') || freqStr.includes('half jaar') || freqStr === 'h') {
    return { type: 'halfYearly', multiplier: 2, matchedKey: '(patroon: halfjaar)', isOneOff: false };
  }
  if (freqStr.includes('jaar') || freqStr === 'j') {
    return { type: 'yearly', multiplier: 1, matchedKey: '(patroon: jaar)', isOneOff: false };
  }

  // Fallback: try to detect frequency from resultaat name
  if (resultaat) {
    const resultLower = resultaat.toLowerCase();
    if (resultLower.includes('per maand') || resultLower.includes('maandelijks')) {
      return { type: 'monthly', multiplier: 12, matchedKey: '(resultaat: maand)', isOneOff: false };
    }
    if (resultLower.includes('per kwartaal') || resultLower.includes('kwartaal')) {
      return { type: 'quarterly', multiplier: 4, matchedKey: '(resultaat: kwartaal)', isOneOff: false };
    }
    if (resultLower.includes('per half jaar') || resultLower.includes('halfjaar')) {
      return { type: 'halfYearly', multiplier: 2, matchedKey: '(resultaat: halfjaar)', isOneOff: false };
    }
    if (resultLower.includes('per jaar') || resultLower.includes('jaarlijks')) {
      return { type: 'yearly', multiplier: 1, matchedKey: '(resultaat: jaar)', isOneOff: false };
    }
    if (resultLower.includes('eenmalig')) {
      return { type: 'oneoff', multiplier: 1, matchedKey: '(resultaat: eenmalig)', isOneOff: true };
    }
  }

  return defaultResult;
};

/**
 * Map a multiplier number to a FrequencyType
 */
const mapMultiplierToType = (multiplier: number): FrequencyType => {
  switch (multiplier) {
    case 12: return 'monthly';
    case 4: return 'quarterly';
    case 2: return 'halfYearly';
    case 1: return 'yearly';
    default: return multiplier > 4 ? 'monthly' : 'yearly';
  }
};

// ============= STATS HELPERS =============

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
  excludedFromNetCount: 0,
});

// Empty stats for inbound (retention) projects
export const createEmptyInboundStats = (): InboundStats => ({
  calls: 0,
  durationSec: 0,
  totalAttempts: 0,
  
  // Retention metrics
  retained: 0,
  retainedValue: 0,
  lost: 0,
  lostValue: 0,
  partialSuccess: 0,
  partialSuccessValue: 0,
  pending: 0,
  
  // Reason breakdown
  lostReasons: {},
  retainedReasons: {},
  
  // Unreachable
  unreachableCount: 0,
  excludedFromRetentionCount: 0,
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

export const categorizeNegativeResult = (
  resultName: string,
  config?: MappingConfig
): 'argumentated' | 'not_argumentated' | 'unknown' => {
  const lower = resultName.toLowerCase().trim();
  
  // Use project-specific config if available, otherwise fall back to hardcoded defaults
  const argumentated = config?.negative_argumentated?.length 
    ? config.negative_argumentated 
    : NEGATIVE_ARGUMENTATED;
  const notArgumentated = config?.negative_not_argumentated?.length 
    ? config.negative_not_argumentated 
    : NEGATIVE_NOT_ARGUMENTATED;
  
  if (argumentated.some(r => lower.includes(r.toLowerCase()))) {
    return 'argumentated';
  }
  
  if (notArgumentated.some(r => lower.includes(r.toLowerCase()))) {
    return 'not_argumentated';
  }
  
  return 'unknown';
};

export const isUnreachable = (resultName: string, config?: MappingConfig): boolean => {
  const lower = resultName.toLowerCase().trim();
  const unreachable = config?.unreachable_results?.length
    ? config.unreachable_results
    : UNREACHABLE_RESULTS;
  return unreachable.some(r => lower.includes(r.toLowerCase()));
};

// Marks a result-code as "do not count in netto conversion denominator"
// (additional to unreachable; used for semantically non-unreachable exclusions like "overleden")
export const isExcludedFromNet = (resultName: string, config?: MappingConfig): boolean => {
  if (!config?.exclude_from_net?.length) return false;
  const lower = resultName.toLowerCase().trim();
  return config.exclude_from_net.some(r => lower.includes(r.toLowerCase()));
};

// Marks a result-code as "do not count in retention ratio denominator"
export const isExcludedFromRetention = (resultName: string, config?: MappingConfig): boolean => {
  if (!config?.exclude_from_retention?.length) return false;
  const lower = resultName.toLowerCase().trim();
  return config.exclude_from_retention.some(r => lower.includes(r.toLowerCase()));
};

// Legacy wrapper - uses the new centralized function with empty freq_map for backwards compatibility
export const detectFrequency = (freq: unknown): FrequencyType => {
  const result = detectFrequencyFromConfig(freq, {});
  return result.type;
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

// ============= INBOUND HELPERS =============

/**
 * Categorize a result for inbound (retention) projects
 */
export const categorizeInboundResult = (
  resultName: string,
  config: MappingConfig
): 'retained' | 'lost' | 'partial' | 'pending' | 'unreachable' => {
  const lower = resultName.toLowerCase().trim();
  
  // Check if unreachable first (use config's unreachable_results if available)
  if (isUnreachable(resultName, config)) {
    return 'unreachable';
  }
  
  // Check retention results
  if (config.retention_results?.some(r => lower.includes(r.toLowerCase()))) {
    return 'retained';
  }
  
  // Check lost results
  if (config.lost_results?.some(r => lower.includes(r.toLowerCase()))) {
    return 'lost';
  }
  
  // Check partial success results
  if (config.partial_success_results?.some(r => lower.includes(r.toLowerCase()))) {
    return 'partial';
  }
  
  return 'pending';
};

/**
 * Calculate retention ratio — subtracts per-code excluded denominators
 * (e.g. "overleden" lost-codes that should not count as missed retention).
 */
export const calcRetentionRatio = (stats: InboundStats): number => {
  const totalDecided = stats.retained + stats.lost + stats.partialSuccess - stats.excludedFromRetentionCount;
  if (totalDecided <= 0) return 0;
  return ((stats.retained + stats.partialSuccess) / totalDecided) * 100;
};

/**
 * Calculate save rate (only full retentions, no partial)
 */
export const calcSaveRate = (stats: InboundStats): number => {
  const totalDecided = stats.retained + stats.lost + stats.partialSuccess - stats.excludedFromRetentionCount;
  if (totalDecided <= 0) return 0;
  return (stats.retained / totalDecided) * 100;
};

/**
 * Calculate net saved value (retained - lost)
 */
export const calcNetSavedValue = (stats: InboundStats): number => {
  return stats.retainedValue - stats.lostValue;
};
