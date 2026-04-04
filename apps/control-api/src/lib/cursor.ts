/**
 * Cursor pagination helpers.
 *
 * Cursors are opaque base64-encoded strings wrapping { createdAt, id }.
 * Using (createdAt, id) makes pagination stable even when rows share the same timestamp.
 */

export type CursorPayload = { createdAt: string; id: string };

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'createdAt' in parsed &&
      'id' in parsed &&
      typeof (parsed as CursorPayload).createdAt === 'string' &&
      typeof (parsed as CursorPayload).id === 'string'
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}
