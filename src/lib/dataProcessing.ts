import { ProjectMapping, RawCallRecord, ProcessedCallRecord } from '@/types/dashboard';

/**
 * Leest een bedrag uit vrije BasiCall-invoer. Exacte spiegel van `public.parse_amount_text`
 * in SQL (migration 20260729103000) — de KPI-kaart rekent via de RPC en matrix/export via
 * deze functie, dus elk verschil laat dezelfde campagne twee bedragen tonen.
 *
 * Regels:
 *  1. alles behalve cijfers, punt, komma en minteken weggooien;
 *  2. bij twee scheidingstekens is de RECHTSE de decimaal ("1.234,56" NL, "1,234.56" EN);
 *  3. alleen een komma -> decimaalteken;
 *  4. herhaalde punten uit typefouten samenvouwen ("5,.00" -> "5.00");
 *  5. de eerste geldige numerieke token pakken, anders 0.
 *
 * Nooit NaN: de oude versie gaf voor onleesbare invoer NaN terug, wat via optellingen de
 * hele jaarwaarde-kolom op NaN zette.
 */
export const parseDutchFloat = (str: string | number | null | undefined): number => {
  if (typeof str === 'number') return Number.isFinite(str) ? str : 0;
  if (!str) return 0;

  let value = String(str).replace(/[^0-9.,-]/g, '');
  if (!value) return 0;

  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    value = lastComma > lastDot
      ? value.replace(/\./g, '').replace(/,/g, '.')
      : value.replace(/,/g, '');
  } else if (lastComma >= 0) {
    value = value.replace(/,/g, '.');
  }

  value = value.replace(/\.{2,}/g, '.');
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? parseFloat(match[0]) : 0;
};

export const getWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

export const calculateValues = (
  record: RawCallRecord,
  mapping: ProjectMapping
): { annualValue: number; isRecurring: boolean } => {
  if (!mapping.amount_col || !mapping.freq_col) {
    return { annualValue: 0, isRecurring: false };
  }

  const amountRaw = (record as any)[mapping.amount_col];
  const freqRaw = (record as any)[mapping.freq_col];

  if (!amountRaw || !freqRaw) {
    return { annualValue: 0, isRecurring: false };
  }

  const amount = parseDutchFloat(amountRaw);
  const freqKey = freqRaw.toLowerCase().trim();
  const multiplier = mapping.freq_map[freqKey] || 1;

  const isOneOff = freqKey.includes('eenmalig') || freqKey === '1';

  return {
    annualValue: amount * multiplier,
    isRecurring: !isOneOff,
  };
};

export const processCallData = (
  rawData: RawCallRecord[],
  mapping: ProjectMapping
): ProcessedCallRecord[] => {
  return rawData.map((record) => {
    const date = new Date(record.bc_beldatum);
    const dayName = date.toLocaleDateString('nl-NL', { weekday: 'long' });
    const weekNum = getWeekNumber(date);

    const { annualValue, isRecurring } = calculateValues(record, mapping);
    const isSale = ['Sale', 'Donateur'].includes(record.bc_result_naam);

    return {
      ...record,
      normalized_date: record.bc_beldatum,
      day_name: dayName,
      week_number: weekNum,
      annual_value: annualValue,
      is_recurring: isRecurring,
      is_sale: isSale,
      call_duration_min: Math.round(record.bc_gesprekstijd / 60),
    };
  });
};
