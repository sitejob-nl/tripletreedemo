import { describe, expect, it } from 'vitest';
import type { MappingConfig } from '@/types/database';
import {
  deriveQualityState,
  findMissingSyncDays,
  isCompleteSyncCoverage,
  mappingRequiresValueFields,
  resultDriftImpact,
  type SyncCoverage,
} from '@/lib/dataQuality';

const day = (
  overrides: Partial<SyncCoverage> = {},
): SyncCoverage => ({
  day: '2026-07-13',
  status: 'success',
  expectedRecords: 12,
  recordsSynced: 12,
  failedRecords: 0,
  ...overrides,
});

describe('syncvolledigheid', () => {
  it('accepteert een volledige sync', () => {
    expect(isCompleteSyncCoverage(day())).toBe(true);
  });

  it('accepteert een succesvolle nul-recorddag', () => {
    expect(isCompleteSyncCoverage(day({
      expectedRecords: 0,
      recordsSynced: 0,
    }))).toBe(true);
  });

  it('houdt een gedeeltelijke sync open totdat de herstelronde compleet is', () => {
    const partial = day({ status: 'warning', recordsSynced: 9, failedRecords: 3 });
    expect(findMissingSyncDays([partial.day], [partial])).toEqual([partial.day]);
    expect(findMissingSyncDays([partial.day], [partial, day()])).toEqual([]);
  });

  it('detecteert een volledig ontbrekende dag', () => {
    expect(findMissingSyncDays(['2026-07-12', '2026-07-13'], [day()]))
      .toEqual(['2026-07-12']);
  });
});

describe('gerichte impact', () => {
  it('blokkeert voor een nieuwe outbound-resultaatcode alleen de afhankelijke cijfers en export', () => {
    expect(resultDriftImpact('outbound')).toEqual([
      'sales', 'conversion', 'costs', 'annual_value', 'analysis', 'export',
    ]);
  });

  it('gebruikt overeenkomstige retentie- en service-KPI’s', () => {
    expect(resultDriftImpact('inbound')).toEqual(['retention', 'annual_value', 'analysis', 'export']);
    expect(resultDriftImpact('inbound_service')).toEqual(['service', 'analysis', 'export']);
  });

  it('vereist geen bedrag- of frequentieveld voor flat-value en serviceprojecten', () => {
    const flat = { flat_sale_value: 37.08 } as MappingConfig;
    expect(mappingRequiresValueFields('outbound', flat)).toBe(false);
    expect(mappingRequiresValueFields('inbound_service', {} as MappingConfig)).toBe(false);
    expect(mappingRequiresValueFields('outbound', {} as MappingConfig)).toBe(true);
  });
});

describe('statuslogica', () => {
  it('blokkeert alle cijfers bij een ontbrekende dag wanneer handhaving aanstaat', () => {
    const quality = deriveQualityState({
      reportingState: 'live',
      enforcementEnabled: true,
      requiredDays: ['2026-07-13'],
      coverage: [],
    });
    expect(quality.status).toBe('blocked');
    expect(quality.blockedMetrics).toContain('export');
    expect(quality.blockedMetrics).toContain('records');
  });

  it('registreert problemen observe-only zonder klantblokkade', () => {
    const quality = deriveQualityState({
      reportingState: 'live',
      enforcementEnabled: false,
      requiredDays: ['2026-07-13'],
      coverage: [],
    });
    expect(quality.status).toBe('attention');
    expect(quality.blockedMetrics).toEqual([]);
  });

  it('blokkeert een historische periode niet door een probleem buiten de selectie', () => {
    const quality = deriveQualityState({
      reportingState: 'live',
      enforcementEnabled: true,
      requiredDays: [],
      coverage: [],
      issueMetrics: [],
    });
    expect(quality.status).toBe('verified');
  });

  it('houdt paused en ended historisch beschikbaar', () => {
    const base = { enforcementEnabled: true, requiredDays: ['2026-07-13'], coverage: [] };
    expect(deriveQualityState({ ...base, reportingState: 'paused' }).blockedMetrics).toEqual([]);
    expect(deriveQualityState({ ...base, reportingState: 'ended' }).status).toBe('historical');
  });
});
