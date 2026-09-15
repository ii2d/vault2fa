import { decryptVault, deriveMasterKey, encryptVault, generateKdfParams } from '$lib/core/crypto';
import { db } from '$lib/core/storage';
import type {
  EncryptedVaultPayload,
  OTPEntry,
  VaultData,
  VaultGroup,
  VaultSettings,
} from '$lib/types';

export type VaultStatus = 'loading' | 'uninitialized' | 'locked' | 'unlocked';

export const DEFAULT_VAULT_SETTINGS: VaultSettings = {
  autoLockTimeoutMinutes: 5,
  biometricUnlockEnabled: false,
  syncProvider: 'none',
  theme: 'dark',
};

class VaultStore {
  status = $state<VaultStatus>('loading');
  data = $state<VaultData | null>(null);
  activeGroupId = $state<string | null>(null);
  searchQuery = $state<string>('');
  autoLockSecondsLeft = $state<number>(300);

  private masterKey: Uint8Array | null = null;
  private cachedPayload: EncryptedVaultPayload | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private lastActivityTimestamp = Date.now();

  /**
   * Filtered and sorted 2FA entries based on active group, search query, and pinned status.
   */
  entries = $derived.by(() => {
    if (!this.data) return [];
    let list = [...this.data.entries];

    // Filter by group
    if (this.activeGroupId === 'uncategorized') {
      list = list.filter((e) => !e.groupId);
    } else if (this.activeGroupId) {
      list = list.filter((e) => e.groupId === this.activeGroupId);
    }

    // Filter by search query
    const query = this.searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (e) =>
          e.issuer.toLowerCase().includes(query) ||
          e.label.toLowerCase().includes(query) ||
          e.tags?.some((t) => t.toLowerCase().includes(query)),
      );
    }

