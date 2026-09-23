import { encryptVault } from '$lib/core/crypto';
import { db } from '$lib/core/storage';
import { VaultSaltMismatchError } from '$lib/core/sync/errors';
import { mergeVaultData } from '$lib/core/sync/merge';
import type { EncryptedVaultPayload, KeyDerivationParams, VaultData } from '$lib/types';
import { decryptRemotePayload, type SyncDriverResult } from './common';

export type LocalFileSyncResult = SyncDriverResult;

const METADATA_KEY_FILE_HANDLE = 'sync_local_file_handle';

export interface LocalFileDriverStatus {
  isSupported: boolean;
  isLinked: boolean;
  fileName?: string;
  hasPermission?: boolean;
}

/**
 * Checks if the browser supports the Native File System Access API.
 */
export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showOpenFilePicker' in window &&
    'showSaveFilePicker' in window
  );
}

/**
 * Prompts the user to pick an existing .vault or .json file from their disk.
 */
export async function pickLocalVaultFile(): Promise<{
  handle: FileSystemFileHandle;
  fileName: string;
}> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API is not supported in this browser.');
  }

  const [handle] = await (
    window as unknown as {
      showOpenFilePicker: (options?: unknown) => Promise<FileSystemFileHandle[]>;
    }
  ).showOpenFilePicker({
    types: [
      {
        description: 'vault2fa Encrypted Vault File',
        accept: {
          'application/json': ['.vault', '.json'],
        },
      },
    ],
    multiple: false,
  });

  if (!handle) {
    throw new Error('No file selected.');
  }

  return { handle, fileName: handle.name };
}

/**
 * Prompts the user to create a new .vault file on disk.
 */
export async function createLocalVaultFile(suggestedName = 'vault2fa.vault'): Promise<{
  handle: FileSystemFileHandle;
  fileName: string;
}> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API is not supported in this browser.');
  }

  const handle = await (
    window as unknown as {
      showSaveFilePicker: (options?: unknown) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker({
    suggestedName,
    types: [
      {
        description: 'vault2fa Encrypted Vault File',
        accept: {
          'application/json': ['.vault', '.json'],
        },
      },
    ],
  });

  if (!handle) {
    throw new Error('File creation cancelled.');
  }

  await storeLinkedHandle(handle);
  return { handle, fileName: handle.name };
}

/**
 * Stores the FileSystemFileHandle in IndexedDB.
 */
export async function storeLinkedHandle(handle: FileSystemFileHandle): Promise<void> {
  await db.metadata.put({
    key: METADATA_KEY_FILE_HANDLE,
    value: handle,
  });
}

/**
 * Retrieves the currently linked FileSystemFileHandle from IndexedDB.
 */
export async function getLinkedHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const record = await db.metadata.get(METADATA_KEY_FILE_HANDLE);
    return (record?.value as FileSystemFileHandle) ?? null;
  } catch {
    return null;
  }
}

/**
 * Clears the currently linked file handle.
 */
export async function uncheckLinkedHandle(): Promise<void> {
  await db.metadata.delete(METADATA_KEY_FILE_HANDLE);
}

/**
 * Verifies or requests readwrite permissions for the stored handle.
 */
export async function verifyHandlePermission(
  handle: FileSystemFileHandle,
  readWrite = true,
): Promise<boolean> {
  try {
    const opts = { mode: readWrite ? 'readwrite' : 'read' };
    const query = await (
      handle as unknown as {
        queryPermission: (opts: unknown) => Promise<string>;
        requestPermission: (opts: unknown) => Promise<string>;
      }
    ).queryPermission(opts);

    if (query === 'granted') return true;

    const req = await (
      handle as unknown as {
        requestPermission: (opts: unknown) => Promise<string>;
      }
    ).requestPermission(opts);

    return req === 'granted';
  } catch {
    return false;
  }
}

/**
 * Writes an EncryptedVaultPayload to the given FileSystemFileHandle.
 */
export async function writeVaultToFileHandle(
  handle: FileSystemFileHandle,
  payload: EncryptedVaultPayload,
): Promise<void> {
  const isPermitted = await verifyHandlePermission(handle, true);
  if (!isPermitted) {
    throw new Error('Permission denied to write to the linked vault file.');
  }

  const writable = await (
    handle as unknown as {
      createWritable: () => Promise<{
        write: (data: string) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }
  ).createWritable();

  const formattedJson = JSON.stringify(payload, null, 2);
  await writable.write(formattedJson);
  await writable.close();
}

/**
 * Reads and parses an EncryptedVaultPayload from the given FileSystemFileHandle.
 */
export async function readVaultFromFileHandle(
  handle: FileSystemFileHandle,
): Promise<EncryptedVaultPayload> {
  const isPermitted = await verifyHandlePermission(handle, false);
  if (!isPermitted) {
    throw new Error('Permission denied to read from the linked vault file.');
  }

  const file = await handle.getFile();
  const text = await file.text();
  const parsed = JSON.parse(text) as EncryptedVaultPayload;

  if (!parsed || parsed.format !== 'vault2fa-v1' || !parsed.ciphertext || !parsed.encryption?.iv) {
    throw new Error('Selected file is not a valid encrypted vault2fa file.');
  }

  return parsed;
}

/**
 * Returns current status of local file driver.
 */
export async function getLocalFileDriverStatus(): Promise<LocalFileDriverStatus> {
  const supported = isFileSystemAccessSupported();
  if (!supported) {
    return { isSupported: false, isLinked: false };
  }

  const handle = await getLinkedHandle();
  if (!handle) {
    return { isSupported: true, isLinked: false };
  }

  let hasPermission = false;
  try {
    const perm = await (
      handle as unknown as {
        queryPermission: (opts: unknown) => Promise<string>;
      }
    ).queryPermission({ mode: 'readwrite' });
    hasPermission = perm === 'granted';
  } catch {
    // Permission query failed, remains false
  }

  return {
    isSupported: true,
    isLinked: true,
    fileName: handle.name,
    hasPermission,
  };
}

/**
 * Performs full two-way sync with a local .vault file handle:
 * Reads remote file, decrypts (resolving salt and credential adoption), merges with local,
 * and writes back to file if changes exist or credentials changed.
 */
export async function syncVaultWithLocalFile(
  handle: FileSystemFileHandle,
  localData: VaultData,
  masterKey: Uint8Array,
  kdfParams: KeyDerivationParams,
  remotePassword?: string,
): Promise<LocalFileSyncResult> {
  const remotePayload = await readVaultFromFileHandle(handle);
  const { remoteData, effectiveMasterKey, effectiveKdf } = await decryptRemotePayload(
    remotePayload,
    masterKey,
    kdfParams,
    remotePassword,
    () => new VaultSaltMismatchError(handle.name, handle),
  );

  const mergeResult = mergeVaultData(localData, remoteData);

  if (
    mergeResult.hasChanges ||
    effectiveMasterKey !== masterKey ||
    effectiveKdf.salt !== kdfParams.salt
  ) {
    const updatedPayload = await encryptVault(mergeResult.merged, effectiveMasterKey, effectiveKdf);
    await writeVaultToFileHandle(handle, updatedPayload);
  }

  return {
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
