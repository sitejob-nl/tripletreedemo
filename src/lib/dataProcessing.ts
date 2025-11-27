import { ProjectMapping, RawCallRecord, ProcessedCallRecord } from '@/types/dashboard';

export const parseDutchFloat = (str: string | number): number => {
  if (!str) return 0;
  if (typeof str === 'number') return str;
  return parseFloat(str.replace(',', '.').replace(/[^0-9.]/g, ''));
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
