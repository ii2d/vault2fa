import { describe, expect, it } from 'vitest';
import type { OTPEntry, VaultData } from '$lib/types';
import { mergeVaultData } from './merge';

function createMockVault(
  entries: OTPEntry[],
  tombstones: Array<{ id: string; deletedAt: number }> = [],
): VaultData {
  return {
    version: 1,
    updatedAt: 1000,
    groups: [{ id: 'grp1', name: 'Work' }],
    settings: {
      autoLockTimeoutMinutes: 5,
      biometricUnlockEnabled: false,
      syncProvider: 'none',
      theme: 'dark',
    },
    entries,
    tombstones,
  };
}

describe('mergeVaultData Conflict Resolution', () => {
  const now = Date.now();

  const entryA: OTPEntry = {
    id: '1',
    issuer: 'GitHub',
    label: 'user@github.com',
    secret: 'JBSWY3DPEHPK3PXP',
    type: 'totp',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    updatedAt: now - 50000,
    createdAt: now - 100000,
  };

  const entryB: OTPEntry = {
    id: '2',
    issuer: 'Google',
    label: 'user@gmail.com',
    secret: 'JBSWY3DPEHPK3PXP',
    type: 'totp',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    updatedAt: now - 50000,
    createdAt: now - 100000,
  };

  it('merges non-overlapping entries from local and remote with accurate bidirectional additions', () => {
    const local = createMockVault([entryA]);
    const remote = createMockVault([entryB]);

    const result = mergeVaultData(local, remote);
    expect(result.merged.entries.length).toBe(2);
    // entryB added from remote, entryA added from local -> 2 total additions across stores
    expect(result.entriesAdded).toBe(2);
    expect(result.hasChanges).toBe(true);
    expect(result.merged.entries.map((e) => e.issuer).sort()).toEqual(['GitHub', 'Google']);
  });

  it('counts entryAdded when only local has a new entry', () => {
    const local = createMockVault([entryA]);
    const remote = createMockVault([]);

    const result = mergeVaultData(local, remote);
    expect(result.merged.entries.length).toBe(1);
    expect(result.entriesAdded).toBe(1);
    expect(result.hasChanges).toBe(true);
  });

  it('resolves conflicting updates using Last-Write-Wins (LWW) and counts updates bidirectionally', () => {
    // 1. Remote newer than local
    const localEntry1: OTPEntry = {
      ...entryA,
      label: 'older@github.com',
      updatedAt: now - 20000,
    };
    const remoteEntry1: OTPEntry = {
      ...entryA,
      label: 'newer@github.com',
      updatedAt: now - 5000,
    };

    const result1 = mergeVaultData(createMockVault([localEntry1]), createMockVault([remoteEntry1]));
    expect(result1.merged.entries.length).toBe(1);
    expect(result1.merged.entries[0].label).toBe('newer@github.com');
    expect(result1.entriesUpdated).toBe(1);

    // 2. Local newer than remote
    const localEntry2: OTPEntry = {
      ...entryA,
      label: 'local-newer@github.com',
      updatedAt: now - 5000,
    };
    const remoteEntry2: OTPEntry = {
      ...entryA,
      label: 'remote-older@github.com',
      updatedAt: now - 20000,
    };

    const result2 = mergeVaultData(createMockVault([localEntry2]), createMockVault([remoteEntry2]));
    expect(result2.merged.entries.length).toBe(1);
    expect(result2.merged.entries[0].label).toBe('local-newer@github.com');
    expect(result2.entriesUpdated).toBe(1);
  });

  it('tracks soft-deletions when an entry transitions to trash', () => {
    const activeEntry: OTPEntry = {
      ...entryA,
      updatedAt: now - 20000,
    };
    const softDeletedEntry: OTPEntry = {
      ...entryA,
      deletedAt: now - 5000,
      updatedAt: now - 5000,
    };

    // Local has active, remote soft-deleted it (newer)
    const resultRemoteWon = mergeVaultData(
      createMockVault([activeEntry]),
      createMockVault([softDeletedEntry]),
    );
    expect(resultRemoteWon.merged.entries[0].deletedAt).toBe(now - 5000);
    expect(resultRemoteWon.entriesSoftDeleted).toBe(1);
    expect(resultRemoteWon.entriesUpdated).toBe(0);

    // Local soft-deleted it (newer), remote has active
    const resultLocalWon = mergeVaultData(
      createMockVault([softDeletedEntry]),
      createMockVault([activeEntry]),
    );
    expect(resultLocalWon.merged.entries[0].deletedAt).toBe(now - 5000);
    expect(resultLocalWon.entriesSoftDeleted).toBe(1);
    expect(resultLocalWon.entriesUpdated).toBe(0);
  });

  it('respects tombstones when an entry was permanently purged on one side', () => {
    // Local has entryA updated at now - 20000
    const local = createMockVault([entryA]);
    // Remote deleted entryA at now - 10000 (after entryA update)
    const remote = createMockVault([], [{ id: '1', deletedAt: now - 10000 }]);

    const result = mergeVaultData(local, remote);
    expect(result.merged.entries.length).toBe(0);
    expect(result.entriesPurged).toBe(1);
    expect(result.merged.tombstones).toEqual([{ id: '1', deletedAt: now - 10000 }]);
  });

  it('returns zero counts and hasChanges false when vaults are identical', () => {
    const local = createMockVault([entryA, entryB]);
    const remote = createMockVault([entryA, entryB]);

    const result = mergeVaultData(local, remote);
    expect(result.hasChanges).toBe(false);
    expect(result.entriesAdded).toBe(0);
    expect(result.entriesUpdated).toBe(0);
    expect(result.entriesSoftDeleted).toBe(0);
    expect(result.entriesPurged).toBe(0);
  });

  it('revives entry if re-created or modified after tombstone deletion', () => {
    // Remote deleted entryA at now - 30000
    const remote = createMockVault([], [{ id: '1', deletedAt: now - 30000 }]);
    // Local re-created or updated entryA at now - 10000 (after deletion)
    const localEntry: OTPEntry = {
      ...entryA,
      updatedAt: now - 10000,
    };
    const local = createMockVault([localEntry]);

    const result = mergeVaultData(local, remote);
    expect(result.merged.entries.length).toBe(1);
    expect(result.merged.entries[0].id).toBe('1');
    // Tombstone should be cleared since entry is now alive
    expect(result.merged.tombstones?.length).toBe(0);
  });

  it('merges groups and retains unique categories', () => {
    const local = createMockVault([entryA]);
    local.groups = [{ id: 'grp1', name: 'Work' }];

    const remote = createMockVault([entryB]);
    remote.groups = [
      { id: 'grp1', name: 'Work' },
      { id: 'grp2', name: 'Personal' },
    ];

    const result = mergeVaultData(local, remote);
    expect(result.merged.groups.length).toBe(2);
    expect(result.merged.groups.map((g) => g.name)).toEqual(['Work', 'Personal']);
  });
});
