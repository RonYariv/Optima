import { randomUUID } from 'crypto';

export { randomUUID };

export function makeTraceId(): string {
  return randomUUID();
}
