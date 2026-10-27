import { createHmac, timingSafeEqual } from 'node:crypto';

// Stateless signed session token: base64url(payload).base64url(HMAC-SHA256(payload)).
export interface SessionPayload {
  sub: string;
  exp: number; // unix seconds
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

function sign(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function createSessionToken(subject: string, secret: string, ttlSeconds: number, now = Date.now()): string {
  const payload: SessionPayload = { sub: subject, exp: Math.floor(now / 1000) + ttlSeconds };
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifySessionToken(token: string, secret: string, now = Date.now()): SessionPayload | null {
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(encoded, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
