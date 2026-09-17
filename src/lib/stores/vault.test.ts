import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { vault } from './vault.svelte';
import type { OTPEntry, VaultData } from '$lib/types';
import { deriveMasterKey, encryptVault, generateKdfParams } from '$lib/core/crypto';

describe('VaultStore group filtering', () => {
  const sampleEntries: OTPEntry[] = [
    {
      id: '1',
      issuer: 'GitHub',
      label: 'user@github',
      secret: 'JBSWY3DPEHPK3PXP',
      type: 'totp',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      groupId: 'group-work',
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: '2',
      issuer: 'Google',
      label: 'user@gmail.com',
      secret: 'JBSWY3DPEHPK3PXP',
      type: 'totp',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      // uncategorized: no groupId
      createdAt: 2000,
      updatedAt: 2000,
    },
    {
      id: '3',
      issuer: 'Cloudflare',
      label: 'admin@cf',
      secret: 'JBSWY3DPEHPK3PXP',
      type: 'totp',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      // uncategorized: undefined groupId
      groupId: undefined,
      createdAt: 3000,
      updatedAt: 3000,
    },
    {
      id: '4',
      issuer: 'Personal Email',
      label: 'me@home.com',
      secret: 'JBSWY3DPEHPK3PXP',
      type: 'totp',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      groupId: 'group-personal',
      createdAt: 4000,
      updatedAt: 4000,
    },
  ];

  beforeEach(() => {
    vault.data = {
      version: 1,
      updatedAt: 1000,
      settings: {
        autoLockTimeoutMinutes: 5,
        biometricUnlockEnabled: false,
        syncProvider: 'none',
        theme: 'dark',
      },
      groups: [
        { id: 'group-work', name: 'Work' },
        { id: 'group-personal', name: 'Personal' },
      ],
      entries: [...sampleEntries],
    };
    vault.activeGroupId = null;
    vault.searchQuery = '';
  });

  it('shows all entries when activeGroupId is null', () => {
    expect(vault.entries.length).toBe(4);
  });

  it('filters uncategorized entries when activeGroupId is "uncategorized"', () => {
    vault.activeGroupId = 'uncategorized';
    expect(vault.entries.length).toBe(2);
    expect(vault.entries.map((e) => e.issuer)).toEqual(['Cloudflare', 'Google']);
  });

  it('filters by specific group ID', () => {
    vault.activeGroupId = 'group-work';
    expect(vault.entries.length).toBe(1);
    expect(vault.entries[0].issuer).toBe('GitHub');

    vault.activeGroupId = 'group-personal';
    expect(vault.entries.length).toBe(1);
    expect(vault.entries[0].issuer).toBe('Personal Email');
  });

  it('restores and unlocks vault from an encrypted payload', async () => {
    const masterPassword = 'MySecretPassword123!';
    const kdf = generateKdfParams();
    // Fast iterations for testing
    kdf.iterations = 1;
    kdf.memoryKiB = 1024;
    const { keyBytes } = await deriveMasterKey(masterPassword, kdf);

    const testVaultData: VaultData = {
      version: 1,
      updatedAt: Date.now(),
      settings: {
        autoLockTimeoutMinutes: 10,
        biometricUnlockEnabled: false,
        syncProvider: 'none',
        theme: 'dark',
      },
      groups: [{ id: 'grp-1', name: 'Dev' }],
      entries: [
        {
          id: 'e-1',
          issuer: 'GitHub',
          label: 'alice',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };

    const payload = await encryptVault(testVaultData, keyBytes, kdf);

    // Set vault as uninitialized
    vault.status = 'uninitialized';
    vault.data = null;

    await vault.restoreAndUnlockFromPayload(payload, masterPassword);

    expect(vault.status).toBe('unlocked');
    expect(vault.isUnlocked).toBe(true);
    expect(vault.entries.length).toBe(1);
    expect(vault.entries[0].issuer).toBe('GitHub');
    expect(vault.groups.length).toBe(1);
    expect(vault.settings.autoLockTimeoutMinutes).toBe(10);
  });

  it('imports accounts from an encrypted payload into active vault', async () => {
    const backupPassword = 'BackupPassword456!';
    const kdf = generateKdfParams();
    kdf.iterations = 1;
    kdf.memoryKiB = 1024;
    const { keyBytes } = await deriveMasterKey(backupPassword, kdf);

    const backupVaultData: VaultData = {
      version: 1,
      updatedAt: Date.now(),
      settings: {
        autoLockTimeoutMinutes: 5,
        biometricUnlockEnabled: false,
        syncProvider: 'none',
        theme: 'dark',
      },
      groups: [{ id: 'grp-backup', name: 'Finance' }],
      entries: [
        {
          id: 'e-backup-1',
          issuer: 'Bank',
          label: 'alice@bank.com',
          secret: 'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          groupId: 'grp-backup',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };

    const payload = await encryptVault(backupVaultData, keyBytes, kdf);

    // Vault is already active with sampleEntries (length 4)
    vault.status = 'unlocked';
    const res = await vault.importFromEncryptedPayload(payload, backupPassword);

    expect(res.addedCount).toBe(1);
    expect(res.totalFound).toBe(1);
    expect(vault.entries.length).toBe(5);
    expect(vault.groups.some((g) => g.name === 'Finance')).toBe(true);
  });

  it('updates privacy mode settings', async () => {
    vault.status = 'unlocked';
    await vault.updateSettings({
      hideCodesByDefault: false,
      revealDurationSeconds: 15,
    });

    expect(vault.settings.hideCodesByDefault).toBe(false);
    expect(vault.settings.revealDurationSeconds).toBe(15);
  });
});
