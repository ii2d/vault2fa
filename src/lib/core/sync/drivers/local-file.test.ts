import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isFileSystemAccessSupported,
  storeLinkedHandle,
  getLinkedHandle,
  uncheckLinkedHandle,
  writeVaultToFileHandle,
  readVaultFromFileHandle,
} from './local-file';
import type { EncryptedVaultPayload } from '$lib/types';

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
});
