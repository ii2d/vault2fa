import type { OTPEntry, VaultData, VaultGroup, VaultTombstone } from '$lib/types';

export interface MergeResult {
  merged: VaultData;
  hasChanges: boolean;
  entriesAdded: number;
  entriesUpdated: number;
  entriesSoftDeleted: number;
  entriesPurged: number;
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
  let entriesSoftDeleted = 0;
  let entriesPurged = 0;

  for (const id of allIds) {
    const localEntry = localMap.get(id);
    const remoteEntry = remoteMap.get(id);
    const tombstoneDeletedAt = tombstoneMap.get(id);

    // Case A: Entry exists in both local and remote
    if (localEntry && remoteEntry) {
      const winner = remoteEntry.updatedAt > localEntry.updatedAt ? remoteEntry : localEntry;
      if (tombstoneDeletedAt !== undefined && tombstoneDeletedAt >= winner.updatedAt) {
        // Permanently purged by tombstone
        entriesPurged++;
      } else {
        mergedEntries.push(winner);

        // Check if soft-deletion state transitioned
        const localIsSoftDeleted = Boolean(localEntry.deletedAt);
        const remoteIsSoftDeleted = Boolean(remoteEntry.deletedAt);

        if (localIsSoftDeleted !== remoteIsSoftDeleted) {
          if (winner.deletedAt) {
            // One side soft-deleted this entry and won
            entriesSoftDeleted++;
          } else {
            // One side restored this entry and won
            entriesUpdated++;
          }
        } else if (localEntry.updatedAt !== remoteEntry.updatedAt) {
          entriesUpdated++;
        }
      }
      continue;
    }

    // Case B: Entry only exists in local
    if (localEntry) {
      if (tombstoneDeletedAt !== undefined && tombstoneDeletedAt >= localEntry.updatedAt) {
        // Permanently purged by remote tombstone
        entriesPurged++;
      } else {
        mergedEntries.push(localEntry);
        if (localEntry.deletedAt) {
          entriesSoftDeleted++;
        } else {
          entriesAdded++;
        }
      }
      continue;
    }

    // Case C: Entry only exists in remote
    if (remoteEntry) {
      if (tombstoneDeletedAt !== undefined && tombstoneDeletedAt >= remoteEntry.updatedAt) {
        // Permanently purged by local tombstone
        entriesPurged++;
      } else {
        mergedEntries.push(remoteEntry);
        if (remoteEntry.deletedAt) {
          entriesSoftDeleted++;
        } else {
          entriesAdded++;
        }
      }
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

  const groupsChanged =
    mergedGroups.length !== local.groups.length ||
    local.groups.some((g) => {
      const match = groupMap.get(g.id);
      return !match || match.name !== g.name;
    });

  const hasChanges =
    entriesAdded > 0 ||
    entriesUpdated > 0 ||
    entriesSoftDeleted > 0 ||
    entriesPurged > 0 ||
    groupsChanged;

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
    entriesSoftDeleted,
    entriesPurged,
  };
}

export interface FormatSyncOptions {
  providerName?: string;
  vaultData?: VaultData;
}

/**
 * Formats human-readable sync feedback summaries and badge counters.
 */
export function formatSyncResult(
  counts: {
    entriesAdded: number;
    entriesUpdated: number;
    entriesSoftDeleted: number;
    entriesPurged: number;
  },
  options: FormatSyncOptions = {},
): { summary: string; badgeText: string } {
  const parts: string[] = [];
  if (counts.entriesAdded > 0) parts.push(`${counts.entriesAdded} added`);
  if (counts.entriesUpdated > 0) parts.push(`${counts.entriesUpdated} updated`);
  if (counts.entriesSoftDeleted > 0) parts.push(`${counts.entriesSoftDeleted} soft-deleted`);
  if (counts.entriesPurged > 0) parts.push(`${counts.entriesPurged} permanently deleted`);

  const prefix = options.providerName ? `Synced with ${options.providerName}: ` : 'Synced: ';

  if (parts.length > 0) {
    const badgeParts: string[] = [];
    if (counts.entriesAdded > 0) badgeParts.push(`+${counts.entriesAdded}`);
    if (counts.entriesUpdated > 0) badgeParts.push(`~${counts.entriesUpdated}`);
    if (counts.entriesSoftDeleted > 0) badgeParts.push(`-${counts.entriesSoftDeleted}`);
    if (counts.entriesPurged > 0) badgeParts.push(`✕${counts.entriesPurged}`);

    return {
      summary: `${prefix}${parts.join(', ')}`,
      badgeText: `Synced (${badgeParts.join(', ')})`,
    };
  }

  // If no direct changes, summarize existing vault accounts if available
  if (options.vaultData) {
    const activeCount = options.vaultData.entries.filter((e) => !e.deletedAt).length;
    const softDeletedCount = options.vaultData.entries.filter((e) => Boolean(e.deletedAt)).length;
    const vaultParts: string[] = [];
    if (activeCount > 0) vaultParts.push(`${activeCount} active`);
    if (softDeletedCount > 0) vaultParts.push(`${softDeletedCount} soft-deleted`);

    const summaryText = vaultParts.length > 0 ? vaultParts.join(', ') : '0 accounts';
    return {
      summary: options.providerName
        ? `${options.providerName} has updated (${summaryText})`
        : `Synced (${summaryText})`,
      badgeText: 'Synced',
    };
  }

  return {
    summary: options.providerName
      ? `${options.providerName} has updated (up to date)`
      : 'Synced (up to date)',
    badgeText: 'Synced',
  };
}
