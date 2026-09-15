import * as OTPAuth from 'otpauth';
import type { OTPAlgorithm, OTPEntry, OTPType } from '$lib/types';

/**
 * Normalizes user-input base32 secrets by removing spaces, hyphens, and converting to uppercase.
 */
export function cleanSecret(secret: string): string {
  return secret.replace(/[\s\-_]/g, '').toUpperCase();
}

/**
 * Validates whether a given string is a valid base32 encoded secret.
 */
export function isValidBase32(secret: string): boolean {
  const cleaned = cleanSecret(secret);
  if (!cleaned) return false;
  return /^[A-Z2-7]+=*$/.test(cleaned);
}

/**
 * Formats an OTP code with clean grouping (e.g., "123 456" or "1234 5678").
 */
export function formatToken(token: string): string {
  if (!token) return '';
  const len = token.length;
  if (len === 6) {
    return `${token.slice(0, 3)} ${token.slice(3)}`;
  }
  if (len === 8) {
    return `${token.slice(0, 4)} ${token.slice(4)}`;
  }
  if (len === 7) {
    return `${token.slice(0, 3)} ${token.slice(3)}`;
  }
  return token;
}

/**
 * Calculates remaining seconds in the current TOTP period and fractional progress.
 */
export function getPeriodRemaining(
  period = 30,
  timestamp: number = Date.now(),
): { seconds: number; progress: number } {
  const epochSeconds = Math.floor(timestamp / 1000);
  const elapsed = epochSeconds % period;
  const remaining = period - elapsed;
  const progress = remaining / period;
  return {
    seconds: remaining,
    progress: Math.max(0, Math.min(1, progress)),
  };
}

/**
 * Generates the current one-time code for a given OTPEntry.
 */
export function generateToken(entry: OTPEntry, timestamp: number = Date.now()): string {
  const secretStr = cleanSecret(entry.secret);

  if (entry.type === 'hotp') {
    const hotp = new OTPAuth.HOTP({
      issuer: entry.issuer || undefined,
      label: entry.label || undefined,
      algorithm: entry.algorithm || 'SHA1',
      digits: entry.digits || 6,
      counter: entry.counter ?? 0,
      secret: OTPAuth.Secret.fromBase32(secretStr),
    });
    return hotp.generate({ counter: entry.counter ?? 0 });
  }

  const totp = new OTPAuth.TOTP({
    issuer: entry.issuer || undefined,
    label: entry.label || undefined,
    algorithm: entry.algorithm || 'SHA1',
    digits: entry.digits || 6,
    period: entry.period || 30,
    secret: OTPAuth.Secret.fromBase32(secretStr),
  });

  return totp.generate({ timestamp });
}

/**
 * Parses a standard otpauth:// URI into an OTPEntry partial.
 */
export function parseOtpUri(uriString: string): Omit<OTPEntry, 'id' | 'createdAt' | 'updatedAt'> {
  const parsed = OTPAuth.URI.parse(uriString.trim());
  if (!parsed) {
    throw new Error('Failed to parse OTP URI: invalid format');
  }

  const isHotp = parsed instanceof OTPAuth.HOTP;
  const type: OTPType = isHotp ? 'hotp' : 'totp';
  const algorithm = (parsed.algorithm || 'SHA1').toUpperCase() as OTPAlgorithm;
  const secret = parsed.secret.base32;

  let issuer = parsed.issuer || '';
  let label = parsed.label || '';

  // Handle "Issuer:Account" in label if issuer is not set
  if (!issuer && label.includes(':')) {
    const parts = label.split(':');
    issuer = parts[0].trim();
    label = parts.slice(1).join(':').trim();
  }

  return {
    issuer,
    label,
    secret,
    type,
    algorithm,
    digits: parsed.digits || 6,
    period: isHotp ? 30 : ((parsed as OTPAuth.TOTP).period ?? 30),
    counter: isHotp ? ((parsed as OTPAuth.HOTP).counter ?? 0) : undefined,
  };
}

/**
 * Serializes an OTPEntry back into a standard otpauth:// URI string.
 */
export function buildOtpUri(entry: OTPEntry): string {
  const secretStr = cleanSecret(entry.secret);

  if (entry.type === 'hotp') {
    const hotp = new OTPAuth.HOTP({
      issuer: entry.issuer || undefined,
      label: entry.label,
      algorithm: entry.algorithm,
      digits: entry.digits,
      counter: entry.counter ?? 0,
      secret: OTPAuth.Secret.fromBase32(secretStr),
    });
    return hotp.toString();
  }

  const totp = new OTPAuth.TOTP({
    issuer: entry.issuer || undefined,
    label: entry.label,
    algorithm: entry.algorithm,
    digits: entry.digits,
    period: entry.period,
    secret: OTPAuth.Secret.fromBase32(secretStr),
  });

  return totp.toString();
}