    // Sort: pinned first, then alphabetical by issuer/label
    return list.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      const nameA = (a.issuer || a.label).toLowerCase();
      const nameB = (b.issuer || b.label).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  });

  groups = $derived<VaultGroup[]>(this.data?.groups ?? []);
  settings = $derived<VaultSettings>(this.data?.settings ?? DEFAULT_VAULT_SETTINGS);
  isUnlocked = $derived(this.status === 'unlocked');
  isLocked = $derived(this.status === 'locked');
  isUninitialized = $derived(this.status === 'uninitialized');

  /**
   * Checks IndexedDB for existing encrypted vault.
   */
  async checkInitialState(): Promise<void> {
    try {
      const payload = await db.loadEncryptedVault();
      if (payload) {
        this.cachedPayload = payload;
        this.status = 'locked';
      } else {
        this.status = 'uninitialized';
      }
    } catch {
      this.status = 'uninitialized';
    }
  }

  /**
   * Initializes a brand-new vault with the user's master password.
   */
  async initVault(masterPassword: string): Promise<void> {
    const kdfParams = generateKdfParams();
    const { keyBytes } = await deriveMasterKey(masterPassword, kdfParams);

    const initialData: VaultData = {
      version: 1,
      updatedAt: Date.now(),
      entries: [],
      groups: [
        { id: 'group-personal', name: 'Personal', icon: 'home' },
        { id: 'group-work', name: 'Work', icon: 'briefcase' },
      ],
      settings: { ...DEFAULT_VAULT_SETTINGS },
    };

    const payload = await encryptVault(initialData, keyBytes, kdfParams);
    await db.saveEncryptedVault(payload);

    this.cachedPayload = payload;
    this.masterKey = keyBytes;
    this.data = initialData;
    this.status = 'unlocked';
    this.startAutoLockTimer();
  }

  /**
   * Unlocks an existing vault using the master password.
   */
  async unlockVault(masterPassword: string): Promise<void> {
    let payload = this.cachedPayload;
    if (!payload) {
      payload = await db.loadEncryptedVault();
      if (!payload) {
        this.status = 'uninitialized';
        throw new Error('No vault found to unlock');
      }
      this.cachedPayload = payload;
    }

    const { keyBytes } = await deriveMasterKey(masterPassword, payload.kdf);
    const decrypted = await decryptVault(payload, keyBytes);

    this.masterKey = keyBytes;
    this.data = decrypted;
    this.status = 'unlocked';
    this.startAutoLockTimer();
  }

  /**
   * Unlocks an existing vault using an unwrapped master key (e.g. from WebAuthn biometrics).
   */
  async unlockWithMasterKey(keyBytes: Uint8Array): Promise<void> {
    let payload = this.cachedPayload;
    if (!payload) {
      payload = await db.loadEncryptedVault();
      if (!payload) {
        this.status = 'uninitialized';
        throw new Error('No vault found to unlock');
      }
      this.cachedPayload = payload;
    }

    const decrypted = await decryptVault(payload, keyBytes);

    this.masterKey = keyBytes;
    this.data = decrypted;
    this.status = 'unlocked';
    this.startAutoLockTimer();
  }

  /**
   * Immediately clears sensitive keys and decrypted data from memory.
   */
  lockVault(): void {
    this.masterKey = null;
    this.data = null;
    this.status = 'locked';
    this.stopAutoLockTimer();
  }

  /**
   * Records user activity to keep the session alive.
   */
  recordActivity(): void {
    this.lastActivityTimestamp = Date.now();
    const timeoutSec = (this.data?.settings.autoLockTimeoutMinutes ?? 5) * 60;
    this.autoLockSecondsLeft = timeoutSec;
  }

  /**
   * Adds an OTP token to the vault and persists the updated encrypted payload.
   */
  async addEntry(entryInput: Omit<OTPEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<OTPEntry> {
    this.ensureUnlocked();

    const now = Date.now();
    const newEntry: OTPEntry = {
      ...entryInput,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    const updatedData: VaultData = {
      ...this.data!,
      updatedAt: now,
      entries: [...this.data!.entries, newEntry],
      tombstones: (this.data!.tombstones ?? []).filter((t) => t.id !== newEntry.id),
    };

    await this.persistData(updatedData);
    return newEntry;
  }

  /**
   * Updates an existing token.
   */
  async updateEntry(id: string, updates: Partial<OTPEntry>): Promise<void> {
    this.ensureUnlocked();

    const now = Date.now();
    const updatedEntries = this.data!.entries.map((e) => {
      if (e.id === id) {
        return { ...e, ...updates, updatedAt: now };
      }
      return e;
    });

    const updatedData: VaultData = {
      ...this.data!,
      updatedAt: now,
      entries: updatedEntries,
    };

    await this.persistData(updatedData);
  }

  /**
   * Deletes an entry by ID and records a tombstone for sync conflict resolution.
   */
  async deleteEntry(id: string): Promise<void> {
    this.ensureUnlocked();

    const now = Date.now();
    const existingTombstones = (this.data!.tombstones ?? []).filter((t) => t.id !== id);
    const updatedTombstones = [...existingTombstones, { id, deletedAt: now }];

    const updatedData: VaultData = {
      ...this.data!,
      updatedAt: now,
      entries: this.data!.entries.filter((e) => e.id !== id),
      tombstones: updatedTombstones,
    };

    await this.persistData(updatedData);
  }

  /**
   * Adds a new category/group.
   */
  async addGroup(name: string, icon?: string): Promise<VaultGroup> {
    this.ensureUnlocked();

    const newGroup: VaultGroup = {
      id: crypto.randomUUID(),
      name: name.trim(),
      icon,
    };

    const updatedData: VaultData = {
      ...this.data!,
      updatedAt: Date.now(),
      groups: [...this.data!.groups, newGroup],
    };

    await this.persistData(updatedData);
    return newGroup;
  }

  /**
   * Deletes a group and unassigns any tokens in it.
   */
  async deleteGroup(groupId: string): Promise<void> {
    this.ensureUnlocked();

    const updatedEntries = this.data!.entries.map((e) => {
      if (e.groupId === groupId) {
        const copy = { ...e };
        delete copy.groupId;
        return copy;
      }
      return e;
    });

    const updatedData: VaultData = {
      ...this.data!,
      updatedAt: Date.now(),
      groups: this.data!.groups.filter((g) => g.id !== groupId),
      entries: updatedEntries,
    };

    if (this.activeGroupId === groupId) {
      this.activeGroupId = null;
    }

    await this.persistData(updatedData);
  }

  /**
   * Updates vault settings (e.g., autoLockTimeoutMinutes, theme).
   */
  async updateSettings(settingsUpdate: Partial<VaultSettings>): Promise<void> {
    this.ensureUnlocked();

    const updatedData: VaultData = {
      ...this.data!,
      updatedAt: Date.now(),
      settings: {
        ...this.data!.settings,
        ...settingsUpdate,
      },
    };

    await this.persistData(updatedData);
    this.recordActivity();
  }

  /**
   * Returns current cached encrypted payload (for backup export).
   */
  getCachedPayload(): EncryptedVaultPayload | null {
    return this.cachedPayload;
  }

  /**
   * Returns master key bytes in memory (for biometrics wrapping).
   */
  getMasterKey(): Uint8Array | null {
    return this.masterKey;
  }

  /**
   * Re-encrypts the vault with a new master password and fresh Argon2id salt.
   */
  async changeMasterPassword(currentPassword: string, newPassword: string): Promise<void> {
    this.ensureUnlocked();

    // Verify current password first
    const { keyBytes: testKey } = await deriveMasterKey(currentPassword, this.cachedPayload!.kdf);
    await decryptVault(this.cachedPayload!, testKey);

    // Derive new key with fresh KDF params
    const newKdfParams = generateKdfParams();
    const { keyBytes: newKeyBytes } = await deriveMasterKey(newPassword, newKdfParams);

    const newPayload = await encryptVault(this.data!, newKeyBytes, newKdfParams);
    await db.saveEncryptedVault(newPayload);

    this.cachedPayload = newPayload;
    this.masterKey = newKeyBytes;
  }

  /**
   * Imports entries and groups from backup or external sources.
   */
  async importEntriesAndGroups(
    importedEntries: OTPEntry[],
    importedGroups?: VaultGroup[],
  ): Promise<{ addedCount: number }> {
    this.ensureUnlocked();

    const existingSecrets = new Set(this.data!.entries.map((e) => e.secret));
    const toAdd = importedEntries.filter((e) => !existingSecrets.has(e.secret));

    const existingGroupNames = new Set(this.data!.groups.map((g) => g.name.toLowerCase()));
    const groupsToAdd = (importedGroups || []).filter(
      (g) => !existingGroupNames.has(g.name.toLowerCase()),
    );

    const updatedData: VaultData = {
      ...this.data!,
      updatedAt: Date.now(),
      groups: [...this.data!.groups, ...groupsToAdd],
      entries: [...this.data!.entries, ...toAdd],
    };

    await this.persistData(updatedData);
    return { addedCount: toAdd.length };
  }

  /**
   * Completely resets the vault and database.
   */
  async resetAll(): Promise<void> {
    this.lockVault();
    await db.purgeAll();
    this.cachedPayload = null;
    this.status = 'uninitialized';
  }

  private ensureUnlocked(): void {
    if (this.status !== 'unlocked' || !this.data || !this.masterKey || !this.cachedPayload) {
      throw new Error('Vault is locked');
    }
  }

  private async persistData(updatedData: VaultData): Promise<void> {
    const payload = await encryptVault(updatedData, this.masterKey!, this.cachedPayload!.kdf);
    await db.saveEncryptedVault(payload);
    this.cachedPayload = payload;
    this.data = updatedData;
  }

  private startAutoLockTimer(): void {
    this.stopAutoLockTimer();
    this.recordActivity();

    this.timerInterval = setInterval(() => {
      if (this.status !== 'unlocked' || !this.data) return;

      const timeoutMinutes = this.data.settings.autoLockTimeoutMinutes || 5;
      const timeoutMs = timeoutMinutes * 60 * 1000;
      const elapsedMs = Date.now() - this.lastActivityTimestamp;
      const remainingSec = Math.max(0, Math.ceil((timeoutMs - elapsedMs) / 1000));

      this.autoLockSecondsLeft = remainingSec;

      if (remainingSec <= 0) {
        this.lockVault();
      }
    }, 1000);
  }

  private stopAutoLockTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}

export const vault = new VaultStore();
