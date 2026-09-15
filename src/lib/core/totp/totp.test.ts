import { describe, expect, it } from 'vitest';
import type { OTPEntry } from '$lib/types';
import {
  buildOtpUri,
  cleanSecret,
  formatToken,
  generateToken,
  getPeriodRemaining,
  isValidBase32,
  parseOtpUri,
} from './index';

describe('TOTP Utilities', () => {
  it('cleans base32 secret input correctly', () => {
    expect(cleanSecret('jb sw-y3 dp_eh pk 3p xp')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('validates base32 strings correctly', () => {
    expect(isValidBase32('JBSWY3DPEHPK3PXP')).toBe(true);
    expect(isValidBase32('jb sw-y3 dp')).toBe(true);
    expect(isValidBase32('INVALID89')).toBe(false); // 8 and 9 are invalid in base32
    expect(isValidBase32('')).toBe(false);
  });

  it('formats tokens nicely with grouping', () => {
    expect(formatToken('123456')).toBe('123 456');
    expect(formatToken('12345678')).toBe('1234 5678');
    expect(formatToken('1234567')).toBe('123 4567');
    expect(formatToken('12')).toBe('12');
  });

  it('calculates period remaining and progress correctly', () => {
    // 30s period at second 10 -> 20s remaining, progress = 20/30
    const ts = 10_000;
    const remaining = getPeriodRemaining(30, ts);

    expect(remaining.seconds).toBe(20);
    expect(remaining.progress).toBeCloseTo(20 / 30);
  });
});

describe('RFC 6238 and RFC 4226 Calculations', () => {
  // RFC 6238 test secret: "12345678901234567890" in Base32:
  const rfcSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it('generates standard RFC 6238 TOTP codes matching test vectors', () => {
    const entry: OTPEntry = {
      id: 'test-1',
      issuer: 'Test',
      label: 'test@example.com',
      secret: rfcSecret,
      type: 'totp',
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
      createdAt: 0,
      updatedAt: 0,
    };

    // Unix time 59s -> 94287082
    expect(generateToken(entry, 59 * 1000)).toBe('94287082');

    // Unix time 1111111109s -> 07081804
    expect(generateToken(entry, 1111111109 * 1000)).toBe('07081804');

    // Unix time 1111111111s -> 14050471
    expect(generateToken(entry, 1111111111 * 1000)).toBe('14050471');
  });

  it('generates standard RFC 4226 HOTP codes matching test vectors', () => {
    const entry: OTPEntry = {
      id: 'hotp-1',
      issuer: 'Bank',
      label: 'user',
      secret: rfcSecret,
      type: 'hotp',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      counter: 0,
      createdAt: 0,
      updatedAt: 0,
    };

    // Counter 0 -> 755224
    expect(generateToken(entry)).toBe('755224');

    // Counter 1 -> 287082
    entry.counter = 1;
    expect(generateToken(entry)).toBe('287082');

    // Counter 2 -> 359152
    entry.counter = 2;
    expect(generateToken(entry)).toBe('359152');
  });
});

describe('URI Parsing and Serialization', () => {
  it('parses standard otpauth:// TOTP URI with issuer query param', () => {
    const uri = 'otpauth://totp/GitHub:alice@github.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub';
    const parsed = parseOtpUri(uri);

    expect(parsed.issuer).toBe('GitHub');
    expect(parsed.label).toBe('alice@github.com');
    expect(parsed.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(parsed.type).toBe('totp');
    expect(parsed.digits).toBe(6);
    expect(parsed.period).toBe(30);
  });

  it('parses URI with issuer only in label prefix', () => {
    const uri = 'otpauth://totp/Google:alice@gmail.com?secret=JBSWY3DPEHPK3PXP';
    const parsed = parseOtpUri(uri);

    expect(parsed.issuer).toBe('Google');
    expect(parsed.label).toBe('alice@gmail.com');
  });

  it('parses HOTP URI with counter', () => {
    const uri = 'otpauth://hotp/Server:root?secret=JBSWY3DPEHPK3PXP&counter=12&digits=8';
    const parsed = parseOtpUri(uri);

    expect(parsed.type).toBe('hotp');
    expect(parsed.counter).toBe(12);
    expect(parsed.digits).toBe(8);
  });

  it('builds valid otpauth URI that round-trips through parser', () => {
    const entry: OTPEntry = {
      id: 'round-1',
      issuer: 'Amazon AWS',
      label: 'admin',
      secret: 'JBSWY3DPEHPK3PXP',
      type: 'totp',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      createdAt: 0,
      updatedAt: 0,
    };

    const uri = buildOtpUri(entry);
    const parsed = parseOtpUri(uri);

    expect(parsed.issuer).toBe(entry.issuer);
    expect(parsed.label).toBe(entry.label);
    expect(parsed.secret).toBe(entry.secret);
    expect(parsed.digits).toBe(entry.digits);
    expect(parsed.period).toBe(entry.period);
  });
});
