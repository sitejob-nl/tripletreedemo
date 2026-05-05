const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const getSupabaseFunctionErrorMessage = async (
  error: unknown,
  fallback = 'Edge function request failed',
) => {
  if (isRecord(error) && isRecord(error.context) && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      if (isRecord(body) && typeof body.error === 'string') {
        return body.error;
      }
    } catch (_parseError) {
      // Fall back to the SDK error message below.
    }
  }

  return error instanceof Error ? error.message : fallback;
};
