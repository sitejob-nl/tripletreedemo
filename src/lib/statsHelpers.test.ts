import { describe, expect, it } from 'vitest';
import {
  categorizeInboundResult,
  categorizeNegativeResult,
  isExcludedFromNet,
  isUnreachable,
} from './statsHelpers';
import type { MappingConfig } from '@/types/database';

const config = (overrides: Partial<MappingConfig>): MappingConfig =>
  ({ amount_col: '', freq_col: '', freq_map: {}, sale_results: [], ...overrides }) as MappingConfig;

describe('config-entries met rommel (spaties, leeg) blijven werken', () => {
  // Regressie Hersenstichting 849: "Financiële reden " (trailing spatie) in
  // lost_results matchte stil op niets → 102 records buiten elke categorie.
  it('trailing spatie in lost_results matcht alsnog', () => {
    const cfg = config({ lost_results: ['Financiële reden '] });
    expect(categorizeInboundResult('Financiële reden', cfg)).toBe('lost');
  });

  it('trailing spatie in unreachable_results matcht alsnog', () => {
    const cfg = config({ unreachable_results: [' geen gehoor '] });
    expect(isUnreachable('Geen gehoor', cfg)).toBe(true);
  });

  it('trailing spatie in negative_argumentated matcht alsnog', () => {
    const cfg = config({ negative_argumentated: ['te oud '] });
    expect(categorizeNegativeResult('Te oud', cfg)).toBe('argumentated');
  });

  it('lege config-entry matcht nooit (zou anders ALLES matchen)', () => {
    // ''.includes('') is true — zonder guard telt een lege entry elke code
    // als onbereikbaar en stort de netto-conversie in.
    const cfg = config({ unreachable_results: ['', '   '] });
    expect(isUnreachable('Sale', cfg)).toBe(false);
  });

  it('lege entry in exclude_from_net sluit niet alles uit', () => {
    const cfg = config({ exclude_from_net: [' '] });
    expect(isExcludedFromNet('Geen interesse', cfg)).toBe(false);
  });
});
