import { scryptSync, randomBytes, timingSafeEqual, createHmac, createHash, randomInt } from 'node:crypto';

const DEV_FALLBACK_SECRET = 'mealplanner-local-dev-only-secret-do-not-use-in-production';
let warnedAboutFallback = false;

/**
 * Reads the JWT secret lazily (after .env has been loaded by the entry point).
 * In production a missing/weak secret is a fatal configuration error.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret && secret.length >= 32) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to a random value of at least 32 characters in production.');
  }
  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn('[auth] JWT_SECRET missing or shorter than 32 chars - using a development-only fallback secret.');
  }
  return DEV_FALLBACK_SECRET;
}

export function assertAuthConfiguration(): void {
  getJwtSecret();
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const keyBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = scryptSync(password, salt, 64);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return timingSafeEqual(keyBuffer, derivedBuffer);
}

export interface JwtPayload {
  userId: string;
  email: string;
  exp: number;
}

function hmac(data: string): string {
  return createHmac('sha256', getJwtSecret()).update(data).digest('base64url');
}

export function signToken(userId: string, email: string, expiresInSeconds = 7 * 24 * 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload: JwtPayload = {
    userId,
    email,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${payloadB64}.${hmac(`${header}.${payloadB64}`)}`;
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payloadB64, signature] = parts;
    const expected = Buffer.from(hmac(`${header}.${payloadB64}`));
    const given = Buffer.from(signature);
    // Constant-time signature comparison
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as JwtPayload;
    if (typeof payload.userId !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/** 8-digit numeric recovery code (cryptographically random). */
export function generateRecoveryCode(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, '0');
}

/** Recovery codes are stored hashed, never in plain text. */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(`mp-reset:${code.trim()}`).digest('hex');
}

export function recoveryCodeMatches(code: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(hashRecoveryCode(code));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}
