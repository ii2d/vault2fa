import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vault, formatSyncSummary } from './vault.svelte';
import type { OTPEntry, VaultData } from '$lib/types';
import { deriveMasterKey, encryptVault, generateKdfParams } from '$lib/core/crypto';
import { VaultSaltMismatchError, GistSaltMismatchError, getLinkedHandle } from '$lib/core/sync';

let mockLinkedHandle: FileSystemFileHandle | null = null;
vi.mock('$lib/core/sync/drivers/local-file', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/core/sync/drivers/local-file')>();
  return {
    ...actual,
    storeLinkedHandle: vi.fn(async (h: FileSystemFileHandle) => {
      mockLinkedHandle = h;
    }),
    getLinkedHandle: vi.fn(async () => mockLinkedHandle),
  };
});

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

  it('filters entries matching search query in note field', () => {
    vault.data!.entries[0].note = 'Personal emergency recovery code: xyz-123';
    vault.searchQuery = 'xyz-123';
    expect(vault.entries.length).toBe(1);
    expect(vault.entries[0].issuer).toBe('GitHub');

    vault.searchQuery = 'EMERGENCY';
    expect(vault.entries.length).toBe(1);
    expect(vault.entries[0].issuer).toBe('GitHub');

    vault.searchQuery = 'nonexistent-query';
    expect(vault.entries.length).toBe(0);
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

  it('restores vault and links file handle for auto-sync', async () => {
    const masterPassword = 'MySecretPassword123!';
    const kdf = generateKdfParams();
    kdf.iterations = 1;
    kdf.memoryKiB = 1024;
    const { keyBytes } = await deriveMasterKey(masterPassword, kdf);

    const testVaultData: VaultData = {
      version: 1,
      updatedAt: Date.now(),
      settings: {
        autoLockTimeoutMinutes: 5,
        biometricUnlockEnabled: false,
        syncProvider: 'none',
        theme: 'dark',
      },
      groups: [],
      entries: [],
    };

    const payload = await encryptVault(testVaultData, keyBytes, kdf);

    const mockHandle = {
      name: 'shared.vault',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
    } as unknown as FileSystemFileHandle;

    await vault.restoreAndUnlockFromPayload(payload, masterPassword, mockHandle);

    expect(vault.status).toBe('unlocked');
    expect(vault.settings.syncProvider).toBe('local-file');
    expect(vault.settings.localFileSync?.fileName).toBe('shared.vault');

    const linkedHandle = await getLinkedHandle();
    expect(linkedHandle?.name).toBe('shared.vault');
  });

  it('detects salt mismatch when syncing with local file and prompts for password', async () => {
    // 1. Initialize active vault with password and Salt A
    const activePassword = 'ActiveVaultPassword1!';
    const activeKdf = generateKdfParams();
    activeKdf.iterations = 1;
    activeKdf.memoryKiB = 1024;
    const { keyBytes: activeKey } = await deriveMasterKey(activePassword, activeKdf);

    const activeData: VaultData = {
      version: 1,
      updatedAt: 1000,
      settings: {
        autoLockTimeoutMinutes: 5,
        biometricUnlockEnabled: false,
        syncProvider: 'none',
        theme: 'dark',
      },
      groups: [],
      entries: [
        {
          id: 'local-1',
          issuer: 'LocalIssuer',
          label: 'local@domain.com',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    };

    const activePayload = await encryptVault(activeData, activeKey, activeKdf);
    await vault.restoreAndUnlockFromPayload(activePayload, activePassword);

    // 2. Create a remote file payload created on another browser with Salt B
    const remotePassword = 'RemoteVaultPassword2@';
    const remoteKdf = generateKdfParams();
    remoteKdf.iterations = 1;
    remoteKdf.memoryKiB = 1024;
    const { keyBytes: remoteKey } = await deriveMasterKey(remotePassword, remoteKdf);

    const remoteData: VaultData = {
      version: 1,
      updatedAt: 2000,
      settings: {
        autoLockTimeoutMinutes: 5,
        biometricUnlockEnabled: false,
        syncProvider: 'none',
        theme: 'dark',
      },
      groups: [],
      entries: [
        {
          id: 'remote-1',
          issuer: 'RemoteIssuer',
          label: 'remote@domain.com',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          createdAt: 2000,
          updatedAt: 2000,
        },
      ],
    };

    const remotePayload = await encryptVault(remoteData, remoteKey, remoteKdf);

    let writtenContent = '';
    const mockFile = {
      text: vi.fn().mockResolvedValue(JSON.stringify(remotePayload)),
    };
    const mockHandle = {
      name: 'cross-browser.vault',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockResolvedValue(mockFile),
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockImplementation(async (data: string) => {
          writtenContent = data;
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as FileSystemFileHandle;

    // 3. Attempting to sync without remote password should throw VaultSaltMismatchError
    await expect(vault.syncWithLocalFile(mockHandle)).rejects.toThrowError(VaultSaltMismatchError);

    // 4. Syncing with remote password should succeed, merge entries, and adopt remote credentials
    const mergeResult = await vault.syncWithLocalFile(mockHandle, remotePassword);
    expect(mergeResult.entriesAdded).toBe(2);
    expect(mergeResult.entriesUpdated).toBe(0);
    expect(mergeResult.entriesSoftDeleted).toBe(0);
    expect(mergeResult.entriesPurged).toBe(0);
    expect(vault.lastSyncResult?.entriesAdded).toBe(2);
    expect(vault.syncToast?.message).toContain('2 added');
    expect(vault.entries.length).toBe(2);
    expect(vault.entries.map((e) => e.issuer)).toEqual(
      expect.arrayContaining(['LocalIssuer', 'RemoteIssuer']),
    );
    expect(vault.getKdfParams().salt).toBe(remoteKdf.salt);
    expect(vault.settings.syncProvider).toBe('local-file');
    expect(writtenContent).toContain('vault2fa-v1');
  });

  it('restores vault and configures GitHub Gist sync', async () => {
    const masterPassword = 'GistPassword123!';
    const kdf = generateKdfParams();
    kdf.iterations = 1;
    kdf.memoryKiB = 1024;
    const { keyBytes } = await deriveMasterKey(masterPassword, kdf);

    const testVaultData: VaultData = {
      version: 1,
      updatedAt: Date.now(),
      settings: {
        autoLockTimeoutMinutes: 5,
        biometricUnlockEnabled: false,
        syncProvider: 'none',
        theme: 'dark',
      },
      groups: [],
      entries: [],
    };

    const payload = await encryptVault(testVaultData, keyBytes, kdf);

    await vault.restoreAndUnlockFromPayload(payload, masterPassword, undefined, {
      token: 'ghp_token_abc',
      gistId: 'gist_id_123',
      autoSync: true,
    });

    expect(vault.status).toBe('unlocked');
    expect(vault.settings.syncProvider).toBe('github-gist');
    expect(vault.settings.gistSync?.token).toBe('ghp_token_abc');
    expect(vault.settings.gistSync?.gistId).toBe('gist_id_123');
  });

  it('detects salt mismatch in vault.syncWithGist and adopts credentials when password provided', async () => {
    const activePassword = 'LocalPassword111!';
    const activeKdf = generateKdfParams();
    activeKdf.iterations = 1;
    activeKdf.memoryKiB = 1024;
    const { keyBytes: activeKey } = await deriveMasterKey(activePassword, activeKdf);

    const activeData: VaultData = {
      version: 1,
      updatedAt: 1000,
      settings: {
        autoLockTimeoutMinutes: 5,
        biometricUnlockEnabled: false,
        syncProvider: 'github-gist',
        gistSync: {
          token: 'ghp_token_test',
          gistId: 'gist-remote-id',
          autoSync: true,
        },
        theme: 'dark',
      },
      groups: [],
      entries: [
        {
          id: 'local-gist-1',
          issuer: 'LocalGistAccount',
          label: 'me@local.com',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    };

    const activePayload = await encryptVault(activeData, activeKey, activeKdf);
    await vault.restoreAndUnlockFromPayload(
      activePayload,
      activePassword,
      undefined,
      activeData.settings.gistSync,
    );

    const remotePassword = 'RemoteGistPassword222!';
    const remoteKdf = generateKdfParams();
    remoteKdf.iterations = 1;
    remoteKdf.memoryKiB = 1024;
    const { keyBytes: remoteKey } = await deriveMasterKey(remotePassword, remoteKdf);

    const remoteData: VaultData = {
      version: 1,
      updatedAt: 2000,
      settings: {
        autoLockTimeoutMinutes: 5,
        biometricUnlockEnabled: false,
        syncProvider: 'github-gist',
        theme: 'dark',
      },
      groups: [],
      entries: [
        {
          id: 'remote-gist-1',
          issuer: 'RemoteGistAccount',
          label: 'remote@gist.com',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          createdAt: 2000,
          updatedAt: 2000,
        },
      ],
    };

    const remotePayload = await encryptVault(remoteData, remoteKey, remoteKdf);

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('gists/gist-remote-id')) {
        if (init?.method === 'PATCH') {
          return {
            ok: true,
            json: async () => ({ id: 'gist-remote-id' }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            id: 'gist-remote-id',
            files: {
              'vault2fa-encrypted.json': {
                content: JSON.stringify(remotePayload),
              },
            },
          }),
        } as Response;
      }
      throw new Error(`Unexpected: ${url}`);
    });

    // 1. Without password, throws GistSaltMismatchError
    await expect(vault.syncWithGist()).rejects.toThrowError(GistSaltMismatchError);

    // 2. With password, succeeds and adopts remote credentials
    const result = await vault.syncWithGist(remotePassword);
    expect(result.entriesAdded).toBe(2);
    expect(result.entriesUpdated).toBe(0);
    expect(result.entriesSoftDeleted).toBe(0);
    expect(result.entriesPurged).toBe(0);
    expect(vault.lastSyncResult?.entriesAdded).toBe(2);
    expect(vault.syncToast?.message).toContain('2 added');
    expect(vault.entries.length).toBe(2);
    expect(vault.getKdfParams().salt).toBe(remoteKdf.salt);
  });
});

describe('VaultStore soft delete, restore, and purge operations', () => {
  beforeEach(() => {
    vault.status = 'unlocked';
    vault.data = {
      version: 1,
      updatedAt: 1000,
      settings: {
        autoLockTimeoutMinutes: 5,
        biometricUnlockEnabled: false,
        syncProvider: 'none',
        theme: 'dark',
      },
      groups: [{ id: 'work', name: 'Work' }],
      entries: [
        {
          id: 'item-1',
          issuer: 'GitHub',
          label: 'alice',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          groupId: 'work',
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'item-2',
          issuer: 'AWS',
          label: 'root',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          createdAt: 2000,
          updatedAt: 2000,
        },
      ],
      tombstones: [],
    };
    vault.activeGroupId = null;
    vault.searchQuery = '';
  });

  it('soft-deletes an entry and moves it to restoring view', async () => {
    expect(vault.activeEntriesCount).toBe(2);
    expect(vault.deletedEntriesCount).toBe(0);

    await vault.deleteEntry('item-1');

    expect(vault.activeEntriesCount).toBe(1);
    expect(vault.deletedEntriesCount).toBe(1);
    expect(vault.entries.length).toBe(1);
    expect(vault.entries[0].id).toBe('item-2');

    // In restoring view:
    vault.activeGroupId = 'deleted';
    expect(vault.entries.length).toBe(1);
    expect(vault.entries[0].id).toBe('item-1');
    expect(vault.entries[0].deletedAt).toBeDefined();

    // No permanent tombstone created on soft-delete
    expect(vault.data?.tombstones?.length).toBe(0);
  });

  it('restores a deleted secret back to active vault', async () => {
    await vault.deleteEntry('item-1');
    expect(vault.activeEntriesCount).toBe(1);

    await vault.restoreEntry('item-1');
    expect(vault.activeEntriesCount).toBe(2);
    expect(vault.deletedEntriesCount).toBe(0);

    vault.activeGroupId = null;
    expect(vault.entries.map((e) => e.id)).toContain('item-1');
    expect(vault.entries.find((e) => e.id === 'item-1')?.deletedAt).toBeUndefined();
  });

  it('completely deletes (purges) a secret and records a tombstone', async () => {
    await vault.deleteEntry('item-1');
    expect(vault.deletedEntriesCount).toBe(1);

    await vault.purgeEntry('item-1');
    expect(vault.data?.entries.length).toBe(1);
    expect(vault.deletedEntriesCount).toBe(0);
    expect(vault.activeEntriesCount).toBe(1);
    expect(vault.data?.tombstones).toEqual([expect.objectContaining({ id: 'item-1' })]);
  });

  it('restores all deleted secrets at once', async () => {
    await vault.deleteEntry('item-1');
    await vault.deleteEntry('item-2');
    expect(vault.activeEntriesCount).toBe(0);
    expect(vault.deletedEntriesCount).toBe(2);

    await vault.restoreAllDeletedEntries();
    expect(vault.activeEntriesCount).toBe(2);
    expect(vault.deletedEntriesCount).toBe(0);
    expect(vault.entries.length).toBe(2);
  });

  it('purges all deleted secrets at once and records tombstones', async () => {
    await vault.deleteEntry('item-1');
    await vault.deleteEntry('item-2');
    expect(vault.deletedEntriesCount).toBe(2);

    await vault.purgeAllDeletedEntries();
    expect(vault.data?.entries.length).toBe(0);
    expect(vault.deletedEntriesCount).toBe(0);
    expect(vault.data?.tombstones?.length).toBe(2);
  });
});

describe('VaultStore sync status & toast notifications', () => {
  it('formats sync summary correctly for various counts', () => {
    const noChanges = formatSyncSummary(
      {
        entriesAdded: 0,
        entriesUpdated: 0,
        entriesSoftDeleted: 0,
        entriesPurged: 0,
      },
      'GitHub Gist',
    );
    expect(noChanges.summary).toBe('GitHub Gist has updated (up to date)');
    expect(noChanges.badgeText).toBe('Synced');

    const addedOnly = formatSyncSummary(
      {
        entriesAdded: 2,
        entriesUpdated: 0,
        entriesSoftDeleted: 0,
        entriesPurged: 0,
      },
      'GitHub Gist',
    );
    expect(addedOnly.summary).toBe('Synced with GitHub Gist: 2 added');
    expect(addedOnly.badgeText).toBe('Synced (+2)');

    const combined = formatSyncSummary({
      entriesAdded: 1,
      entriesUpdated: 3,
      entriesSoftDeleted: 2,
      entriesPurged: 1,
    });
    expect(combined.summary).toBe(
      'Synced: 1 added, 3 updated, 2 soft-deleted, 1 permanently deleted',
    );
    expect(combined.badgeText).toBe('Synced (+1, ~3, -2, ✕1)');
  });

  it('shows and dismisses sync toasts', () => {
    vault.showSyncToast('Test toast');
    expect(vault.syncToast?.message).toBe('Test toast');

    vault.dismissSyncToast();
    expect(vault.syncToast).toBeNull();
  });

  it('syncs with Gist using config override in a single pass', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return { ok: true, json: async () => ({ id: 'new-gist-123' }) } as Response;
      }
      throw new Error('Unexpected');
    });

    await vault.initVault('TestPassword123!');
    const entry = await vault.addEntry({
      issuer: 'Test',
      label: 'test@example.com',
      secret: 'JBSWY3DPEHPK3PXP',
      type: 'totp',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
    await vault.deleteEntry(entry.id);

    const result = await vault.syncWithGist({
      token: 'ghp_token123',
      gistId: '',
      autoSync: true,
    });

    expect(result.entriesSoftDeleted).toBe(1);
    expect(vault.data?.settings.gistSync?.token).toBe('ghp_token123');
    expect(vault.data?.settings.gistSync?.gistId).toBe('new-gist-123');
    expect(vault.lastSyncResult?.entriesSoftDeleted).toBe(1);
  });

  it('syncAll returns no-provider when neither Gist nor Local File is configured', async () => {
    await vault.initVault('TestPassword123!');
    const result = await vault.syncAll();
    expect(result.synced).toBe(false);
    expect(result.reason).toBe('no-provider');
    expect(result.syncedProviders).toHaveLength(0);
  });

  it('syncAll manually syncs configured Gist even when autoSync is false', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return { ok: true, json: async () => ({ id: 'new-gist-manual-123' }) } as Response;
      }
      throw new Error('Unexpected');
    });

    await vault.initVault('TestPassword123!');
    await vault.updateSettings({
      gistSync: {
        token: 'ghp_token_manual',
        gistId: '',
        autoSync: false,
      },
    });

    const result = await vault.syncAll();
    expect(result.synced).toBe(true);
    expect(result.syncedProviders).toContain('GitHub Gist');
    expect(vault.syncStatus).toBe('synced');
  });
});
