import type { MappingConfig, ProjectType } from '@/types/database';

export interface MappingCandidateValue {
  value: string;
  count: number;
  last_date?: string | null;
}

export interface MappingCandidateField {
  name: string;
  count: number;
}

export interface MappingCandidates {
  fields: MappingCandidateField[];
  results: MappingCandidateValue[];
  frequency_values: MappingCandidateValue[];
}

const normalize = (value: string) => value.trim().toLowerCase();

const FIELD_ALIASES = {
  amount: ['nbedrag', 'bedrag_nieuw', 'giftbedrag', 'termijnbedrag', 'bedrag', 'amount', 'donatiebedrag'],
  frequency: ['ntermijn', 'betaalfrequentie_nieuw_vol', 'betaalfrequentie_nieuw', 'frequentie', 'frequency', 'betaalfrequentie'],
  reason: ['opzegreden', 'reden', 'reason', 'afboekreden'],
  location: ['woonplaats', 'plaats', 'city', 'stad'],
};

const pickField = (fields: MappingCandidateField[], aliases: string[]) => {
  const exact = fields.find((field) => aliases.includes(normalize(field.name)));
  if (exact) return exact.name;
  return fields.find((field) => aliases.some((alias) => normalize(field.name).includes(alias)))?.name;
};

export const inferFrequencyMultiplier = (raw: string): number | null => {
  const value = normalize(raw);
  // Een kale "1" is bronafhankelijk: bij STC betekent die jaarlijks, terwijl
  // Ntermijn=1 bij Proefdiervrij juist maandelijks betekent. Laat die daarom
  // altijd expliciet door een beheerder vastleggen.
  if (/^(12|6|4|2)$/.test(value)) return Number(value);
  if (value.includes('eenmalig') || value === 'e') return 1;
  if (value.includes('2-maand') || value.includes('2 maand') || value.includes('tweemaand') || value.includes('bimaand')) return 6;
  if (value.includes('maand') || value.includes('mnd') || value === 'm') return 12;
  if (value.includes('kwartaal') || value === 'k') return 4;
  if (value.includes('halfjaar') || value.includes('half jaar') || value === 'h') return 2;
  if (value.includes('jaar') || value === 'j') return 1;
  return null;
};

const includesAny = (value: string, patterns: string[]) =>
  patterns.some((pattern) => normalize(value).includes(pattern));

export const suggestResultCategory = (
  result: string,
  projectType: ProjectType,
): keyof MappingConfig | 'other_results' => {
  const value = normalize(result);
  if (projectType === 'inbound_service') {
    if (includesAny(value, [
      'niet afgehandeld', 'terugbellen', 'doorverbonden', 'geen gehoor',
      'voicemail', 'in gesprek', 'abandoned', 'foutief',
    ])) {
      return 'not_handled_results';
    }
    return includesAny(value, ['afgehandeld', 'opgelost', 'beantwoord'])
      ? 'handled_results'
      : 'other_results';
  }
  if (projectType === 'inbound') {
    if (includesAny(value, ['geen gehoor', 'voicemail', 'foutief', 'niet bereikbaar'])) return 'unreachable_results';
    if (includesAny(value, ['behouden', 'retentie', 'machtiging blijft', 'doorgegaan'])) return 'retention_results';
    if (includesAny(value, ['opgezegd', 'opzegging zonder behoud', 'verloren', 'storno', 'beëindigd'])) return 'lost_results';
    if (includesAny(value, ['eenmalig', 'gedeeltelijk', 'lager bedrag'])) return 'partial_success_results';
    return 'other_results';
  }

  // Resultaatcodes zijn discrete waarden. Substring-matching op "donateur" zou
  // bijvoorbeeld "Is al donateur" ten onrechte als sale voorstellen.
  const saleCodes = [
    'sale', 'donateur', 'toezegging', 'akkoord', 'positief', 'maandelijks',
    'jaarlijks', 'wil lid worden', 'machtiging per maand',
    'machtiging per kwartaal', 'machtiging per jaar',
    'machtiging per half jaar', 'eenmalige machtiging',
  ];
  if (saleCodes.includes(value) || /^machtiging per (maand|kwartaal|jaar|half jaar) ai$/.test(value)) {
    return 'sale_results';
  }
  if (includesAny(value, [
    'geen gehoor', 'voicemail', 'foutief', 'telefoonnummer verkeerd',
    'niet bereikbaar', 'max. belpogingen', 'blacklist', 'dialer',
    'abandoned', 'terugbel', 'in gesprek', 'onjuist naw',
  ])) return 'unreachable_results';
  if (includesAny(value, [
    'geen geld', 'geen interesse', 'wil niet', 'geen budget', 'ander goed doel',
    'financi', 'geen medewerking', 'steunt meerdere doelen', 'te veel goede doelen',
    'inhoudelijke reden', 'bezwaar', 'onder bewind',
  ])) return 'negative_argumentated';
  if (includesAny(value, [
    'overleden', 'verhuisd', 'bedrijf', 'geen nederlands', 'blacklist',
    'al donateur', 'al klant', 'al lid', 'bel-me-niet',
  ])) return 'negative_not_argumentated';
  return 'other_results';
};

export interface MappingSuggestion {
  amount_col?: string;
  freq_col?: string;
  reason_col?: string;
  location_col?: string;
  freq_map: Record<string, number>;
  categories: Partial<Record<keyof MappingConfig | 'other_results', string[]>>;
}

export const buildMappingSuggestion = (
  candidates: MappingCandidates,
  projectType: ProjectType,
): MappingSuggestion => {
  const categories: MappingSuggestion['categories'] = {};
  for (const result of candidates.results) {
    const category = suggestResultCategory(result.value, projectType);
    categories[category] = [...(categories[category] ?? []), result.value];
  }

  const freqMap: Record<string, number> = {};
  for (const candidate of candidates.frequency_values) {
    const multiplier = inferFrequencyMultiplier(candidate.value);
    if (multiplier !== null) freqMap[normalize(candidate.value)] = multiplier;
  }

  return {
    amount_col: pickField(candidates.fields, FIELD_ALIASES.amount),
    freq_col: pickField(candidates.fields, FIELD_ALIASES.frequency),
    reason_col: pickField(candidates.fields, FIELD_ALIASES.reason),
    location_col: pickField(candidates.fields, FIELD_ALIASES.location),
    freq_map: freqMap,
    categories,
  };
};

export const qualityMetricBlocked = (blocked: string[], metric: string) => blocked.includes(metric);
