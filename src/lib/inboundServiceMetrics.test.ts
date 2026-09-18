import { describe, expect, it } from 'vitest';
import type { MappingConfig, ReportageWeeklyOverride } from '@/types/database';
import {
  buildInboundServiceBreakdown,
  completeMetric,
  isShortAbandonedResult,
  parseDurationSeconds,
} from '@/lib/inboundServiceMetrics';

const mapping = {
  amount_col: '',
  freq_col: '',
  freq_map: {},
  sale_results: [],
  short_abandoned_results: ['Inbound verloren'],
  service_targets: { service_level_sec: 30 },
} satisfies MappingConfig;

describe('inbound-service rapportagedefinities', () => {
  it('telt aangeboden minus short abandoned als aangenomen', () => {
    const result = buildInboundServiceBreakdown([
      { week_number: 38, day_name: 'maandag', bc_result_naam: 'Afgehandeld', bc_gesprekstijd: 120, raw_data: { reden_van_bellen: 'Defensie', gebeld_door: 'Defensie', wachttijd_sec: 12 } },
      { week_number: 38, day_name: 'maandag', bc_result_naam: 'Voicemail/antwoordapparaat', bc_gesprekstijd: 3, raw_data: {} },
      { week_number: 38, day_name: 'maandag', bc_result_naam: 'Inbound verloren', bc_gesprekstijd: 0, raw_data: {} },
    ], mapping);

    expect(result.total.offered).toBe(3);
    expect(result.total.answered).toBe(2);
    expect(result.total.shortAbandoned).toBe(1);
    expect(result.total.reasons).toEqual({ Defensie: 1, Overig: 1 });
    expect(result.total.callers).toEqual({ Defensie: 1, Algemeen: 1 });
    expect(completeMetric(result.total.answeredWithinThreshold, result.total.waitTimeKnown, result.total.answered)).toBeNull();
  });

  it('gebruikt een Excel-override voor kern-KPI’s zonder live records dubbel te tellen', () => {
    const override = {
      week_number: 38,
      metrics: { offered: 12, answered: 11, abandonedUnder60: 1, answeredUnder60: 9 },
      daily_metrics: { maandag: { offered: 12, answered: 11, abandonedUnder60: 1, answeredUnder60: 9 } },
    } as unknown as ReportageWeeklyOverride;
    const result = buildInboundServiceBreakdown([
      { week_number: 38, day_name: 'maandag', bc_result_naam: 'Afgehandeld', raw_data: { reden_van_bellen: 'Inlogproblemen', gebeld_door: 'Algemeen' } },
    ], mapping, [override]);

    expect(result.total.offered).toBe(12);
    expect(result.total.answered).toBe(11);
    expect(result.total.answeredWithinThreshold).toBe(9);
    expect(result.total.reasons.Inlogproblemen).toBe(1);
  });

  it('herkent alleen expliciete wachttijdvelden en nooit gespreksduur', () => {
    expect(parseDurationSeconds('00:00:29')).toBe(29);
    expect(parseDurationSeconds('1:02')).toBe(62);
    expect(parseDurationSeconds('onbekend')).toBeNull();
    expect(isShortAbandonedResult('Inbound verloren', mapping)).toBe(true);
    expect(isShortAbandonedResult('Voicemail/antwoordapparaat', mapping)).toBe(false);
  });
});
