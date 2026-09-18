import type { MappingConfig, ReportageOverrideMetrics, ReportageWeeklyOverride } from '@/types/database';

export const SERVICE_DAYS = [
  'maandag',
  'dinsdag',
  'woensdag',
  'donderdag',
  'vrijdag',
  'zaterdag',
  'zondag',
] as const;

export type ServiceDay = (typeof SERVICE_DAYS)[number];

export const SLIGRO_REASON_LABELS = [
  'Cadeaukaart / Belevenis activeren',
  'Cadeaukaart / Belevenis kwijt',
  'Cadeaukaart / Belevenis niet ontvangen',
  'Inloggegevens kwijt',
  'Inloggegevens niet ontvangen',
  'Inlogproblemen',
  'Retourneren',
  'Specificatie artikelen',
  'Status bestelling',
  'Werking webshop',
  'Defensie',
  'Telefoonnotitie gemaakt',
  'Overig',
] as const;

export const SERVICE_CALLER_LABELS = ['Algemeen', 'Defensie', 'Frans', 'Receptie'] as const;

export interface InboundServiceRecord {
  week_number?: number | null;
  day_name?: string | null;
  bc_result_naam?: string | null;
  bc_gesprekstijd?: number | null;
  raw_data?: Record<string, unknown> | null;
}

export interface InboundServiceBucket {
  offered: number;
  answered: number;
  shortAbandoned: number;
  answeredWithinThreshold: number;
  waitTimeKnown: number;
  durationSec: number;
  durationKnown: number;
  afterCallSec: number;
  afterCallKnown: number;
  agentHours: number;
  agentHoursKnown: boolean;
  mailHours: number;
  mailHoursKnown: boolean;
  reasons: Record<string, number>;
  callers: Record<string, number>;
}

export interface InboundServiceBreakdown {
  perDay: Record<ServiceDay, InboundServiceBucket>;
  total: InboundServiceBucket;
  reasonLabels: string[];
  callerLabels: string[];
  usesExcelOverrides: boolean;
}

const WAIT_TIME_KEYS = [
  'wachttijd_sec',
  'wachttijd',
  'bc_wachttijd',
  'wait_time_sec',
  'wait_time',
  'waiting_time_sec',
  'waiting_time',
  'ivr_duur',
  'bc_ivr_duur',
  'ivr_duration',
] as const;

const AFTER_CALL_KEYS = [
  'nawerktijd_sec',
  'nawerktijd',
  'bc_nawerktijd',
  'after_call_work_sec',
  'after_call_work',
  'wrap_up_time_sec',
  'wrap_up_time',
] as const;

const REASON_KEYS = ['reden_van_bellen', 'Reden_van_bellen', 'belreden', 'call_reason'] as const;
const CALLER_KEYS = ['gebeld_door', 'Gebeld_door', 'caller_group', 'called_by'] as const;

