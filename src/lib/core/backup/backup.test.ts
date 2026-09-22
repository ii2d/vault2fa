import { describe, it, expect } from 'vitest';
import { isAegisJson, parseAegisJson, exportToAegisJson } from './aegis';
import {
  detectBackupFormat,
  exportEncryptedBackup,
  exportDecryptedBackup,
  parseUnencryptedBackup,
  parseEncryptedBackup,
} from './backup';

import type { VaultData, EncryptedVaultPayload } from '$lib/types';

describe('Aegis Interoperability', () => {
  const sampleAegisJson = JSON.stringify({
    version: 1,
    header: { slots: [], params: {} },
    db: {
      version: 1,
      entries: [
        {
          type: 'totp',
          uuid: 'e1-uuid',
          name: 'user@example.com',
          issuer: 'GitHub',
          favorite: true,
          info: {
            secret: 'JBSWY3DPEHPK3PXP',
            algo: 'SHA256',
            digits: 8,
            period: 60,
          },
          groups: ['Work'],
        },
        {
          type: 'hotp',
          uuid: 'e2-uuid',
          name: 'admin',
          issuer: 'Internal',
          info: {
            secret: 'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
            algo: 'SHA1',
            digits: 6,
            counter: 15,
          },
          groups: ['Personal'],
        },
      ],
      groups: [
        { uuid: 'g1-uuid', name: 'Work' },
        { uuid: 'g2-uuid', name: 'Personal' },
      ],
    },
  });

  it('identifies Aegis JSON correctly', () => {
    expect(isAegisJson(sampleAegisJson)).toBe(true);
    expect(isAegisJson('{"hello": "world"}')).toBe(false);
    expect(isAegisJson('invalid json')).toBe(false);
  });

  it('parses entries and groups from Aegis JSON', () => {
    const { entries, groups } = parseAegisJson(sampleAegisJson);

    expect(entries).toHaveLength(2);
    expect(groups).toHaveLength(2);

    expect(entries[0].id).toBe('e1-uuid');
    expect(entries[0].issuer).toBe('GitHub');
    expect(entries[0].label).toBe('user@example.com');
    expect(entries[0].algorithm).toBe('SHA256');
    expect(entries[0].digits).toBe(8);
    expect(entries[0].period).toBe(60);
    expect(entries[0].pinned).toBe(true);

    expect(entries[1].id).toBe('e2-uuid');
    expect(entries[1].type).toBe('hotp');
    expect(entries[1].counter).toBe(15);
  });

  it('exports vault data to Aegis-compatible JSON format', () => {
    const mockVault: VaultData = {
      version: 1,
      updatedAt: Date.now(),
      entries: [
        {
          id: 'test-id',
          issuer: 'Google',
          label: 'test@gmail.com',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      groups: [{ id: 'grp-1', name: 'Main' }],
      settings: {
        autoLockTimeoutMinutes: 5,
        biometricUnlockEnabled: false,
        syncProvider: 'none',
        theme: 'dark',
      },
    };

    const aegisJson = exportToAegisJson(mockVault);
    expect(isAegisJson(aegisJson)).toBe(true);

    const parsed = parseAegisJson(aegisJson);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].issuer).toBe('Google');
  });

  it('excludes soft-deleted entries from Aegis export', () => {
    const mockVault: VaultData = {
      version: 1,
      updatedAt: Date.now(),
      entries: [
        {
          id: 'active-1',
          issuer: 'ActiveGoogle',
          label: 'active@gmail.com',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'deleted-1',
          issuer: 'DeletedSecret',
          label: 'deleted@test.com',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: Date.now() - 5000,
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

    const aegisJson = exportToAegisJson(mockVault);
    const parsed = parseAegisJson(aegisJson);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].id).toBe('active-1');
  });
});

describe('Native Backup & Restore', () => {
  const mockPayload: EncryptedVaultPayload = {
    format: 'vault2fa-v1',
    kdf: {
      algorithm: 'Argon2id',
      iterations: 3,
      memoryKiB: 65536,
      parallelism: 1,
      salt: 'c2FsdA==',
    },
    encryption: {
      algorithm: 'AES-256-GCM',
      iv: 'aXY=',
      tagLength: 128,
    },
    ciphertext: 'Y2lwaGVydGV4dA==',
  };

  const mockVault: VaultData = {
    version: 1,
    updatedAt: Date.now(),
    entries: [
      {
        id: '1',
        issuer: 'GitLab',
        label: 'dev',
        secret: 'JBSWY3DPEHPK3PXP',
        type: 'totp',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
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

  it('detects vault2fa encrypted format', () => {
    const backup = exportEncryptedBackup(mockPayload);
    expect(detectBackupFormat(backup)).toBe('vault2fa-encrypted');
  });

  it('detects vault2fa decrypted format', () => {
    const backup = exportDecryptedBackup(mockVault);
    expect(detectBackupFormat(backup)).toBe('vault2fa-decrypted');
  });

  it('detects unknown format', () => {
    expect(detectBackupFormat('{}')).toBe('unknown');
    expect(detectBackupFormat('not json')).toBe('unknown');
  });

  it('detects and parses plain text URI lists', () => {
    const uriList = `otpauth://totp/GitHub:user?secret=JBSWY3DPEHPK3PXP\notpauth://totp/AWS:admin?secret=HXDMVJECJJWSRB3H`;
    expect(detectBackupFormat(uriList)).toBe('plain-text-uris');

    const parsed = parseUnencryptedBackup(uriList);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].issuer).toBe('GitHub');
    expect(parsed.entries[1].issuer).toBe('AWS');
  });

  it('parses valid encrypted backup correctly', () => {
    const backup = exportEncryptedBackup(mockPayload);
    const parsed = parseEncryptedBackup(backup);
    expect(parsed.format).toBe('vault2fa-v1');
    expect(parsed.ciphertext).toBe(mockPayload.ciphertext);
    expect(parsed.kdf.algorithm).toBe('Argon2id');
  });

  it('throws on invalid encrypted backup', () => {
    expect(() => parseEncryptedBackup('{"invalid": true}')).toThrow();
  });
});
