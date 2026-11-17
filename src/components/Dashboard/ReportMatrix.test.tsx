import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportMatrix } from './ReportMatrix';
import { summarizeLoggedTime } from '@/lib/loggedTime';
import type { ProcessedCallRecord } from '@/types/dashboard';

const record = {
  id: 1, day_name: 'maandag', week_number: 47, normalized_date: '2026-11-16',
  bc_beldatum: '16-11-2026', bc_gesprekstijd: 43200, bc_result_naam: 'Sale',
  annual_value: 100, is_sale: true, is_recurring: false, call_duration_min: 720,
} as ProcessedCallRecord;

const rowText = (html: string, label: string) => {
  const row = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].find((match) => match[1].includes(label));
  return (row?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
};

describe('rapportagetabel met urencorrectie', () => {
  it.each([10, 0])('gebruikt %s gecorrigeerde uren voor dag, totaal en kosten', (hours) => {
    const { dailyHours } = summarizeLoggedTime([{ date: '2026-11-16', total_seconds: 43200, corrected_seconds: hours * 3600 }]);
    const html = renderToStaticMarkup(createElement(ReportMatrix, { data: [record], hourlyRate: 50, selectedWeek: '2026-47', dailyLoggedHours: dailyHours, isAdmin: true }));
    const hoursRow = rowText(html, 'Aantal beluren');
    expect(hoursRow).toContain(`Aantal beluren ${hours.toFixed(2)}`);
    expect(hoursRow).toMatch(new RegExp(`${hours.toFixed(2).replace('.', '\\.')}\u0024`));
    expect(hoursRow).not.toContain('12.00');
    expect(rowText(html, 'Investering (Excl BTW)')).toContain((hours * 50).toFixed(2).replace('.', ','));
  });

  it('behoudt de gesprekstijd-fallback wanneer de urenbron ontbreekt', () => {
    const html = renderToStaticMarkup(createElement(ReportMatrix, { data: [record], hourlyRate: 50, selectedWeek: '2026-47', dailyLoggedHours: {} }));
    expect(rowText(html, 'Aantal beluren')).toContain('12.00');
  });
});
