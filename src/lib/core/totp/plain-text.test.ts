import { describe, it, expect } from 'vitest';
import { isPlainTextOtpList, parsePlainTextOtpList, exportToPlainTextUris } from './plain-text';
import type { VaultData } from '$lib/types';

describe('Plain Text OTP URI Parser & Exporter', () => {
  it('identifies plain text OTP URI lists correctly', () => {
    expect(
      isPlainTextOtpList(
        'otpauth://totp/GitHub:user?secret=JBSWY3DPEHPK3PXP\notpauth://totp/Google:alice?secret=HXDMVJECJJWSRB3H',
      ),
    ).toBe(true);

    expect(isPlainTextOtpList('# My 2FA List\notpauth://totp/Test?secret=JBSWY3DPEHPK3PXP')).toBe(
      true,
    );

    expect(isPlainTextOtpList('random plaintext without uris')).toBe(false);
    expect(isPlainTextOtpList('')).toBe(false);
  });

  it('parses valid multiple otpauth URIs while ignoring comments and empty lines', () => {
    const rawContent = `
# Backup from my password manager
// Another comment line
otpauth://totp/GitHub:alice%40github.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&algorithm=SHA1&digits=6&period=30

otpauth://totp/AWS:admin?secret=HXDMVJECJJWSRB3H&issuer=AWS&algorithm=SHA256&digits=8&period=60

otpauth://hotp/Bank:corp?secret=GEZDGNBVGY3TQOJQ&issuer=Bank&counter=12
`;

    const { entries, errors } = parsePlainTextOtpList(rawContent);

    expect(errors).toHaveLength(0);
    expect(entries).toHaveLength(3);

    expect(entries[0].issuer).toBe('GitHub');
    expect(entries[0].label).toBe('alice@github.com');
    expect(entries[0].secret).toBe('JBSWY3DPEHPK3PXP');
    expect(entries[0].algorithm).toBe('SHA1');
    expect(entries[0].digits).toBe(6);
    expect(entries[0].period).toBe(30);

    expect(entries[1].issuer).toBe('AWS');
    expect(entries[1].algorithm).toBe('SHA256');
    expect(entries[1].digits).toBe(8);
    expect(entries[1].period).toBe(60);

    expect(entries[2].issuer).toBe('Bank');
    expect(entries[2].type).toBe('hotp');
    expect(entries[2].counter).toBe(12);
  });

  it('captures malformed lines in errors array and continues parsing valid lines', () => {
    const mixedContent = `
otpauth://totp/GitHub:user?secret=JBSWY3DPEHPK3PXP
this is a malformed non-uri line
otpauth://totp/Google:bob?secret=INVALID_SECRET_@@@
otpauth://totp/AWS:admin?secret=HXDMVJECJJWSRB3H
`;

    const { entries, errors } = parsePlainTextOtpList(mixedContent);

    expect(entries).toHaveLength(2);
    expect(entries[0].issuer).toBe('GitHub');
    expect(entries[1].issuer).toBe('AWS');

    expect(errors).toHaveLength(2);
    expect(errors[0].line).toBe(3);
    expect(errors[1].line).toBe(4);
  });

  it('exports vault data to plain text URIs and roundtrips accurately', () => {
    const mockVault: VaultData = {
      version: 1,
      updatedAt: Date.now(),
      entries: [
        {
          id: '1',
          issuer: 'Cloudflare',
          label: 'admin@domain.com',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          createdAt: 0,
          updatedAt: 0,
        },
        {
          id: '2',
          issuer: 'DigitalOcean',
          label: 'team',
          secret: 'HXDMVJECJJWSRB3H',
          type: 'totp',
          algorithm: 'SHA256',
          digits: 8,
          period: 60,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      groups: [],
      settings: {
        autoLockTimeoutMinutes: 5,
        biometricUnlockEnabled: false,
        syncProvider: 'none',
        theme: 'dark',
      },
    };

    const exportedText = exportToPlainTextUris(mockVault);
    expect(isPlainTextOtpList(exportedText)).toBe(true);

    const { entries, errors } = parsePlainTextOtpList(exportedText);
    expect(errors).toHaveLength(0);
    expect(entries).toHaveLength(2);

    expect(entries[0].issuer).toBe('Cloudflare');
    expect(entries[1].issuer).toBe('DigitalOcean');
    expect(entries[1].algorithm).toBe('SHA256');
    expect(entries[1].digits).toBe(8);
  });
});
