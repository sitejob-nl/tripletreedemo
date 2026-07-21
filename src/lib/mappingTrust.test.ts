import { describe, expect, it } from 'vitest';
import {
  buildMappingSuggestion,
  inferFrequencyMultiplier,
  suggestResultCategory,
} from '@/lib/mappingTrust';

describe('mappingvoorstellen', () => {
  it('normaliseert bekende frequenties en weigert onbekende waarden', () => {
    expect(inferFrequencyMultiplier('Maandelijks')).toBe(12);
    expect(inferFrequencyMultiplier('Per half jaar')).toBe(2);
    expect(inferFrequencyMultiplier('2-maandelijks')).toBe(6);
    expect(inferFrequencyMultiplier('1')).toBeNull();
    expect(inferFrequencyMultiplier('wanneer mogelijk')).toBeNull();
  });

  it('maakt voorstellen zonder de actieve mapping te wijzigen', () => {
    const suggestion = buildMappingSuggestion({
      fields: [
        { name: 'DonatieBedrag', count: 20 },
        { name: 'Betaalfrequentie_nieuw', count: 20 },
      ],
      results: [
        { value: 'Sale', count: 4 },
        { value: 'Nieuwe neutrale code', count: 1 },
      ],
      frequency_values: [
        { value: 'Maandelijks', count: 3 },
        { value: 'Onbekend ritme', count: 1 },
      ],
    }, 'outbound');

    expect(suggestion.amount_col).toBe('DonatieBedrag');
    expect(suggestion.freq_col).toBe('Betaalfrequentie_nieuw');
    expect(suggestion.categories.sale_results).toEqual(['Sale']);
    expect(suggestion.categories.other_results).toEqual(['Nieuwe neutrale code']);
    expect(suggestion.freq_map).toEqual({ maandelijks: 12 });
  });

  it('past vaste regels toe voor inbound en service', () => {
    expect(suggestResultCategory('Donateur behouden', 'inbound')).toBe('retention_results');
    expect(suggestResultCategory('Gesprek opgelost', 'inbound_service')).toBe('handled_results');
    expect(suggestResultCategory('Niet afgehandeld', 'inbound_service')).toBe('not_handled_results');
    expect(suggestResultCategory('Voicemail/antwoordapparaat', 'inbound_service')).toBe('not_handled_results');
  });

  it('stelt negatieve donateurcodes nooit als sale voor', () => {
    expect(suggestResultCategory('Is al donateur', 'outbound')).toBe('negative_not_argumentated');
    expect(suggestResultCategory('Machtiging per Maand', 'outbound')).toBe('sale_results');
  });
});
