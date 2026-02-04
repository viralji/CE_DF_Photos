/**
 * Sanitization helpers for user input. Use for API request validation and storage.
 */

/** Max length for feedback content (question/suggestion). */
export const MAX_FEEDBACK_CONTENT_LENGTH = 10_000;

/** Max length for photo comment text. */
export const MAX_COMMENT_TEXT_LENGTH = 2_000;

/** Max length for photo_category (entity name) on upload. */
export const MAX_PHOTO_CATEGORY_LENGTH = 200;

/** Max length for routeId / subsectionId query params. */
export const MAX_ROUTE_SUBSECTION_ID_LENGTH = 200;

/** Allowed execution stage values for photo upload. */
export const ALLOWED_EXECUTION_STAGES = ['B', 'O', 'A'] as const;

/**
 * Trim and limit string length. Use for free-text user input before storing.
 */
export function sanitizeText(input: string, maxLength: number): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLength);
}

/**
 * Parse a positive integer from a string (e.g. ID param). Returns null if invalid.
 */
export function parsePositiveInt(value: string | null | undefined): number | null {
  if (value == null || typeof value !== 'string') return null;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 1) return null;
  return n;
}

/**
 * Validate execution stage for photo upload. Returns B, O, or A; otherwise null.
 */
export function sanitizeExecutionStage(value: string | null | undefined): 'B' | 'O' | 'A' | null {
  if (value == null || typeof value !== 'string') return null;
  const s = value.trim().toUpperCase();
  if (ALLOWED_EXECUTION_STAGES.includes(s as 'B' | 'O' | 'A')) return s as 'B' | 'O' | 'A';
  return null;
}

/**
 * Limit string length for IDs/labels (no trim). Use for routeId, subsectionId.
 */
export function limitLength(value: string | null | undefined, maxLength: number): string {
  if (value == null || typeof value !== 'string') return '';
  return value.slice(0, maxLength);
}
