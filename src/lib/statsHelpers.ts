import { DayStats, FreqBreakdown, InboundStats } from '@/types/dashboard';
import { ProjectType, MappingConfig } from '@/types/database';

// ============= FREQUENCY DETECTION (CENTRALIZED) =============

export type FrequencyType = 'monthly' | 'biMonthly' | 'quarterly' | 'halfYearly' | 'yearly' | 'oneoff';

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

  // Check one-off patterns first (highest priority)
  if (freqStr.includes('eenmalig') || freqStr === '0' || freqStr === 'e') {
    return {
      type: 'oneoff',
      multiplier: 1,
      matchedKey: 'eenmalig',
      isOneOff: true,
    };
  }

  // Match against freq_map with priority (mirrors get_project_annual_value RPC):
  //  0. Exact match
  //  1. Value contains key, longest key wins (so "maandelijks" beats "maand"
  //     and "2 maandlijks" beats "maandelijks" for value "2 maandlijks")
  //  2. Key contains value, longest key wins (only for short value abbrevs like "m")
  // The earlier bidirectional OR let value "Maandelijks" match key "2 maandlijks"
  // via group 2, giving ×6 for ordinary monthly machtigingen on Trombose 761.
  // Project-specific numeric keys (e.g. Proefdiervrij {"1":12}) still match via
  // group 0 (exact) — so this MUST run before the generic numeric-string fallback.
  const entries = Object.entries(freqMap);
  const candidates: Array<{ key: string; value: number; priority: number }> = [];
  for (const [mapKey, mapValue] of entries) {
    const lowerMapKey = mapKey.toLowerCase();
    if (freqStr === lowerMapKey) {
      candidates.push({ key: mapKey, value: mapValue, priority: 0 });
    } else if (freqStr.includes(lowerMapKey)) {
      candidates.push({ key: mapKey, value: mapValue, priority: 1 });
    } else if (lowerMapKey.includes(freqStr)) {
      candidates.push({ key: mapKey, value: mapValue, priority: 2 });
    }
  }
  if (candidates.length) {
    candidates.sort((a, b) => a.priority - b.priority || b.key.length - a.key.length);
    const best = candidates[0];
    return {
      type: mapMultiplierToType(best.value),
      multiplier: best.value,
      matchedKey: best.key,
      isOneOff: best.value === 1 && !freqStr.includes('jaar'),
    };
  }

  // Numeric fallback: only when freq_map didn't match. Treat the raw value
  // as a literal multiplier (e.g. "12" → monthly without any freq_map present).
  const freqNum = parseInt(freqStr, 10);
  if (!isNaN(freqNum) && freqNum > 0 && freqStr === String(freqNum)) {
    return {
      type: mapMultiplierToType(freqNum),
      multiplier: freqNum,
      matchedKey: `(numeriek: ${freqNum})`,
      isOneOff: freqNum === 1,
    };
  }

  // Fallback: use pattern matching for common terms. Bimaandelijks MUST come
  // before the generic 'maand' check — "2-maandelijks" contains "maand" too.
  if (
    freqStr.includes('2-maand') ||
    freqStr.includes('2 maand') ||
    freqStr.includes('tweemaand') ||
    freqStr.includes('bimaand')
  ) {
    return { type: 'biMonthly', multiplier: 6, matchedKey: '(patroon: 2-maandelijks)', isOneOff: false };
  }
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
    if (
      resultLower.includes('2-maand') ||
      resultLower.includes('2 maand') ||
      resultLower.includes('tweemaand') ||
      resultLower.includes('bimaand')
    ) {
      return { type: 'biMonthly', multiplier: 6, matchedKey: '(resultaat: 2-maandelijks)', isOneOff: false };
    }
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
    case 6: return 'biMonthly';
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
    biMonthly: createEmptyFreqBreakdown(),
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
  'financiele reden',
  'financiële reden',
  'ander goed doel',
];

