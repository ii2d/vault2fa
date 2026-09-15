import { describe, it, expect } from 'vitest';
import { mergeVaultData } from './merge';
import type { OTPEntry, VaultData } from '$lib/types';

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

  it('merges non-overlapping entries from local and remote', () => {
    const local = createMockVault([entryA]);
    const remote = createMockVault([entryB]);

    const result = mergeVaultData(local, remote);
    expect(result.merged.entries.length).toBe(2);
    expect(result.entriesAdded).toBe(1);
    expect(result.hasChanges).toBe(true);
    expect(result.merged.entries.map((e) => e.issuer).sort()).toEqual(['GitHub', 'Google']);
  });

  it('resolves conflicting updates using Last-Write-Wins (LWW)', () => {
    const localEntry: OTPEntry = {
      ...entryA,
      label: 'older@github.com',
      updatedAt: now - 20000,
    };
    const remoteEntry: OTPEntry = {
      ...entryA,
      label: 'newer@github.com',
      updatedAt: now - 5000,
    };

    const local = createMockVault([localEntry]);
    const remote = createMockVault([remoteEntry]);

    const result = mergeVaultData(local, remote);
    expect(result.merged.entries.length).toBe(1);
    expect(result.merged.entries[0].label).toBe('newer@github.com');
    expect(result.entriesUpdated).toBe(1);
  });

  it('respects tombstones when an entry was deleted on one side', () => {
    // Local has entryA updated at now - 20000
    const local = createMockVault([entryA]);
    // Remote deleted entryA at now - 10000 (after entryA update)
    const remote = createMockVault([], [{ id: '1', deletedAt: now - 10000 }]);

    const result = mergeVaultData(local, remote);
    expect(result.merged.entries.length).toBe(0);
    expect(result.entriesDeleted).toBe(1);
    expect(result.merged.tombstones).toEqual([{ id: '1', deletedAt: now - 10000 }]);
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