const createBucket = (): InboundServiceBucket => ({
  offered: 0,
  answered: 0,
  shortAbandoned: 0,
  answeredWithinThreshold: 0,
  waitTimeKnown: 0,
  durationSec: 0,
  durationKnown: 0,
  afterCallSec: 0,
  afterCallKnown: 0,
  agentHours: 0,
  agentHoursKnown: false,
  mailHours: 0,
  mailHoursKnown: false,
  reasons: {},
  callers: {},
});

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function firstRawValue(raw: Record<string, unknown> | null | undefined, keys: readonly string[]): unknown {
  if (!raw) return null;
  for (const key of keys) {
    const value = raw[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return null;
}

export function parseDurationSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+(?:[.,]\d+)?$/.test(text)) {
    const parsed = Number(text.replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  const parts = text.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function configuredValues(config: Record<string, string[]> | undefined): Map<string, string> {
  const values = new Map<string, string>();
  for (const [label, aliases] of Object.entries(config ?? {})) {
    values.set(normalize(label), label);
    for (const alias of aliases) values.set(normalize(alias), label);
  }
  return values;
}

function canonicalReason(value: unknown, configured: Map<string, string>): string {
  const key = normalize(value);
  if (!key) return 'Overig';
  const configuredLabel = configured.get(key);
  if (configuredLabel) return configuredLabel;
  const exact = SLIGRO_REASON_LABELS.find((label) => normalize(label) === key);
  return exact ?? 'Overig';
}

function canonicalCaller(value: unknown, configured: Map<string, string>): string {
  const key = normalize(value);
  if (!key) return 'Algemeen';
  const configuredLabel = configured.get(key);
  if (configuredLabel) return configuredLabel;
  const exact = SERVICE_CALLER_LABELS.find((label) => normalize(label) === key);
  return exact ?? 'Algemeen';
}

function configuredShortAbandoned(mappingConfig?: MappingConfig): Set<string> {
  const configured = mappingConfig?.short_abandoned_results ?? [];
  return new Set(configured.map(normalize).filter(Boolean));
}

export function isShortAbandonedResult(result: unknown, mappingConfig?: MappingConfig): boolean {
  const key = normalize(result);
  if (!key) return false;
  const configured = configuredShortAbandoned(mappingConfig);
  if (configured.size > 0) return configured.has(key);
  return key === 'inbound verloren' || key === 'short abandoned' || key === 'abandoned';
}

function metricMaybeNumber(metrics: ReportageOverrideMetrics | undefined, key: string): number | null {
  const value = metrics?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function addCount(target: Record<string, number>, label: string, count = 1) {
  target[label] = (target[label] ?? 0) + count;
}

function applyRawRecord(
  bucket: InboundServiceBucket,
  record: InboundServiceRecord,
  mappingConfig: MappingConfig | undefined,
  serviceLevelSec: number,
  includeCore: boolean,
  includeBreakdowns: boolean,
  reasonConfig: Map<string, string>,
  callerConfig: Map<string, string>,
) {
  const result = record.bc_result_naam ?? '';
  const shortAbandoned = isShortAbandonedResult(result, mappingConfig);

  if (includeCore) {
    bucket.offered += 1;
    if (shortAbandoned) {
      bucket.shortAbandoned += 1;
    } else {
      bucket.answered += 1;
      const duration = Number(record.bc_gesprekstijd);
      if (Number.isFinite(duration) && duration >= 0) {
        bucket.durationSec += duration;
        bucket.durationKnown += 1;
      }
      const waitTime = parseDurationSeconds(firstRawValue(record.raw_data, WAIT_TIME_KEYS));
      if (waitTime !== null) {
        bucket.waitTimeKnown += 1;
        if (waitTime <= serviceLevelSec) bucket.answeredWithinThreshold += 1;
      }
      const afterCall = parseDurationSeconds(firstRawValue(record.raw_data, AFTER_CALL_KEYS));
      if (afterCall !== null) {
        bucket.afterCallKnown += 1;
        bucket.afterCallSec += afterCall;
      }
    }
  }

  if (!shortAbandoned && includeBreakdowns) {
    addCount(bucket.reasons, canonicalReason(firstRawValue(record.raw_data, REASON_KEYS), reasonConfig));
    addCount(bucket.callers, canonicalCaller(firstRawValue(record.raw_data, CALLER_KEYS), callerConfig));
  }
}

function hasOverrideBreakdowns(metrics: ReportageOverrideMetrics | undefined): boolean {
  return Object.keys(metrics ?? {}).some((key) => key.startsWith('reason:') || key.startsWith('caller:'));
}

function applyOverrideMetrics(bucket: InboundServiceBucket, metrics: ReportageOverrideMetrics | undefined) {
  if (!metrics) return;
  const offered = metricMaybeNumber(metrics, 'offered');
  const answered = metricMaybeNumber(metrics, 'answered');
  const shortAbandoned = metricMaybeNumber(metrics, 'abandonedUnder60');
  const within = metricMaybeNumber(metrics, 'answeredUnder60');
  const avgCall = metricMaybeNumber(metrics, 'avgCall');
  const avgHandling = metricMaybeNumber(metrics, 'avgHandling');
  const hours = metricMaybeNumber(metrics, 'hours');
  const mailHours = metricMaybeNumber(metrics, 'mailHours');

  bucket.offered += offered ?? 0;
  bucket.answered += answered ?? Math.max(0, (offered ?? 0) - (shortAbandoned ?? 0));
  bucket.shortAbandoned += shortAbandoned ?? Math.max(0, (offered ?? 0) - (answered ?? 0));
  if (within !== null && answered !== null) {
    bucket.answeredWithinThreshold += within;
    bucket.waitTimeKnown += answered;
  }
  if (avgCall !== null && answered !== null) {
    bucket.durationSec += avgCall * answered;
    bucket.durationKnown += answered;
  }
  if (avgHandling !== null && answered !== null) {
    bucket.afterCallSec += avgHandling * answered;
    bucket.afterCallKnown += answered;
  }
  if (hours !== null) {
    bucket.agentHours += hours;
    bucket.agentHoursKnown = true;
  }
  if (mailHours !== null) {
    bucket.mailHours += mailHours;
    bucket.mailHoursKnown = true;
  }
  for (const [key, rawValue] of Object.entries(metrics)) {
    const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(value)) continue;
    if (key.startsWith('reason:')) addCount(bucket.reasons, key.slice('reason:'.length), value);
    if (key.startsWith('caller:')) addCount(bucket.callers, key.slice('caller:'.length), value);
  }
}

export function buildInboundServiceBreakdown(
  records: InboundServiceRecord[],
  mappingConfig?: MappingConfig,
  overrides: ReportageWeeklyOverride[] = [],
): InboundServiceBreakdown {
  const perDay = Object.fromEntries(SERVICE_DAYS.map((day) => [day, createBucket()])) as Record<ServiceDay, InboundServiceBucket>;
  const total = createBucket();
  const serviceLevelSec = mappingConfig?.service_targets?.service_level_sec ?? 30;
  const reasonConfig = configuredValues(mappingConfig?.service_reason_categories);
  const callerConfig = configuredValues(mappingConfig?.service_caller_categories);
  const overridesByWeek = new Map(overrides.map((override) => [override.week_number, override]));

  for (const record of records) {
    const day = normalize(record.day_name) as ServiceDay;
    if (!SERVICE_DAYS.includes(day)) continue;
    const override = overridesByWeek.get(Number(record.week_number));
    const includeCore = !override;
    const includeBreakdowns = !override || !hasOverrideBreakdowns(override.metrics);
    applyRawRecord(perDay[day], record, mappingConfig, serviceLevelSec, includeCore, includeBreakdowns, reasonConfig, callerConfig);
    applyRawRecord(total, record, mappingConfig, serviceLevelSec, includeCore, includeBreakdowns, reasonConfig, callerConfig);
  }

  for (const override of overrides) {
    applyOverrideMetrics(total, override.metrics);
    for (const day of SERVICE_DAYS) applyOverrideMetrics(perDay[day], override.daily_metrics?.[day]);
  }

  const configuredReasons = Object.keys(mappingConfig?.service_reason_categories ?? {});
  const configuredCallers = Object.keys(mappingConfig?.service_caller_categories ?? {});
  const foundReasons = Object.keys(total.reasons);
  const foundCallers = Object.keys(total.callers);
  const looksLikeSligro = foundReasons.some((label) => SLIGRO_REASON_LABELS.includes(label as (typeof SLIGRO_REASON_LABELS)[number]));
  const reasonLabels = configuredReasons.length > 0
    ? [...configuredReasons, ...(configuredReasons.includes('Overig') ? [] : ['Overig'])]
    : looksLikeSligro
      ? [...SLIGRO_REASON_LABELS]
      : foundReasons.sort((a, b) => a.localeCompare(b, 'nl'));
  const callerLabels = configuredCallers.length > 0
    ? [...configuredCallers, ...(configuredCallers.includes('Algemeen') ? [] : ['Algemeen'])]
    : foundCallers.length > 0
      ? [...SERVICE_CALLER_LABELS]
      : [];

  return { perDay, total, reasonLabels, callerLabels, usesExcelOverrides: overrides.length > 0 };
}

export function completeMetric(value: number, known: number, expected: number): number | null {
  if (expected === 0) return 0;
  return known >= expected ? value : null;
}

export function averageMetric(total: number, known: number, expected: number): number | null {
  const complete = completeMetric(total, known, expected);
  return complete === null || expected === 0 ? (expected === 0 ? 0 : null) : complete / expected;
}
