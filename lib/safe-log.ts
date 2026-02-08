/**
 * Safe server-side error logging. Logs only a short context and the error message.
 * Avoids logging stack traces, request bodies, or other sensitive data.
 */
export function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}]`, message);
}
