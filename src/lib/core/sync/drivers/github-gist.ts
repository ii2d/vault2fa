import { encryptVault } from '$lib/core/crypto';
import { mergeVaultData } from '$lib/core/sync/merge';
import { GistSaltMismatchError } from '$lib/core/sync/errors';
import { decryptRemotePayload, type SyncDriverResult } from './common';
import type { EncryptedVaultPayload, KeyDerivationParams, VaultData } from '$lib/types';

const GIST_FILENAME = 'vault2fa-encrypted.json';
const GIST_DESCRIPTION = 'vault2fa Zero-Knowledge Encrypted Backup';

export interface GistSyncResult extends SyncDriverResult {
  gistId: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  name?: string;
  avatar_url?: string;
}

/**
 * Validates a GitHub Personal Access Token (PAT) by fetching the authenticated user.
 */
export async function validateGitHubToken(token: string): Promise<GitHubUser> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error('GitHub Personal Access Token is required.');
  }

  const response = await fetch('https://api.github.com/user', {
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${trimmed}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid GitHub token. Please verify your token permissions.');
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as GitHubUser;
}

/**
 * Creates a new secret Gist containing the encrypted vault payload.
 */
export async function createGistWithPayload(
  token: string,
  payload: EncryptedVaultPayload,
): Promise<string> {
  const response = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(payload, null, 2),
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create secret Gist: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as { id: string };
  return data.id;
}

/**
 * Fetches the encrypted vault payload from an existing Gist.
 */
export async function fetchGistPayload(
  token: string,
  gistId: string,
): Promise<EncryptedVaultPayload> {
  const cleanGistId = gistId.trim();
  const url = `https://api.github.com/gists/${encodeURIComponent(cleanGistId)}?_t=${Date.now()}`;
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Gist ID "${gistId}" was not found or token lacks access.`);
    }
    throw new Error(`Failed to fetch Gist: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    files?: Record<string, { content?: string }>;
  };

  const file = data.files?.[GIST_FILENAME];
  if (!file || !file.content) {
    throw new Error(`Gist does not contain a "${GIST_FILENAME}" file.`);
  }

  try {
    const payload = JSON.parse(file.content) as EncryptedVaultPayload;
    if (payload.format !== 'vault2fa-v1' || !payload.ciphertext) {
      throw new Error('Gist file content is not a valid vault2fa encrypted payload.');
    }
    return payload;
  } catch (err: unknown) {
    throw new Error(`Malformed JSON inside Gist: ${(err as Error).message}`, { cause: err });
  }
}

/**
 * Updates an existing Gist with a new encrypted vault payload.
 */
export async function updateGistPayload(
  token: string,
  gistId: string,
  payload: EncryptedVaultPayload,
): Promise<void> {
  const response = await fetch(
    `https://api.github.com/gists/${encodeURIComponent(gistId.trim())}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(payload, null, 2),
          },
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to update Gist: ${response.status} ${response.statusText}`);
  }
}

/**
 * Orchestrates a complete two-way sync with GitHub Gist:
 * 1. If gistId is empty, creates a new secret Gist with encrypted local data.
 * 2. If gistId exists, fetches remote, decrypts, merges via LWW, re-encrypts, and updates Gist.
 */
export async function syncVaultWithGist(
  token: string,
  gistId: string | undefined,
  localData: VaultData,
  masterKey: Uint8Array,
  kdfParams: KeyDerivationParams,
  remotePassword?: string,
): Promise<GistSyncResult> {
  const cleanToken = token.trim();
  const cleanGistId = gistId?.trim();

  // Case 1: No existing Gist ID -> Create initial Gist
  if (!cleanGistId) {
    const encrypted = await encryptVault(localData, masterKey, kdfParams);
    const newGistId = await createGistWithPayload(cleanToken, encrypted);
    const addedCount = localData.entries.filter((e) => !e.deletedAt).length;
    const softDeletedCount = localData.entries.filter((e) => Boolean(e.deletedAt)).length;
    return {
      gistId: newGistId,
      syncedVault: localData,
      hasChanges: addedCount > 0 || softDeletedCount > 0,
      entriesAdded: addedCount,
      entriesUpdated: 0,
      entriesSoftDeleted: softDeletedCount,
      entriesPurged: 0,
    };
  }

  // Case 2: Existing Gist ID -> Pull, Decrypt, Merge, Push
  const remotePayload = await fetchGistPayload(cleanToken, cleanGistId);
  const { remoteData, effectiveMasterKey, effectiveKdf } = await decryptRemotePayload(
    remotePayload,
    masterKey,
    kdfParams,
    remotePassword,
    () => new GistSaltMismatchError(cleanGistId, cleanToken),
  );

  // Merge using LWW and tombstones
  const mergeResult = mergeVaultData(localData, remoteData);

  // If merged vault differs from remote or adopted new credentials, push updated payload
  if (
    mergeResult.hasChanges ||
    effectiveMasterKey !== masterKey ||
    effectiveKdf.salt !== kdfParams.salt
  ) {
    const updatedPayload = await encryptVault(mergeResult.merged, effectiveMasterKey, effectiveKdf);
    await updateGistPayload(cleanToken, cleanGistId, updatedPayload);
  }

  return {
    gistId: cleanGistId,
    syncedVault: mergeResult.merged,
    hasChanges: mergeResult.hasChanges,
    entriesAdded: mergeResult.entriesAdded,
    entriesUpdated: mergeResult.entriesUpdated,
    entriesSoftDeleted: mergeResult.entriesSoftDeleted,
    entriesPurged: mergeResult.entriesPurged,
    adoptedKey: effectiveMasterKey !== masterKey ? effectiveMasterKey : undefined,
    adoptedKdf: effectiveKdf.salt !== kdfParams.salt ? effectiveKdf : undefined,
  };
}

export const SYNC_CONFIG_SCHEME = 'v2fa-sync://gist';

/**
 * Encodes a GitHub Gist sync configuration into a single static QR pairing string.
 */
export function encodeSyncConfigQr(config: {
  token: string;
  gistId?: string;
  autoSync: boolean;
}): string {
  const params = new URLSearchParams();
  params.set('token', config.token.trim());
  if (config.gistId?.trim()) {
    params.set('gistId', config.gistId.trim());
  }
  params.set('autoSync', config.autoSync ? '1' : '0');
  return `${SYNC_CONFIG_SCHEME}?${params.toString()}`;
}

/**
 * Parses a static QR pairing string into a GistSyncConfig object.
 */
export function parseSyncConfigQr(
  raw: string,
): { token: string; gistId?: string; autoSync: boolean } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(SYNC_CONFIG_SCHEME)) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const token = url.searchParams.get('token');
    if (!token) return null;

    const gistId = url.searchParams.get('gistId') || undefined;
    const autoSyncParam = url.searchParams.get('autoSync');
    const autoSync = autoSyncParam !== '0';

    return {
      token,
      gistId,
      autoSync,
    };
  } catch {
    return null;
  }
}
