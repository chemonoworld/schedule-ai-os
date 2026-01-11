// ID generation utilities

export function generateId(): string {
  return crypto.randomUUID();
}

export function generateShortId(): string {
  return crypto.randomUUID().split('-')[0];
}
