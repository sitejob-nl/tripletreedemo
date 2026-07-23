import { MappingConfig } from '@/types/database';
import { parseDutchFloat } from '@/lib/dataProcessing';
import { categorizeInboundResult, detectFrequencyFromConfig, FrequencyType, isSale as isSaleResult } from '@/lib/statsHelpers';

export interface CalculatedRecordValues {
  annualValue: number;
  isSale: boolean;
  isRecurring: boolean;
  frequencyType: FrequencyType;
  frequencyMultiplier: number;
  frequencyMatchedKey: string | null;
}

/**
 * Single source of truth for per-record (jaar)waarde + sale/frequency derivation on the
 * client. Used by useCallRecords, useReportMatrixData and useAllCallRecordsForAnalysis so the
 * KPI-kaart, rapportage/export én de analyse-weergave identiek tellen. Houd dit in lijn met de
 * RPC's get_project_kpi_totals / get_project_annual_value (zie CLAUDE.md §Berekeningspaden).
 *
 * Volgorde:
 *  1. flat_sale_value (vast bedrag per sale, bv. ANBO €37,08) — heeft VOORRANG; elke sale telt
 *     exact dat bedrag, eenmalig. Voor lead-/aanmeldcampagnes zonder termijnbedrag/frequentie.
 *  2. anders: Bedrag × frequentie-multiplier (de gewone outbound-campagnes).
 */
export const calculateValuesFromRaw = (
  rawData: Record<string, unknown> | null,
  resultaat: string | null,
  mappingConfig: MappingConfig | null | undefined
): CalculatedRecordValues => {
  const defaultResult: CalculatedRecordValues = {
    annualValue: 0,
    isSale: false,
    isRecurring: false,
    frequencyType: 'oneoff',
    frequencyMultiplier: 1,
    frequencyMatchedKey: null,
  };

  if (!rawData || !mappingConfig) {
    return defaultResult;
  }

  const isSale = isSaleResult(resultaat || '', mappingConfig);

  // 1. Vast bedrag per sale (bv. ANBO: €37,08/sale). Heeft voorrang: geen termijnbedrag/
  //    frequentie in de data, dus elke sale telt exact dit bedrag (eenmalig).
  const flatSaleValue = Number(mappingConfig.flat_sale_value) || 0;
  if (isSale && flatSaleValue > 0) {
    return {
      annualValue: flatSaleValue,
      isSale: true,
      isRecurring: false,
      frequencyType: 'oneoff',
      frequencyMultiplier: 1,
      frequencyMatchedKey: '(vast bedrag per sale)',
    };
  }

  // Frequency source mirrors get_project_annual_value: ONLY the configured freq_col
  // (plus the normalised 'frequency' key). Deliberately NOT the generic 'frequentie'/
  // 'Frequentie' columns — for projects whose freq_col is a different field those hold
  // unrelated codes (e.g. 869 Hersenstichting: freq_col=Ntermijn empty while 'Frequentie'
  // held "1" for monthly machtigingen → the matrix read ×1 i.p.v. ×12). When freq_col is
  // empty the detection falls back to the result name, exactly like the RPC.
  const freqRaw = rawData['frequency'] || rawData[mappingConfig.freq_col];

  // Pass `resultaat` so the frequency can be derived from the result name when the
  // frequency column is empty (e.g. 919 "Machtiging per Maand" with an empty
  // Ntermijn). Mirrors get_project_annual_value's freq_map(resultaat) fallback, so
  // the report matrix/analysis agree with the dashboard KPI. Without it these paths
  // fell back to ×1 while the RPC used ×12.
  const freqResult = detectFrequencyFromConfig(freqRaw, mappingConfig.freq_map, resultaat);

  // Inbound (retentie): behouden/gedeeltelijk/verloren records dragen óók jaarwaarde
  // (behouden waarde resp. verloren waarde in de retentie-matrix), ook al zijn ze geen
  // sale. Zonder dit bleef annual_value 0 en viel de matrix terug op een hardcoded ×12
  // die de freq_map negeerde (Ntermijn "J" = jaarlijks werd als maandelijks geteld).
  const hasInboundLists =
    (mappingConfig.retention_results?.length ?? 0) > 0 ||
    (mappingConfig.partial_success_results?.length ?? 0) > 0 ||
    (mappingConfig.lost_results?.length ?? 0) > 0;
  const inboundCategory = !isSale && hasInboundLists
    ? categorizeInboundResult(resultaat || '', mappingConfig)
    : null;
  const carriesValue = isSale
    || inboundCategory === 'retained'
    || inboundCategory === 'partial'
    || inboundCategory === 'lost';

  if (!carriesValue) {
    return {
      ...defaultResult,
      isSale: false,
      frequencyType: freqResult.type,
      frequencyMultiplier: freqResult.multiplier,
      frequencyMatchedKey: freqResult.matchedKey,
    };
  }

  const amountRaw = rawData[mappingConfig.amount_col]
    || rawData['amount']
    || rawData['termijnbedrag']
    || rawData['Bedrag'];

  if (!amountRaw) {
    return {
      annualValue: 0,
      isSale,
      isRecurring: isSale && !freqResult.isOneOff,
      frequencyType: freqResult.type,
      frequencyMultiplier: freqResult.multiplier,
      frequencyMatchedKey: freqResult.matchedKey,
    };
  }

  // 2. Bedrag × frequentie (gewone outbound-campagnes).
  const amount = parseDutchFloat(typeof amountRaw === 'number' ? amountRaw : String(amountRaw));

  return {
    annualValue: amount * freqResult.multiplier,
    isSale,
    isRecurring: isSale && !freqResult.isOneOff,
    frequencyType: freqResult.type,
    frequencyMultiplier: freqResult.multiplier,
    frequencyMatchedKey: freqResult.matchedKey,
  };
};

export const getDayName = (beldatumDate: string | null, beldatum: string | null): string => {
  if (beldatumDate) {
    const date = new Date(beldatumDate);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('nl-NL', { weekday: 'long' });
    }
  }

  if (beldatum) {
    const match = beldatum.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (match) {
      const [, day, month, year] = match;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('nl-NL', { weekday: 'long' });
      }
    }
    const date = new Date(beldatum);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('nl-NL', { weekday: 'long' });
    }
  }

  return '';
};
