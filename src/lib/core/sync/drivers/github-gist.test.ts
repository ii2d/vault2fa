import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateGitHubToken,
  createGistWithPayload,
  fetchGistPayload,
  updateGistPayload,
  syncVaultWithGist,
} from './github-gist';
import { encryptVault, generateKdfParams } from '$lib/core/crypto';
import type { EncryptedVaultPayload, VaultData } from '$lib/types';

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

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        files: {
          'vault2fa-encrypted.json': {
            content: JSON.stringify(payload),
          },
        },
      }),
    } as Response);

    const fetched = await fetchGistPayload('ghp_token', 'gist-123');
    expect(fetched.format).toBe('vault2fa-v1');
    expect(fetched.ciphertext).toBe('testciphertext');
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
    expect(result.syncedVault.entries.map((e) => e.issuer).sort()).toEqual(['GitHub', 'Google']);
  });
});
