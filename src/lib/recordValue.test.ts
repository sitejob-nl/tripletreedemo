import { describe, expect, it } from 'vitest';
import { calculateValuesFromRaw } from '@/lib/recordValue';
import type { MappingConfig } from '@/types/database';

const config = (overrides: Partial<MappingConfig> = {}): MappingConfig => ({
  amount_col: 'Nbedrag',
  freq_col: 'Ntermijn',
  freq_map: { M: 12, J: 1, 'machtiging per maand': 12 },
  sale_results: ['Machtiging per Maand'],
  ...overrides,
});

describe('recordwaarde uit goedgekeurde mapping', () => {
  it('geeft projectvelden voorrang boven oude generieke velden', () => {
    const value = calculateValuesFromRaw({
      Nbedrag: '5,00',
      Bedrag: '25,00',
      Ntermijn: 'M',
      Frequentie: 'J',
    }, 'Machtiging per Maand', config());

    expect(value.annualValue).toBe(60);
    expect(value.frequencyMultiplier).toBe(12);
  });

  it('kan de goedgekeurde resultaatcode als frequentie-fallback gebruiken', () => {
    const value = calculateValuesFromRaw({ Nbedrag: '10,00' }, 'Machtiging per Maand', config());

    expect(value.annualValue).toBe(120);
    expect(value.frequencyMultiplier).toBe(12);
  });
});
