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
});
