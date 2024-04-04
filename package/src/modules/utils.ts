/**
 * Timeout error
 */
export class TimeoutError extends Error {
  constructor(timeElapsed: number) {
    super(`Timeout of ${timeElapsed}ms exceeded`);
    this.name = 'TimeoutError';
  }
}

/**
 * Rejects a promise after a given time. Useful for timeouts in async functions.
 * Rejection is a TimeoutError.
 * @param time Time in milliseconds
 * @returns Promise that rejects after the given time
 */
export function rejectAfter(time: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new TimeoutError(time)), time);
  });
};