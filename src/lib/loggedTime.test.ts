import { describe, expect, it } from 'vitest';
import { summarizeLoggedTime, resolvedLoggedSeconds } from './loggedTime';

describe('opgeslagen urencorrecties', () => {
  it('vervangt 12 door 10 uur in de dag, het totaal en de weekvergelijking', () => {
    const row = { date: '2026-11-16', total_seconds: 43200, corrected_seconds: 36000 };
    expect(summarizeLoggedTime([row])).toMatchObject({
      totalHours: 10, hasData: true, dailyHours: { maandag: 10 }, weeklyHours: { '2026-47': 10 },
    });
    expect(summarizeLoggedTime([{ ...row, corrected_seconds: null }]).totalHours).toBe(12);
  });

  it('onderscheidt een nulcorrectie van ontbrekende of lege bronuren', () => {
    const summary = summarizeLoggedTime([
      { date: '2026-11-16', total_seconds: 43200, corrected_seconds: 0 },
      { date: '2026-11-17', total_seconds: 0, corrected_seconds: null },
    ]);
    expect(summary).toMatchObject({ totalHours: 0, hasData: true, dailyHours: { maandag: 0 }, weeklyHours: { '2026-47': 0 } });
    expect(summary.dailyHours.dinsdag).toBeUndefined();
    expect(summary.dailyHours.woensdag).toBeUndefined();
    expect(summarizeLoggedTime([]).hasData).toBe(false);
  });

  it('behoudt dagafronding en de bestaande projectfactor', () => {
    const summary = summarizeLoggedTime([
      { date: '2026-11-16', total_seconds: 4000, corrected_seconds: null },
      { date: '2026-11-17', total_seconds: 5000, corrected_seconds: 5400 },
    ]);
    expect(summary.weeklyHours['2026-47']).toBe(4);
    expect(resolvedLoggedSeconds({ total_seconds: 3600, corrected_seconds: null }, 1.2)).toBe(4320);
  });
});
