import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EncryptedVaultPayload } from '$lib/types';
import {
  getLinkedHandle,
  isFileSystemAccessSupported,
  readVaultFromFileHandle,
  storeLinkedHandle,
  syncVaultWithLocalFile,
  uncheckLinkedHandle,
  writeVaultToFileHandle,
} from './local-file';

describe('Local File Driver (File System Access)', () => {
  const mockPayload: EncryptedVaultPayload = {
    format: 'vault2fa-v1',
    encryption: {
      algorithm: 'AES-256-GCM',
      iv: 'base64iv',
      tagLength: 128,
    },
    ciphertext: 'base64ciphertext',
    kdf: {
      algorithm: 'Argon2id',
      iterations: 3,
      memoryKiB: 65536,
      parallelism: 4,
      salt: 'base64salt',
    },
  };

  beforeEach(async () => {
    await uncheckLinkedHandle();
  });

  it('detects File System Access API support correctly in jsdom', () => {
    // In standard jsdom window.showOpenFilePicker is undefined
    expect(isFileSystemAccessSupported()).toBe(false);
  });

  it('persists and retrieves FileSystemFileHandle in IndexedDB', async () => {
    const mockHandle = {
      name: 'vault2fa.vault',
      kind: 'file',
    } as unknown as FileSystemFileHandle;

    await storeLinkedHandle(mockHandle);
    const retrieved = await getLinkedHandle();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('vault2fa.vault');

    await uncheckLinkedHandle();
    const afterClear = await getLinkedHandle();
    expect(afterClear).toBeNull();
  });

  it('writes payload to writable stream', async () => {
    let writtenText = '';
    let isClosed = false;

    const mockHandle = {
      name: 'vault.json',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockImplementation(async (data: string) => {
          writtenText = data;
        }),
        close: vi.fn().mockImplementation(async () => {
          isClosed = true;
        }),
      }),
    } as unknown as FileSystemFileHandle;

    await writeVaultToFileHandle(mockHandle, mockPayload);
    expect(isClosed).toBe(true);
    expect(JSON.parse(writtenText)).toEqual(mockPayload);
  });

  it('reads and parses valid vault payload from file handle', async () => {
    const mockFile = {
      text: vi.fn().mockResolvedValue(JSON.stringify(mockPayload)),
    };

    const mockHandle = {
      name: 'vault.json',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockResolvedValue(mockFile),
    } as unknown as FileSystemFileHandle;

    const result = await readVaultFromFileHandle(mockHandle);
    expect(result.format).toBe('vault2fa-v1');
    expect(result.ciphertext).toBe('base64ciphertext');
  });

  it('throws error when reading invalid file content', async () => {
    const mockFile = {
      text: vi.fn().mockResolvedValue(JSON.stringify({ notAVault: true })),
    };

    const mockHandle = {
      name: 'invalid.json',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockResolvedValue(mockFile),
    } as unknown as FileSystemFileHandle;

    await expect(readVaultFromFileHandle(mockHandle)).rejects.toThrow(
      'Selected file is not a valid encrypted vault2fa file.',
    );
  });

  it('performs two-way sync with local file and writes back when changes exist', async () => {
    const { encryptVault, generateKdfParams } = await import('$lib/core/crypto');
    const masterKey = new Uint8Array(32).fill(5);
    const kdf = generateKdfParams();

    const localVault = {
      version: 1,
      updatedAt: 1000,
      groups: [],
      settings: {
        autoLockTimeoutMinutes: 5,
        biometricUnlockEnabled: false,
        syncProvider: 'none' as const,
        theme: 'dark' as const,
      },
      entries: [
        {
          id: 'item-1',
          issuer: 'ServiceA',
          label: 'a@test.com',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp' as const,
          algorithm: 'SHA1' as const,
          digits: 6,
          period: 30,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      tombstones: [],
    };

    const remoteVault = {
      ...localVault,
      updatedAt: 2000,
      entries: [
        ...localVault.entries,
        {
          id: 'item-2',
          issuer: 'ServiceB',
          label: 'b@test.com',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp' as const,
          algorithm: 'SHA1' as const,
          digits: 6,
          period: 30,
          createdAt: 2000,
          updatedAt: 2000,
        },
      ],
    };

    const remotePayload = await encryptVault(remoteVault, masterKey, kdf);
    let writtenText = '';

    const mockHandle = {
      name: 'vault.vault',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(JSON.stringify(remotePayload)),
      }),
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockImplementation(async (data: string) => {
          writtenText = data;
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as FileSystemFileHandle;

    const result = await syncVaultWithLocalFile(mockHandle, localVault, masterKey, kdf);
    expect(result.syncedVault.entries.length).toBe(2);
    expect(result.entriesAdded).toBe(1);
    expect(result.hasChanges).toBe(true);
    expect(writtenText).not.toBe('');
  });

  it('does not write to file handle if there are no changes', async () => {
    const { encryptVault, generateKdfParams } = await import('$lib/core/crypto');
    const masterKey = new Uint8Array(32).fill(5);
    const kdf = generateKdfParams();

    const vault = {
      version: 1,
      updatedAt: 1000,
      groups: [],
      settings: {
        autoLockTimeoutMinutes: 5,
        biometricUnlockEnabled: false,
        syncProvider: 'none' as const,
        theme: 'dark' as const,
      },
      entries: [],
      tombstones: [],
    };

    const remotePayload = await encryptVault(vault, masterKey, kdf);
    let writeCalled = false;

    const mockHandle = {
      name: 'vault.vault',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      requestPermission: vi.fn().mockResolvedValue('granted'),
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(JSON.stringify(remotePayload)),
      }),
      createWritable: vi.fn().mockResolvedValue({
        write: vi.fn().mockImplementation(async () => {
          writeCalled = true;
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as FileSystemFileHandle;

    const result = await syncVaultWithLocalFile(mockHandle, vault, masterKey, kdf);
    expect(result.hasChanges).toBe(false);
    expect(writeCalled).toBe(false);
  });
});
