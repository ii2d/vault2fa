import { describe, it, expect, beforeEach } from 'vitest';
import { vault } from './vault.svelte';
import type { OTPEntry } from '$lib/types';

describe('VaultStore group filtering', () => {
  const sampleEntries: OTPEntry[] = [
    {
      id: '1',
      issuer: 'GitHub',
      label: 'user@github',
      secret: 'JBSWY3DPEHPK3PXP',
      type: 'totp',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      groupId: 'group-work',
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: '2',
      issuer: 'Google',
      label: 'user@gmail.com',
      secret: 'JBSWY3DPEHPK3PXP',
      type: 'totp',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      // uncategorized: no groupId
      createdAt: 2000,
      updatedAt: 2000,
    },
    {
      id: '3',
      issuer: 'Cloudflare',
      label: 'admin@cf',
      secret: 'JBSWY3DPEHPK3PXP',
      type: 'totp',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      // uncategorized: undefined groupId
      groupId: undefined,
      createdAt: 3000,
      updatedAt: 3000,
    },
    {
      id: '4',
      issuer: 'Personal Email',
      label: 'me@home.com',
      secret: 'JBSWY3DPEHPK3PXP',
      type: 'totp',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      groupId: 'group-personal',
      createdAt: 4000,
      updatedAt: 4000,
    },
  ];

  beforeEach(() => {
    vault.data = {
      version: 1,
      updatedAt: 1000,
      settings: {
        autoLockTimeoutMinutes: 5,
        biometricUnlockEnabled: false,
        syncProvider: 'none',
        theme: 'dark',
      },
      groups: [
        { id: 'group-work', name: 'Work' },
        { id: 'group-personal', name: 'Personal' },
      ],
      entries: [...sampleEntries],
    };
    vault.activeGroupId = null;
    vault.searchQuery = '';
  });

  it('shows all entries when activeGroupId is null', () => {
    expect(vault.entries.length).toBe(4);
  });

  it('filters uncategorized entries when activeGroupId is "uncategorized"', () => {
    vault.activeGroupId = 'uncategorized';
    expect(vault.entries.length).toBe(2);
    expect(vault.entries.map((e) => e.issuer)).toEqual(['Cloudflare', 'Google']);
  });

  it('filters by specific group ID', () => {
    vault.activeGroupId = 'group-work';
    expect(vault.entries.length).toBe(1);
    expect(vault.entries[0].issuer).toBe('GitHub');

    vault.activeGroupId = 'group-personal';
    expect(vault.entries.length).toBe(1);
    expect(vault.entries[0].issuer).toBe('Personal Email');
  });
});
