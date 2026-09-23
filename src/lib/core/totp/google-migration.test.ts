import { describe, expect, it } from 'vitest';
import {
  convertMigrationAccountsToEntries,
  isGoogleMigrationUri,
  parseGoogleMigrationUri,
} from './google-migration';

function createMigrationPayloadUri(
  entries: Array<{
    secret: Uint8Array;
    name: string;
    issuer: string;
    algo?: number;
    digits?: number;
    type?: number;
    counter?: number;
  }>,
): string {
  const parts: Uint8Array[] = [];

  for (const e of entries) {
    const pParts: Uint8Array[] = [];

    // 1: secret
    pParts.push(new Uint8Array([0x0a, e.secret.length, ...e.secret]));

    // 2: name
    const nameBytes = new TextEncoder().encode(e.name);
    pParts.push(new Uint8Array([0x12, nameBytes.length, ...nameBytes]));

    // 3: issuer
    const issuerBytes = new TextEncoder().encode(e.issuer);
    pParts.push(new Uint8Array([0x1a, issuerBytes.length, ...issuerBytes]));

    // 4: algorithm
    if (e.algo !== undefined) {
      pParts.push(new Uint8Array([0x20, e.algo]));
    }

    // 5: digits
    if (e.digits !== undefined) {
      pParts.push(new Uint8Array([0x28, e.digits]));
    }

    // 6: type
    if (e.type !== undefined) {
      pParts.push(new Uint8Array([0x30, e.type]));
    }

    // 7: counter
    if (e.counter !== undefined) {
      pParts.push(new Uint8Array([0x38, e.counter]));
    }

    const totalLen = pParts.reduce((acc, p) => acc + p.length, 0);
    parts.push(new Uint8Array([0x0a, totalLen]));
    parts.push(...pParts);
  }

  const totalBufferLength = parts.reduce((acc, p) => acc + p.length, 0);
  const combined = new Uint8Array(totalBufferLength);
  let offset = 0;
  for (const p of parts) {
    combined.set(p, offset);
    offset += p.length;
  }

  // Base64 encode
  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  const base64 = btoa(binary);

  return `otpauth-migration://offline?data=${encodeURIComponent(base64)}`;
}

describe('Google Migration Parser', () => {
  it('identifies Google Authenticator migration URIs correctly', () => {
    expect(
      isGoogleMigrationUri(
        'otpauth-migration://offline?data=Ci0KC0hlbGxvITEyMzQ1EhB1c2VyQGV4YW1wbGUuY29tGgZHaXRIdWIgASgBMAI%3D',
      ),
    ).toBe(true);
    expect(isGoogleMigrationUri('otpauth://totp/GitHub:user?secret=JBSWY3DPEHPK3PXP')).toBe(false);
    expect(isGoogleMigrationUri('https://example.com')).toBe(false);
    expect(isGoogleMigrationUri('')).toBe(false);
  });

  it('parses a single account from migration URI', () => {
    const rawSecret = new TextEncoder().encode('Hello!12345');
    const uri = createMigrationPayloadUri([
      {
        secret: rawSecret,
        name: 'user@example.com',
        issuer: 'GitHub',
        algo: 1, // SHA1
        digits: 1, // 6 digits
        type: 2, // TOTP
      },
    ]);

    const accounts = parseGoogleMigrationUri(uri);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe('user@example.com');
    expect(accounts[0].issuer).toBe('GitHub');
    expect(accounts[0].digits).toBe(6);
    expect(accounts[0].algorithm).toBe('SHA1');
    expect(accounts[0].type).toBe('totp');
    expect(accounts[0].period).toBe(30);
    expect(typeof accounts[0].secret).toBe('string');
    expect(accounts[0].secret.length).toBeGreaterThan(0);
  });

  it('parses multiple accounts with different parameters', () => {
    const sec1 = new TextEncoder().encode('Secret11111');
    const sec2 = new TextEncoder().encode('Secret22222');
    const uri = createMigrationPayloadUri([
      {
        secret: sec1,
        name: 'alice@google.com',
        issuer: 'Google',
        algo: 2, // SHA256
        digits: 2, // 8 digits
        type: 2, // TOTP
      },
      {
        secret: sec2,
        name: 'bob@gitlab.com',
        issuer: 'GitLab',
        algo: 1, // SHA1
        digits: 1, // 6 digits
        type: 1, // HOTP
        counter: 42,
      },
    ]);

    const accounts = parseGoogleMigrationUri(uri);
    expect(accounts).toHaveLength(2);

    expect(accounts[0].name).toBe('alice@google.com');
    expect(accounts[0].issuer).toBe('Google');
    expect(accounts[0].algorithm).toBe('SHA256');
    expect(accounts[0].digits).toBe(8);
    expect(accounts[0].type).toBe('totp');

    expect(accounts[1].name).toBe('bob@gitlab.com');
    expect(accounts[1].issuer).toBe('GitLab');
    expect(accounts[1].algorithm).toBe('SHA1');
    expect(accounts[1].digits).toBe(6);
    expect(accounts[1].type).toBe('hotp');
    expect(accounts[1].counter).toBe(42);
  });

  it('splits issuer prefix from name if issuer field is empty', () => {
    const sec = new TextEncoder().encode('TestSecret');
    const uri = createMigrationPayloadUri([
      {
        secret: sec,
        name: 'Amazon:john.doe',
        issuer: '',
      },
    ]);

    const accounts = parseGoogleMigrationUri(uri);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].issuer).toBe('Amazon');
    expect(accounts[0].name).toBe('john.doe');
  });

  it('converts migration accounts to OTPEntry records with target group', () => {
    const sec = new TextEncoder().encode('TestSecret');
    const uri = createMigrationPayloadUri([
      {
        secret: sec,
        name: 'AWS:cloud-admin',
        issuer: 'AWS',
      },
    ]);

    const accounts = parseGoogleMigrationUri(uri);
    const entries = convertMigrationAccountsToEntries(accounts, 'work-group-id');

    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBeDefined();
    expect(entries[0].groupId).toBe('work-group-id');
    expect(entries[0].issuer).toBe('AWS');
    expect(entries[0].label).toBe('cloud-admin');
    expect(entries[0].createdAt).toBeGreaterThan(0);
  });

  it('throws an error for invalid URI schemes or missing data', () => {
    expect(() => parseGoogleMigrationUri('https://example.com')).toThrow('Invalid migration URI');
    expect(() => parseGoogleMigrationUri('otpauth-migration://offline')).toThrow(
      'missing "data" parameter',
    );
  });
});
