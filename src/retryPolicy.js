export const RETRY_REASONS = {
  BUSY: 'busy',
  NO_ANSWER: 'no_answer',
  UNAVAILABLE: 'unavailable',
  REJECTED: 'rejected',
  FAILED: 'failed',
  ANSWERED: 'answered',
  UNKNOWN: 'unknown',
};

export function shouldRetry(reason, attempt, enabled, maxAttempts) {
  if (!enabled || reason === RETRY_REASONS.ANSWERED) return false;
  if (maxAttempts && attempt >= maxAttempts) return false;
  return [
    RETRY_REASONS.BUSY,
    RETRY_REASONS.NO_ANSWER,
    RETRY_REASONS.UNAVAILABLE,
    RETRY_REASONS.REJECTED,
    RETRY_REASONS.FAILED,
    RETRY_REASONS.UNKNOWN,
  ].includes(reason);
}

export function nextRetryAt(now = Date.now(), delaySeconds = 60) {
  return new Date(now + Math.max(0, delaySeconds) * 1000).toISOString();
}
