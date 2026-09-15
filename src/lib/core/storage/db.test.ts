import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EncryptedVaultPayload } from '$lib/types';
import { VaultDatabase } from './db';

describe('Dexie VaultDatabase Storage Engine', () => {
  let testDb: VaultDatabase;

  const samplePayload: EncryptedVaultPayload = {
    format: 'vault2fa-v1',
    kdf: {
      algorithm: 'Argon2id',
      iterations: 3,
      memoryKiB: 4096,
      parallelism: 1,
      salt: 'c2FsdHNhbHRzYWx0c2FsdA==',
    },
    encryption: {
      algorithm: 'AES-256-GCM',
      iv: 'aXZpdml2aXZpdml2',
      tagLength: 128,
    },
    ciphertext: 'Y2lwaGVydGV4dGRhdGE=',
  };

  beforeEach(async () => {
    testDb = new VaultDatabase(`test_vault_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  });

  it('saves and loads encrypted vault payloads', async () => {
    expect(await testDb.hasVault()).toBe(false);
    expect(await testDb.loadEncryptedVault()).toBeNull();

    await testDb.saveEncryptedVault(samplePayload);

    expect(await testDb.hasVault()).toBe(true);
    const loaded = await testDb.loadEncryptedVault();
    expect(loaded).toEqual(samplePayload);
  });

  it('purges all data successfully', async () => {
    await testDb.saveEncryptedVault(samplePayload);
    expect(await testDb.hasVault()).toBe(true);

    await testDb.purgeAll();
    expect(await testDb.hasVault()).toBe(false);
    expect(await testDb.loadEncryptedVault()).toBeNull();
  });

  it('stores and retrieves biometric credential records', async () => {
    expect(await testDb.biometrics.count()).toBe(0);

    await testDb.biometrics.put({
      id: 'primary',
      credentialId: 'test-cred-id',
      wrappedKey: 'wrapped-key-b64',
      iv: 'iv-b64',
      salt: 'salt-b64',
      createdAt: Date.now(),
    });

    expect(await testDb.biometrics.count()).toBe(1);
    const rec = await testDb.biometrics.get('primary');
    expect(rec?.credentialId).toBe('test-cred-id');
    expect(rec?.wrappedKey).toBe('wrapped-key-b64');
  });
});
