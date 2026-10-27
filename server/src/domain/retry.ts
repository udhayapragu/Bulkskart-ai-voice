export interface RetryPolicy {
  maxAttempts: number;
  retryDelayMinutes: number;
}

export type AttemptResult = 'retry_scheduled' | 'exhausted';

/**
 * Decides what happens to a contact after a failed attempt (no answer, busy,
 * provider failure). attempts is the number of attempts already made, including this one.
 */
export function nextAttemptAfterFailure(
  attempts: number,
  policy: RetryPolicy,
  now: Date,
): { result: AttemptResult; nextAttemptAt: string | null } {
  if (attempts >= policy.maxAttempts) return { result: 'exhausted', nextAttemptAt: null };
  const next = new Date(now.getTime() + policy.retryDelayMinutes * 60_000);
  return { result: 'retry_scheduled', nextAttemptAt: next.toISOString() };
}