// Negative results categorization - not argumentated (external factors)
export const NEGATIVE_NOT_ARGUMENTATED = [
  'niet meer benaderen',
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

// Unreachable / niet-definitief-bereikt codes (uitgesloten van netto-conversie-noemer).
// Substring-stammen zodat varianten ook matchen (bv. 'belpogingen' vangt
// "Max. belpogingen bereikt"). Aangevuld 2026-06 n.a.v. afboekcode-audit: veel
// hoog-volume BasiCall-codes vielen hiervoor buiten elke categorie.
export const UNREACHABLE_RESULTS = [
  'geen gehoor',
  'voicemail',
  'in gesprek',
  'niet bereikbaar',
  'niet bereikt',
  'terugbellen',
  'terugbelafspraak',
  'niet beschikbaar',
  'onjuiste naw-gegevens',
  'onjuiste naw',
  'foutief telefoonnummer',
  'foutief nummer',
  'foutieve telefoon',
  'fax',
  'belpogingen',
  'blacklist',
  'dialer',
  'abandoned',
  // 2026-06: fall-through codes uit de BasiCall-reconciliatie-audit. Deze telden
  // onterecht mee in de netto-noemer en als "contact" (gesprek). 'onjuist naw' vangt
  // de variant ZONDER 'e' (de bestaande 'onjuiste naw' miste "Onjuist NAW-gegevens");
  // 'nawt' vangt "Onjuiste NAWT-gegevens" + "NAWT fout".
  'onjuist naw',
  'nawt',
  'dubbel in lijst',
  'recent benaderd',
  'niet meer benaderen',
  'leeg',
];

export const categorizeNegativeResult = (
  resultName: string,
  config?: MappingConfig
): 'argumentated' | 'not_argumentated' | 'unknown' => {
  const lower = resultName.toLowerCase().trim();
  
  // Union: project-config vult de hardcoded defaults AAN i.p.v. ze te vervangen.
  const argumentated = [...(config?.negative_argumentated ?? []), ...NEGATIVE_ARGUMENTATED];
  const notArgumentated = [...(config?.negative_not_argumentated ?? []), ...NEGATIVE_NOT_ARGUMENTATED];
  
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
  // Union: project-config vult de defaults AAN i.p.v. ze te vervangen, zodat een
  // project met een eigen (incomplete) lijst de universele niet-bereikt-codes niet mist.
  const unreachable = [...(config?.unreachable_results ?? []), ...UNREACHABLE_RESULTS];
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

// Positieve/sale-resultaten. Net als UNREACHABLE_RESULTS een UNION van project-config
// (mapping_config.sale_results) + deze defaults, zodat een project met een incomplete of
// anders-gespelde lijst de universele sale-codes niet mist (bv. "machtiging per kwartaal"
// in kleine letters, of "Machtiging per Half jaar" die niet in de projectlijst stond).
// BEWUST exact-gelijkheid (case-insensitive + trim), GEEN substring: substring zou
// 'donateur' op "Is al donateur" laten matchen en 'sale' op "Sale niet doorgezet" — beide
// negatief en aanwezig in de data. Sale-codes zijn discrete enums, dus gelijkheid is correct.
// Kale 'eenmalig'/'per kwartaal'/'halfjaarlijks' staan hier BEWUST NIET in: die zijn
// projectafhankelijk (bv. STC heeft 10× "Eenmalig") en horen via mapping_config.sale_results.
export const SALE_RESULTS = [
  'sale',
  'donateur',
  'toezegging',
  'maandelijks',
  'jaarlijks',
  'wil lid worden',
  'machtiging per maand',
  'machtiging per kwartaal',
  'machtiging per jaar',
  'machtiging per half jaar',
];

// Bepaalt of een resultaatcode een positief/sale is. UNION van project-config + defaults,
// case-insensitive exact-gelijkheid. Outbound single source of truth — gebruik dit overal
// i.p.v. een losse `sale_results.includes(...)`, zodat dashboard, rapportage, export en de
// RPC's identiek tellen (anders wijkt "Aantal Positief" / jaarwaarde tussen de paden af).
export const isSale = (resultName: string, config?: MappingConfig): boolean => {
  const target = (resultName || '').toLowerCase().trim();
  if (!target) return false;
  const sales = [...(config?.sale_results ?? []), ...SALE_RESULTS];
  return sales.some(r => r.toLowerCase().trim() === target);
};

// Legacy wrapper - uses the new centralized function with empty freq_map for backwards compatibility
export const detectFrequency = (freq: unknown): FrequencyType => {
  const result = detectFrequencyFromConfig(freq, {});
  return result.type;
};

export const getFrequencyLabel = (type: FrequencyType): string => {
  switch (type) {
    case 'monthly': return 'Per Maand';
    case 'biMonthly': return 'Per 2 Maanden';
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
