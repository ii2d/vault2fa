import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveMasterKey, encryptVault, generateKdfParams } from '$lib/core/crypto';
import type { EncryptedVaultPayload, VaultData } from '$lib/types';
import { GistSaltMismatchError } from '../errors';
import {
  createGistWithPayload,
  encodeSyncConfigQr,
  fetchGistPayload,
  parseSyncConfigQr,
  syncVaultWithGist,
  updateGistPayload,
  validateGitHubToken,
} from './github-gist';

describe('GitHub Gist Sync Driver', () => {
  const mockMasterKey = new Uint8Array(32).fill(7);

  const mockVault: VaultData = {
    version: 1,
    updatedAt: 1000,
    groups: [{ id: 'work', name: 'Work' }],
    settings: {
      autoLockTimeoutMinutes: 5,
      biometricUnlockEnabled: false,
      syncProvider: 'github-gist',
      theme: 'dark',
    },
    entries: [
      {
        id: 'token-1',
        issuer: 'GitHub',
        label: 'test@github.com',
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

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('validates a GitHub token successfully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ login: 'octocat', id: 12345 }),
    } as Response);

    const user = await validateGitHubToken('ghp_testtoken');
    expect(user.login).toBe('octocat');
    expect(user.id).toBe(12345);
  });

  it('throws helpful error on 401 token invalid', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    await expect(validateGitHubToken('bad_token')).rejects.toThrow(
      'Invalid GitHub token. Please verify your token permissions.',
    );
  });

  it('creates a new secret Gist with payload', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'gist-xyz-987' }),
    } as Response);

    const kdf = generateKdfParams();
    const payload: EncryptedVaultPayload = {
      format: 'vault2fa-v1',
      kdf,
      encryption: {
        algorithm: 'AES-256-GCM',
        iv: 'testiv',
        tagLength: 128,
      },
      ciphertext: 'testciphertext',
    };

    const gistId = await createGistWithPayload('ghp_token', payload);
    expect(gistId).toBe('gist-xyz-987');
  });

  it('fetches existing Gist payload', async () => {
    const kdf = generateKdfParams();
    const payload: EncryptedVaultPayload = {
      format: 'vault2fa-v1',
      kdf,
      encryption: {
        algorithm: 'AES-256-GCM',
        iv: 'testiv',
        tagLength: 128,
      },
      ciphertext: 'testciphertext',
    };

    let requestedUrl = '';
    let requestInit: RequestInit | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      requestedUrl = url;
      requestInit = init;
      return {
        ok: true,
        json: async () => ({
          files: {
            'vault2fa-encrypted.json': {
              content: JSON.stringify(payload),
            },
          },
        }),
      } as Response;
    });

    const fetched = await fetchGistPayload('ghp_token', 'gist-123');
    expect(fetched.format).toBe('vault2fa-v1');
    expect(fetched.ciphertext).toBe('testciphertext');
    expect(requestedUrl).toContain('https://api.github.com/gists/gist-123?_t=');
    expect(requestInit?.cache).toBe('no-store');
  });

  it('updates existing Gist with payload', async () => {
    let requestBody = '';
    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      requestBody = init?.body as string;
      return { ok: true, json: async () => ({ id: 'gist-123' }) } as Response;
    });

    const kdf = generateKdfParams();
    const payload: EncryptedVaultPayload = {
      format: 'vault2fa-v1',
      kdf,
      encryption: {
        algorithm: 'AES-256-GCM',
        iv: 'testiv',
        tagLength: 128,
      },
      ciphertext: 'updatedciphertext',
    };

    await updateGistPayload('ghp_token', 'gist-123', payload);
    expect(requestBody).toContain('updatedciphertext');
  });

  it('performs complete two-way sync with Gist', async () => {
    // Remote has an extra entry
    const remoteVault: VaultData = {
      ...mockVault,
      updatedAt: 2000,
      entries: [
        ...mockVault.entries,
        {
          id: 'token-2',
          issuer: 'Google',
          label: 'test@gmail.com',
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

    const kdf = generateKdfParams();
    const encryptedRemote = await encryptVault(remoteVault, mockMasterKey, kdf);

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      // GET gist
      if (!init?.method || init.method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            files: {
              'vault2fa-encrypted.json': {
                content: JSON.stringify(encryptedRemote),
              },
            },
          }),
        } as Response;
      }

      // PATCH gist
      if (init?.method === 'PATCH') {
        return {
          ok: true,
          json: async () => ({ id: 'gist-123' }),
        } as Response;
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const result = await syncVaultWithGist('ghp_token', 'gist-123', mockVault, mockMasterKey, kdf);
    expect(result.syncedVault.entries.length).toBe(2);
    expect(result.entriesAdded).toBe(1);
    expect(result.entriesUpdated).toBe(0);
    expect(result.entriesSoftDeleted).toBe(0);
    expect(result.entriesPurged).toBe(0);
    expect(result.syncedVault.entries.map((e) => e.issuer).sort()).toEqual(['GitHub', 'Google']);
  });

  it('does not send PATCH request when there are no changes between local and remote', async () => {
    const kdf = generateKdfParams();
    const encryptedRemote = await encryptVault(mockVault, mockMasterKey, kdf);
    let patchCalled = false;

    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            files: {
              'vault2fa-encrypted.json': {
                content: JSON.stringify(encryptedRemote),
              },
            },
          }),
        } as Response;
      }
      if (init?.method === 'PATCH') {
        patchCalled = true;
        return { ok: true, json: async () => ({ id: 'gist-123' }) } as Response;
      }
      throw new Error('Unexpected');
    });

    const result = await syncVaultWithGist('ghp_token', 'gist-123', mockVault, mockMasterKey, kdf);
    expect(result.hasChanges).toBe(false);
    expect(patchCalled).toBe(false);
  });

  it('reports correct counts on initial gist creation', async () => {
    let createdPayload: EncryptedVaultPayload | null = null;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        createdPayload = JSON.parse(body.files['vault2fa-encrypted.json'].content);
        return { ok: true, json: async () => ({ id: 'new-gist-id' }) } as Response;
      }
      throw new Error('Unexpected');
    });

    const kdf = generateKdfParams();
    const vaultWithDeleted: VaultData = {
      ...mockVault,
      entries: [
        ...mockVault.entries,
        {
          id: 'token-deleted',
          issuer: 'OldService',
          label: 'old@test.com',
          secret: 'JBSWY3DPEHPK3PXP',
          type: 'totp',
          algorithm: 'SHA1',
          digits: 6,
          period: 30,
          createdAt: 500,
          updatedAt: 600,
          deletedAt: 600,
        },
      ],
    };

    const result = await syncVaultWithGist('ghp_token', '', vaultWithDeleted, mockMasterKey, kdf);
    expect(result.entriesAdded).toBe(1); // 1 active entry
    expect(result.entriesSoftDeleted).toBe(1); // 1 soft-deleted entry
    expect(result.entriesUpdated).toBe(0);
    expect(result.entriesPurged).toBe(0);
    expect(createdPayload).not.toBeNull();
  });

  it('encodes and parses Gist sync config QR URI', () => {
    const config = {
      token: 'ghp_secret_token_123',
      gistId: 'gist_abc_456',
      autoSync: true,
    };

    const qrUri = encodeSyncConfigQr(config);
    expect(qrUri).toContain('v2fa-sync://gist');
    expect(qrUri).toContain('token=ghp_secret_token_123');
    expect(qrUri).toContain('gistId=gist_abc_456');
    expect(qrUri).toContain('autoSync=1');

    const parsed = parseSyncConfigQr(qrUri);
    expect(parsed).toEqual(config);

    expect(parseSyncConfigQr('invalid-uri')).toBeNull();
  });

  it('throws GistSaltMismatchError when salt differs and no remotePassword is provided', async () => {
    const localKdf = generateKdfParams();
    localKdf.iterations = 1;
    localKdf.memoryKiB = 1024;

    const remoteKdf = generateKdfParams();
    remoteKdf.iterations = 1;
    remoteKdf.memoryKiB = 1024;
    const remotePassword = 'RemotePassword999!';
    const { keyBytes: remoteKey } = await deriveMasterKey(remotePassword, remoteKdf);

    const remotePayload = await encryptVault(mockVault, remoteKey, remoteKdf);

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('gists/gist-mismatch')) {
        return {
          ok: true,
          json: async () => ({
            id: 'gist-mismatch',
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

    await expect(
      syncVaultWithGist('ghp_token', 'gist-mismatch', mockVault, mockMasterKey, localKdf),
    ).rejects.toThrowError(GistSaltMismatchError);
  });

  it('reconciles salt mismatch and adopts credentials when remotePassword is provided', async () => {
    const localKdf = generateKdfParams();
    localKdf.iterations = 1;
    localKdf.memoryKiB = 1024;

    const remoteKdf = generateKdfParams();
    remoteKdf.iterations = 1;
    remoteKdf.memoryKiB = 1024;
    const remotePassword = 'RemotePassword999!';
    const { keyBytes: remoteKey } = await deriveMasterKey(remotePassword, remoteKdf);

    const remoteVault: VaultData = {
      ...mockVault,
      entries: [
        {
          id: 'token-remote',
          issuer: 'RemoteCloud',
          label: 'cloud@domain.com',
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
    const remotePayload = await encryptVault(remoteVault, remoteKey, remoteKdf);

    let patchedBody = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('gists/gist-mismatch')) {
        if (init?.method === 'PATCH') {
          patchedBody = init.body as string;
          return {
            ok: true,
            json: async () => ({ id: 'gist-mismatch' }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({
            id: 'gist-mismatch',
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

    const result = await syncVaultWithGist(
      'ghp_token',
      'gist-mismatch',
      mockVault,
      mockMasterKey,
      localKdf,
      remotePassword,
    );

    expect(result.syncedVault.entries.length).toBe(2);
    expect(result.adoptedKey).toEqual(remoteKey);
    expect(result.adoptedKdf?.salt).toBe(remoteKdf.salt);
    expect(patchedBody).toContain('vault2fa-v1');
  });
});
