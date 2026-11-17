import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkBook } from 'xlsx-js-style';
import { utils } from 'xlsx-js-style';
import { exportOutboundStandardYear } from './outboundStandardExport';
import { exportInboundRetentionYear } from './inboundRetentionExport';

const fixture = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  writeFile: vi.fn(),
}));

vi.mock('xlsx-js-style', async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof import('xlsx-js-style') }>();
  return { ...actual.default, writeFile: fixture.writeFile };
});
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query, gte: () => query, lte: () => query,
        order: () => query, range: () => query,
        then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: fixture.tables[table] ?? [], error: null }).then(resolve),
      };
      return query;
    },
  },
}));

beforeEach(() => {
  fixture.writeFile.mockClear();
  fixture.tables = {
    call_records: [{
      basicall_record_id: 1, beldatum: '16-11-2026', beldatum_date: '2026-11-16',
      gesprekstijd_sec: 43200, resultaat: 'Sale', week_number: 47, raw_data: {},
    }],
    daily_logged_time: [{ date: '2026-11-16', total_seconds: 43200, corrected_seconds: 36000 }],
  };
});

describe.each([
  ['outbound', exportOutboundStandardYear],
  ['retentie', exportInboundRetentionYear],
] as const)('%s Excel-export', (_name, exportYear) => {
  it.each([10, 0, null])('gebruikt correctie %s in dag, week en jaar', async (hours) => {
    fixture.tables.daily_logged_time = [{ date: '2026-11-16', total_seconds: 43200, corrected_seconds: hours === null ? null : hours * 3600 }];
    await exportYear({ projectId: 'max', projectName: 'Max Magazine', hourlyRate: 50, vatRate: 21, year: 2026 });
    expect(fixture.writeFile).toHaveBeenCalledTimes(1);
    const workbook = fixture.writeFile.mock.calls[0][0] as WorkBook;
    const expected = hours ?? 12;
    const weekRows = utils.sheet_to_json<string[]>(workbook.Sheets.W47, { header: 1 });
    const week = weekRows.find((row) => row[0] === 'Aantal beluren');
    expect(Number(week?.[3])).toBe(expected);
    expect(Number(week?.[5])).toBe(expected);
    const yearRows = utils.sheet_to_json<string[]>(workbook.Sheets.Totaal, { header: 1 });
    const year = yearRows.find((row) => row[0] === 'Aantal beluren');
    expect(Number(year?.[3])).toBe(expected);
    expect(Number(year?.[51])).toBe(expected);
  });
});
