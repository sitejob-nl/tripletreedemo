import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { expect, it } from 'vitest';
import { refreshHoursQueries } from './refreshHoursQueries';

it('ververst alle actieve urentabellen na 12 -> 10 en laat andere projecten met rust', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  const keys = ['daily_hours_breakdown', 'logged_time', 'logged_time_weekly'];
  let savedHours = 12;
  const unsubscribers = keys.map((key) => {
    client.setQueryData([key, 'max', '2026-47'], 12);
    client.setQueryData([key, 'other'], 7);
    const observer = new QueryObserver(client, { queryKey: [key, 'max', '2026-47'], queryFn: async () => savedHours });
    return observer.subscribe(() => {});
  });
  // Een niet-geopende periode moet bij het volgende bezoek ook opnieuw laden.
  client.setQueryData(['logged_time', 'max', '2026-46'], 12);
  try {
    savedHours = 10;
    await refreshHoursQueries(client, 'max');
    for (const key of keys) {
      expect(client.getQueryData([key, 'max', '2026-47'])).toBe(10);
      expect(client.getQueryState([key, 'other'])?.isInvalidated).toBe(false);
    }
    expect(client.getQueryState(['logged_time', 'max', '2026-46'])?.isInvalidated).toBe(true);
  } finally {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    client.clear();
  }
});
