import type { OTPEntry, VaultData, VaultGroup, VaultTombstone } from '$lib/types';

export interface MergeResult {
  merged: VaultData;
  hasChanges: boolean;
  entriesAdded: number;
  entriesUpdated: number;
  entriesDeleted: number;
}

export interface MergeOptions {
  /** Maximum age of tombstones in milliseconds before pruning (defaults to 60 days). */
  tombstoneMaxAgeMs?: number;
}

const DEFAULT_TOMBSTONE_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

/**
 * Merges two decrypted VaultData instances using Last-Write-Wins (LWW) conflict resolution
 * and tombstone tracking for deleted entries.
 */
export function mergeVaultData(
  local: VaultData,
  remote: VaultData,
  options: MergeOptions = {},
): MergeResult {
  const maxAge = options.tombstoneMaxAgeMs ?? DEFAULT_TOMBSTONE_MAX_AGE_MS;
  const cutoffTime = Date.now() - maxAge;

  // 1. Merge & prune tombstones
  const tombstoneMap = new Map<string, number>();

  for (const t of local.tombstones ?? []) {
    if (t.deletedAt >= cutoffTime) {
      tombstoneMap.set(t.id, Math.max(t.deletedAt, tombstoneMap.get(t.id) ?? 0));
    }
  }

  for (const t of remote.tombstones ?? []) {
    if (t.deletedAt >= cutoffTime) {
      tombstoneMap.set(t.id, Math.max(t.deletedAt, tombstoneMap.get(t.id) ?? 0));
    }
  }

  // 2. Resolve entries
  const localMap = new Map<string, OTPEntry>(local.entries.map((e) => [e.id, e]));
  const remoteMap = new Map<string, OTPEntry>(remote.entries.map((e) => [e.id, e]));
  const allIds = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);

  const mergedEntries: OTPEntry[] = [];
  let entriesAdded = 0;
  let entriesUpdated = 0;
  let entriesDeleted = 0;

  for (const id of allIds) {
    const localEntry = localMap.get(id);
    const remoteEntry = remoteMap.get(id);
    const tombstoneDeletedAt = tombstoneMap.get(id);

    // Case A: Entry exists in both local and remote
    if (localEntry && remoteEntry) {
      const winner = remoteEntry.updatedAt > localEntry.updatedAt ? remoteEntry : localEntry;
      if (tombstoneDeletedAt !== undefined && tombstoneDeletedAt >= winner.updatedAt) {
        // Deleted by tombstone
        entriesDeleted++;
      } else {
        mergedEntries.push(winner);
        if (winner === remoteEntry && remoteEntry.updatedAt > localEntry.updatedAt) {
          entriesUpdated++;
        }
      }
      continue;
    }

    // Case B: Entry only exists in local
    if (localEntry) {
      if (tombstoneDeletedAt !== undefined && tombstoneDeletedAt >= localEntry.updatedAt) {
        // Remote deleted this entry
        entriesDeleted++;
      } else {
        mergedEntries.push(localEntry);
      }
      continue;
    }

    // Case C: Entry only exists in remote
    if (remoteEntry) {
      if (tombstoneDeletedAt !== undefined && tombstoneDeletedAt >= remoteEntry.updatedAt) {
        // Local deleted this entry
        entriesDeleted++;
      } else {
        mergedEntries.push(remoteEntry);
        entriesAdded++;
      }
      continue;
    }
  }

  // 3. Merge Groups (by id)
  const groupMap = new Map<string, VaultGroup>();
  for (const g of local.groups) {
    groupMap.set(g.id, g);
  }
  for (const g of remote.groups) {
    if (!groupMap.has(g.id)) {
      groupMap.set(g.id, g);
    }
  }
  const mergedGroups = Array.from(groupMap.values());

  // 4. Merge Tombstones array (only keep tombstones for entries not currently present)
  const presentEntryIds = new Set(mergedEntries.map((e) => e.id));
  const activeTombstones: VaultTombstone[] = [];
  for (const [id, deletedAt] of tombstoneMap.entries()) {
    if (!presentEntryIds.has(id)) {
      activeTombstones.push({ id, deletedAt });
    }
  }

  // 5. Build merged settings (preserving local device-specific settings if present)
  const mergedSettings = {
    ...remote.settings,
    ...local.settings,
    // Gist and Local file sync configs preserve whatever valid tokens exist locally
    gistSync: local.settings.gistSync ?? remote.settings.gistSync,
    localFileSync: local.settings.localFileSync ?? remote.settings.localFileSync,
  };

  const hasChanges =
    entriesAdded > 0 ||
    entriesUpdated > 0 ||
    entriesDeleted > 0 ||
    mergedGroups.length !== local.groups.length;

  const mergedVault: VaultData = {
    version: Math.max(local.version, remote.version, 1),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt, Date.now()),
    entries: mergedEntries,
    groups: mergedGroups,
    settings: mergedSettings,
    tombstones: activeTombstones,
  };

  return {
    merged: mergedVault,
    hasChanges,
    entriesAdded,
    entriesUpdated,
    entriesDeleted,
  };
}
