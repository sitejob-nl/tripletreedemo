import type { QueryClient } from '@tanstack/react-query';

export async function refreshHoursQueries(queryClient: QueryClient, projectId: string) {
  await Promise.all(['daily_hours_breakdown', 'logged_time', 'logged_time_weekly'].map((key) =>
    queryClient.invalidateQueries({ queryKey: [key, projectId] }),
  ));
}
