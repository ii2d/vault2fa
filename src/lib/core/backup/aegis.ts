/**
 * Aegis Authenticator JSON Import / Export Format
 * Open-source standard interoperability format for 2FA vaults.
 */

import type { OTPEntry, OTPAlgorithm, OTPType, VaultData, VaultGroup } from '$lib/types';
import { cleanSecret } from '$lib/core/totp';

export interface AegisEntryInfo {
  secret: string;
  algo?: string;
  digits?: number;
  period?: number;
  counter?: number;
}

export interface AegisEntry {
  type: string;
  uuid: string;
  name: string;
  issuer: string;
  note?: string;
  favorite?: boolean;
  icon?: string | null;
  info: AegisEntryInfo;
  groups?: string[];
}

export interface AegisGroup {
  uuid: string;
  name: string;
}

export interface AegisDb {
  version: number;
  entries: AegisEntry[];
  groups?: AegisGroup[];
}

export interface AegisExportFormat {
  version: number;
  header: {
    slots: unknown[];
    params: Record<string, unknown>;
  };
  db: AegisDb;
}

/**
 * Checks if a string is a valid Aegis unencrypted JSON export.
 */
export function isAegisJson(content: string): boolean {
  try {
    const data = JSON.parse(content);
    return Boolean(data && typeof data === 'object' && data.db && Array.isArray(data.db.entries));
  } catch {
    return false;
  }
}

/**
 * Parses an Aegis unencrypted JSON string into OTPEntry and VaultGroup records.
 */
export function parseAegisJson(content: string): {
  entries: OTPEntry[];
  groups: VaultGroup[];
} {
  const data = JSON.parse(content) as AegisExportFormat;
  if (!data?.db?.entries || !Array.isArray(data.db.entries)) {
    throw new Error('Invalid Aegis JSON: Missing db.entries array');
  }

  const groupMap = new Map<string, VaultGroup>();
  if (Array.isArray(data.db.groups)) {
    for (const g of data.db.groups) {
      if (g.name) {
        groupMap.set(g.name, {
          id: g.uuid || crypto.randomUUID(),
          name: g.name,
        });
      }
    }
  }

  const entries: OTPEntry[] = [];
  const now = Date.now();

  for (const item of data.db.entries) {
    if (!item.info?.secret) continue;

    const secret = cleanSecret(item.info.secret);
    if (!secret) continue;

    const rawType = (item.type || 'totp').toLowerCase();
    const type: OTPType = rawType === 'hotp' ? 'hotp' : 'totp';

    const rawAlgo = (item.info.algo || 'SHA1').toUpperCase();
    let algorithm: OTPAlgorithm = 'SHA1';
    if (rawAlgo === 'SHA256') algorithm = 'SHA256';
    else if (rawAlgo === 'SHA512') algorithm = 'SHA512';

    const digits = item.info.digits === 8 ? 8 : 6;
    const period = item.info.period || 30;

    let groupId: string | undefined = undefined;
    if (Array.isArray(item.groups) && item.groups.length > 0) {
      const groupName = item.groups[0];
      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, {
          id: crypto.randomUUID(),
          name: groupName,
        });
      }
      groupId = groupMap.get(groupName)?.id;
    }

    entries.push({
      id: item.uuid || crypto.randomUUID(),
      issuer: item.issuer || 'Unnamed',
      label: item.name || item.issuer || 'Account',
      secret,
      type,
      algorithm,
      digits,
      period,
      counter: type === 'hotp' ? (item.info.counter ?? 0) : undefined,
      pinned: Boolean(item.favorite),
      groupId,
      note: item.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    entries,
    groups: Array.from(groupMap.values()),
  };
}

/**
 * Serializes the current vault into an Aegis-compatible JSON format.
 */
export function exportToAegisJson(vault: VaultData): string {
  const groupLookup = new Map<string, string>();
  const aegisGroups: AegisGroup[] = [];

  for (const g of vault.groups) {
    groupLookup.set(g.id, g.name);
    aegisGroups.push({
      uuid: g.id,
      name: g.name,
    });
  }

  const aegisEntries: AegisEntry[] = vault.entries
    .filter((entry) => !entry.deletedAt)
    .map((entry) => ({
      type: entry.type,
      uuid: entry.id,
      name: entry.label,
      issuer: entry.issuer,
      note: entry.note || '',
      favorite: Boolean(entry.pinned),
      icon: null,
      info: {
        secret: entry.secret,
        algo: entry.algorithm,
        digits: entry.digits,
        period: entry.period,
        ...(entry.type === 'hotp' ? { counter: entry.counter ?? 0 } : {}),
      },
      groups:
        entry.groupId && groupLookup.has(entry.groupId) ? [groupLookup.get(entry.groupId)!] : [],
    }));

  const aegisExport: AegisExportFormat = {
    version: 1,
    header: {
      slots: [],
      params: {},
    },
    db: {
      version: 1,
      entries: aegisEntries,
      groups: aegisGroups,
    },
  };

  return JSON.stringify(aegisExport, null, 2);
}
