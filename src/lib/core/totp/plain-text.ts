/**
 * Plain Text / Multiline OTP URI Parser and Serializer
 * Supports newline-delimited otpauth:// URI lists and .txt backup exports.
 */

import { parseOtpUri, buildOtpUri } from './generator';
import type { OTPEntry, VaultData } from '$lib/types';

export interface ParsedPlainTextResult {
  entries: Array<Omit<OTPEntry, 'id' | 'createdAt' | 'updatedAt'>>;
  errors: Array<{ line: number; text: string; error: string }>;
}

/**
 * Checks if a string contains one or more otpauth:// URIs.
 */
export function isPlainTextOtpList(content: string): boolean {
  if (typeof content !== 'string') return false;
  return content.split(/\r?\n/).some((line) => line.trim().startsWith('otpauth://'));
}

/**
 * Parses a newline-delimited text of otpauth:// URIs.
 * Ignores empty lines and comments starting with # or //.
 */
export function parsePlainTextOtpList(content: string): ParsedPlainTextResult {
  const lines = content.split(/\r?\n/);
  const entries: Array<Omit<OTPEntry, 'id' | 'createdAt' | 'updatedAt'>> = [];
  const errors: Array<{ line: number; text: string; error: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue;
    }

    if (!trimmed.startsWith('otpauth://')) {
      errors.push({
        line: i + 1,
        text: rawLine,
        error: 'Line does not begin with otpauth:// scheme',
      });
      continue;
    }

    try {
      const parsed = parseOtpUri(trimmed);
      entries.push({
        issuer: parsed.issuer || 'Unnamed',
        label: parsed.label || 'Account',
        secret: parsed.secret,
        type: parsed.type,
        algorithm: parsed.algorithm,
        digits: parsed.digits,
        period: parsed.period,
        counter: parsed.counter,
      });
    } catch (err: unknown) {
      errors.push({
        line: i + 1,
        text: rawLine,
        error: (err as Error).message || 'Invalid OTP URI',
      });
    }
  }

  return { entries, errors };
}

/**
 * Serializes all vault tokens into a newline-separated list of otpauth:// URIs.
 */
export function exportToPlainTextUris(vault: VaultData): string {
  const header = [
    '# vault2fa - Plain Text 2FA URI Export',
    `# Exported: ${new Date().toISOString()}`,
    '# WARNING: Unencrypted secrets - store securely',
    '',
  ];

  const lines = vault.entries.map((entry) => buildOtpUri(entry));
  return [...header, ...lines].join('\n');
}
