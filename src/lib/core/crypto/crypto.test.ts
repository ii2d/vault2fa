import { describe, expect, it } from 'vitest';
import type { VaultData } from '$lib/types';
import {
  base64ToUint8Array,
  DecryptionError,
  decryptVault,
  deriveMasterKey,
  encryptVault,
  generateKdfParams,
  generateRandomBytes,
  uint8ArrayToBase64,
} from './index';

describe('Crypto Utilities', () => {
  it('generates random bytes of requested length', () => {
    const bytes16 = generateRandomBytes(16);
    const bytes32 = generateRandomBytes(32);

    expect(bytes16).toHaveLength(16);
    expect(bytes32).toHaveLength(32);
    expect(bytes16.some((b) => b !== 0)).toBe(true);
  });

  it('correctly round-trips Uint8Array to Base64 and back', () => {
    const original = generateRandomBytes(64);
    const base64 = uint8ArrayToBase64(original);
    const restored = base64ToUint8Array(base64);

    expect(restored).toEqual(original);
  });
});

describe('Argon2id Key Derivation', () => {
  it('derives a 32-byte master key deterministically', async () => {
    const params = generateKdfParams({ memoryKiB: 1024, iterations: 2 });
    const { keyBytes: key1 } = await deriveMasterKey('correct-horse-battery-staple', params);
    const { keyBytes: key2 } = await deriveMasterKey('correct-horse-battery-staple', params);

    expect(key1).toHaveLength(32);
    expect(key1).toEqual(key2);
  });

  it('produces different keys for different passwords', async () => {
    const params = generateKdfParams({ memoryKiB: 1024, iterations: 2 });
    const { keyBytes: keyA } = await deriveMasterKey('password-A', params);
    const { keyBytes: keyB } = await deriveMasterKey('password-B', params);

    expect(keyA).not.toEqual(keyB);
  });

  it('produces different keys for different salts', async () => {
    const params1 = generateKdfParams({ memoryKiB: 1024, iterations: 2 });
    const params2 = generateKdfParams({ memoryKiB: 1024, iterations: 2 });
    const { keyBytes: key1 } = await deriveMasterKey('same-password', params1);
    const { keyBytes: key2 } = await deriveMasterKey('same-password', params2);

    expect(key1).not.toEqual(key2);
  });

  it('rejects empty password', async () => {
    const params = generateKdfParams({ memoryKiB: 1024, iterations: 2 });
    await expect(deriveMasterKey('', params)).rejects.toThrow('Master password cannot be empty');
  });
});

describe('AES-256-GCM Vault Encryption & Decryption', () => {
  const sampleVault: VaultData = {
    version: 1,
    updatedAt: 1726358400000,
    entries: [
      {
        id: 'entry-1',
        issuer: 'GitHub',
        label: 'developer@example.com',
        secret: 'JBSWY3DPEHPK3PXP',
        type: 'totp',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        pinned: true,
        tags: ['work', 'dev'],
        createdAt: 1726358400000,
        updatedAt: 1726358400000,
      },
    ],
    groups: [
      {
        id: 'group-1',
        name: 'Work',
        icon: 'briefcase',
      },
    ],
    settings: {
      autoLockTimeoutMinutes: 5,
      biometricUnlockEnabled: false,
      syncProvider: 'none',
      theme: 'dark',
    },
  };

  it('encrypts and decrypts vault data accurately', async () => {
    const kdfParams = generateKdfParams({ memoryKiB: 1024, iterations: 2 });
    const { keyBytes } = await deriveMasterKey('my-secret-vault-password', kdfParams);

    const payload = await encryptVault(sampleVault, keyBytes, kdfParams);

    expect(payload.format).toBe('vault2fa-v1');
    expect(payload.encryption.algorithm).toBe('AES-256-GCM');
    expect(payload.ciphertext).toBeTypeOf('string');
    expect(payload.encryption.iv).toBeTypeOf('string');

    const decrypted = await decryptVault(payload, keyBytes);
    expect(decrypted).toEqual(sampleVault);
  });

  it('fails decryption with wrong key', async () => {
    const kdfParams = generateKdfParams({ memoryKiB: 1024, iterations: 2 });
    const { keyBytes: correctKey } = await deriveMasterKey('correct-password', kdfParams);
    const { keyBytes: wrongKey } = await deriveMasterKey('wrong-password', kdfParams);

    const payload = await encryptVault(sampleVault, correctKey, kdfParams);

    await expect(decryptVault(payload, wrongKey)).rejects.toThrow(DecryptionError);
  });

  it('fails decryption when ciphertext is tampered with', async () => {
    const kdfParams = generateKdfParams({ memoryKiB: 1024, iterations: 2 });
    const { keyBytes } = await deriveMasterKey('my-password', kdfParams);

    const payload = await encryptVault(sampleVault, keyBytes, kdfParams);

    const rawCiphertext = base64ToUint8Array(payload.ciphertext);
    rawCiphertext[0] ^= 0xff; // Flip bits
    payload.ciphertext = uint8ArrayToBase64(rawCiphertext);

    await expect(decryptVault(payload, keyBytes)).rejects.toThrow(DecryptionError);
  });

  it('fails decryption when IV is modified', async () => {
    const kdfParams = generateKdfParams({ memoryKiB: 1024, iterations: 2 });
    const { keyBytes } = await deriveMasterKey('my-password', kdfParams);

    const payload = await encryptVault(sampleVault, keyBytes, kdfParams);

    const rawIv = base64ToUint8Array(payload.encryption.iv);
    rawIv[0] ^= 0x01; // Tamper IV
    payload.encryption.iv = uint8ArrayToBase64(rawIv);

    await expect(decryptVault(payload, keyBytes)).rejects.toThrow(DecryptionError);
  });
});
