import { SvelteSet } from 'svelte/reactivity';
import { decryptVault, deriveMasterKey, encryptVault, generateKdfParams } from '$lib/core/crypto';
import { db } from '$lib/core/storage';
import {
  mergeVaultData,
  type MergeResult,
  getLinkedHandle,
  storeLinkedHandle,
  writeVaultToFileHandle,
  readVaultFromFileHandle,
  updateGistPayload,
  syncVaultWithGist,
  type GistSyncResult,
  VaultSaltMismatchError,
} from '$lib/core/sync';
import type {
  EncryptedVaultPayload,
  KeyDerivationParams,
  OTPEntry,
  VaultData,
  VaultGroup,
  VaultSettings,
  GistSyncConfig,
} from '$lib/types';

export type VaultStatus = 'loading' | 'uninitialized' | 'locked' | 'unlocked';
export type VaultSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export const DEFAULT_VAULT_SETTINGS: VaultSettings = {
  autoLockTimeoutMinutes: 5,
  biometricUnlockEnabled: false,
  hideCodesByDefault: true,
  revealDurationSeconds: 8,
  syncProvider: 'none',
  theme: 'dark',
};

class VaultStore {
  status = $state<VaultStatus>('loading');
  data = $state<VaultData | null>(null);
  activeGroupId = $state<string | null>(null);
  searchQuery = $state<string>('');
  autoLockSecondsLeft = $state<number>(300);
  syncStatus = $state<VaultSyncStatus>('idle');
  syncError = $state<string | null>(null);

  private masterKey: Uint8Array | null = null;
  private cachedPayload: EncryptedVaultPayload | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private lastActivityTimestamp = Date.now();
  private isAutoSyncing = false;

  /**
   * Filtered and sorted 2FA entries based on active group, search query, and pinned status.
   */
  entries = $derived.by(() => {
    if (!this.data) return [];
    let list: OTPEntry[];

    if (this.activeGroupId === 'deleted') {
      list = this.data.entries.filter((e) => Boolean(e.deletedAt));
    } else {
      list = this.data.entries.filter((e) => !e.deletedAt);
      if (this.activeGroupId === 'uncategorized') {
        list = list.filter((e) => !e.groupId);
      } else if (this.activeGroupId) {
        list = list.filter((e) => e.groupId === this.activeGroupId);
      }
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

    // Sort:
    // If in deleted view, sort by most recently deleted first
    if (this.activeGroupId === 'deleted') {
      return list.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
    }

    // Otherwise: pinned first, then alphabetical by issuer/label
    return list.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(a.pinned)) {
        return a.pinned ? -1 : 1;
      }
      const nameA = (a.issuer || a.label).toLowerCase();
      const nameB = (b.issuer || b.label).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  });

  activeEntriesCount = $derived(this.data?.entries.filter((e) => !e.deletedAt).length ?? 0);
  deletedEntriesCount = $derived(
    this.data?.entries.filter((e) => Boolean(e.deletedAt)).length ?? 0,
  );
  deletedEntries = $derived(this.data?.entries.filter((e) => Boolean(e.deletedAt)) ?? []);

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
   * Initializes a new vault with pre-existing data (e.g. from an unencrypted backup file).
   */
  async initVaultWithData(vaultData: VaultData, masterPassword: string): Promise<void> {
    const kdfParams = generateKdfParams();
    const { keyBytes } = await deriveMasterKey(masterPassword, kdfParams);

    const dataToSave: VaultData = {
      ...vaultData,
      version: 1,
      updatedAt: Date.now(),
      settings: vaultData.settings || { ...DEFAULT_VAULT_SETTINGS },
    };

    const payload = await encryptVault(dataToSave, keyBytes, kdfParams);
    await db.saveEncryptedVault(payload);

    this.cachedPayload = payload;
    this.masterKey = keyBytes;
    this.data = dataToSave;
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
   * Soft-deletes an entry by ID and moves it to the restoring / recently deleted view.
   */
  async deleteEntry(id: string): Promise<void> {
    this.ensureUnlocked();

    const now = Date.now();
    const updatedEntries = this.data!.entries.map((e) => {
      if (e.id === id) {
        return {
          ...e,
          deletedAt: now,
          updatedAt: now,
        };
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
   * Restores a soft-deleted entry back to active accounts.
   */
  async restoreEntry(id: string): Promise<void> {
    this.ensureUnlocked();

    const now = Date.now();
    const updatedEntries = this.data!.entries.map((e) => {
      if (e.id === id) {
        const copy = { ...e };
        delete copy.deletedAt;
        copy.updatedAt = now;
        return copy;
      }
      return e;
    });

    // Clear any tombstone for this id if present
    const updatedTombstones = (this.data!.tombstones ?? []).filter((t) => t.id !== id);

    const updatedData: VaultData = {
      ...this.data!,
      updatedAt: now,
      entries: updatedEntries,
      tombstones: updatedTombstones,
    };

    await this.persistData(updatedData);
  }

  /**
   * Permanently deletes an entry and records a tombstone for sync conflict resolution.
   */
  async purgeEntry(id: string): Promise<void> {
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
   * Restores all soft-deleted entries back to the active vault.
   */
  async restoreAllDeletedEntries(): Promise<void> {
    this.ensureUnlocked();

    const now = Date.now();
    const restoredIds = new SvelteSet<string>();

    const updatedEntries = this.data!.entries.map((e) => {
      if (e.deletedAt) {
        restoredIds.add(e.id);
        const copy = { ...e };
        delete copy.deletedAt;
        copy.updatedAt = now;
        return copy;
      }
      return e;
    });

    const updatedTombstones = (this.data!.tombstones ?? []).filter((t) => !restoredIds.has(t.id));

    const updatedData: VaultData = {
      ...this.data!,
      updatedAt: now,
      entries: updatedEntries,
      tombstones: updatedTombstones,
    };

    await this.persistData(updatedData);
  }

  /**
   * Permanently removes all soft-deleted entries and records tombstones.
   */
  async purgeAllDeletedEntries(): Promise<void> {
    this.ensureUnlocked();

    const now = Date.now();
    const deletedList = this.data!.entries.filter((e) => Boolean(e.deletedAt));
    if (deletedList.length === 0) return;

    const newTombstones = deletedList.map((e) => ({ id: e.id, deletedAt: now }));
    const deletedIds = new SvelteSet(deletedList.map((e) => e.id));
    const remainingTombstones = (this.data!.tombstones ?? []).filter((t) => !deletedIds.has(t.id));

    const updatedData: VaultData = {
      ...this.data!,
      updatedAt: now,
      entries: this.data!.entries.filter((e) => !e.deletedAt),
      tombstones: [...remainingTombstones, ...newTombstones],
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
   * Decrypts an encrypted backup with its master password and imports/merges into the current active vault.
   */
  async importFromEncryptedPayload(
    payload: EncryptedVaultPayload,
    masterPassword: string,
  ): Promise<{ addedCount: number; totalFound: number }> {
    this.ensureUnlocked();
    if (payload.format !== 'vault2fa-v1' || !payload.ciphertext) {
      throw new Error('Invalid encrypted vault payload format.');
    }

    const { keyBytes } = await deriveMasterKey(masterPassword, payload.kdf);
    const decryptedData = await decryptVault(payload, keyBytes);

    const { addedCount } = await this.importEntriesAndGroups(
      decryptedData.entries,
      decryptedData.groups,
    );
    return { addedCount, totalFound: decryptedData.entries.length };
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

  /**
   * Returns current encrypted vault payload.
   */
  async getEncryptedPayload(): Promise<EncryptedVaultPayload> {
    this.ensureUnlocked();
    if (this.cachedPayload) return this.cachedPayload;
    const payload = await db.loadEncryptedVault();
    if (!payload) throw new Error('No vault found');
    this.cachedPayload = payload;
    return payload;
  }

  /**
   * Merges remote decrypted vault data into current vault and persists if changed.
   */
  async mergeRemoteData(remoteData: VaultData): Promise<MergeResult> {
    this.ensureUnlocked();
    const result = mergeVaultData(this.data!, remoteData);
    if (result.hasChanges) {
      await this.persistData(result.merged);
    }
    return result;
  }

  /**
   * Returns KDF parameters if unlocked.
   */
  getKdfParams(): KeyDerivationParams {
    this.ensureUnlocked();
    return this.cachedPayload!.kdf;
  }

  /**
   * Restores an encrypted vault payload and unlocks it with the provided master password.
   * Used for direct onboarding restore from QR code or fresh device setup.
   */
  async restoreAndUnlockFromPayload(
    payload: EncryptedVaultPayload,
    masterPassword: string,
    handle?: FileSystemFileHandle,
    gistConfig?: GistSyncConfig,
  ): Promise<void> {
    if (payload.format !== 'vault2fa-v1' || !payload.ciphertext) {
      throw new Error('Invalid encrypted vault payload format.');
    }

    const cleanPayload: EncryptedVaultPayload = {
      format: payload.format,
      kdf: {
        algorithm: payload.kdf.algorithm,
        iterations: Number(payload.kdf.iterations),
        memoryKiB: Number(payload.kdf.memoryKiB),
        parallelism: Number(payload.kdf.parallelism),
        salt: String(payload.kdf.salt),
      },
      encryption: {
        algorithm: payload.encryption.algorithm,
        iv: String(payload.encryption.iv),
        tagLength: Number(payload.encryption.tagLength || 128),
      },
      ciphertext: String(payload.ciphertext),
    };

    const { keyBytes } = await deriveMasterKey(masterPassword, cleanPayload.kdf);
    const decryptedData = await decryptVault(cleanPayload, keyBytes);

    const now = Date.now();
    const normalizedData: VaultData = {
      version: decryptedData.version || 1,
      updatedAt: decryptedData.updatedAt || now,
      entries: decryptedData.entries || [],
      groups: decryptedData.groups || [],
      settings: { ...DEFAULT_VAULT_SETTINGS, ...(decryptedData.settings || {}) },
      tombstones: decryptedData.tombstones || [],
    };

    if (handle) {
      await storeLinkedHandle(handle);
      normalizedData.settings.syncProvider = 'local-file';
      normalizedData.settings.localFileSync = {
        fileName: handle.name,
        autoSync: true,
        lastSyncedAt: now,
      };
    } else if (gistConfig) {
      normalizedData.settings.syncProvider = 'github-gist';
      normalizedData.settings.gistSync = {
        ...gistConfig,
        lastSyncedAt: now,
      };
    }

    await db.saveEncryptedVault(cleanPayload);

    this.cachedPayload = cleanPayload;
    this.masterKey = keyBytes;
    this.data = normalizedData;
    this.status = 'unlocked';
    this.startAutoLockTimer();
  }

  /**
   * Performs full two-way sync with GitHub Gist.
   */
  async syncWithGist(remotePassword?: string): Promise<GistSyncResult> {
    this.ensureUnlocked();
    const gistConfig = this.data!.settings.gistSync;
    if (!gistConfig?.token) {
      throw new Error('GitHub Personal Access Token is required for Gist sync.');
    }

    this.syncStatus = 'syncing';
    this.syncError = null;

    try {
      const result = await syncVaultWithGist(
        gistConfig.token,
        gistConfig.gistId,
        this.data!,
        this.masterKey!,
        this.cachedPayload!.kdf,
        remotePassword,
      );

      const now = Date.now();
      const updatedSettings: VaultSettings = {
        ...result.syncedVault.settings,
        syncProvider: 'github-gist',
        gistSync: {
          ...gistConfig,
          gistId: result.gistId,
          lastSyncedAt: now,
        },
      };

      const finalData: VaultData = {
        ...result.syncedVault,
        settings: updatedSettings,
        updatedAt: Math.max(result.syncedVault.updatedAt, now),
      };

      if (result.adoptedKey && result.adoptedKdf) {
        this.masterKey = result.adoptedKey;
        this.cachedPayload = {
          ...this.cachedPayload!,
          kdf: result.adoptedKdf,
        };
        await db.biometrics.clear();
        finalData.settings.biometricUnlockEnabled = false;
      }

      await this.persistData(finalData);
      this.syncStatus = 'synced';
      return result;
    } catch (err: unknown) {
      this.syncStatus = 'error';
      this.syncError = (err as Error).message || 'Failed to sync with GitHub Gist.';
      throw err;
    }
  }

  /**
   * Syncs and merges with a local .vault file handle.
   * If remotePassword is provided or required due to salt mismatch, derives the remote key,
   * merges vault data, and adopts the remote file's encryption credentials.
   */
  async syncWithLocalFile(
    handle: FileSystemFileHandle,
    remotePassword?: string,
  ): Promise<MergeResult> {
    this.ensureUnlocked();
    this.syncStatus = 'syncing';
    this.syncError = null;

    try {
      const remotePayload = await readVaultFromFileHandle(handle);

      const isSameSalt =
        this.cachedPayload?.kdf?.salt &&
        remotePayload.kdf?.salt &&
        this.cachedPayload.kdf.salt === remotePayload.kdf.salt;

      let remoteData: VaultData;
      let effectiveMasterKey: Uint8Array;
      let adoptedKdf: KeyDerivationParams;

      if (isSameSalt && !remotePassword) {
        try {
          remoteData = await decryptVault(remotePayload, this.masterKey!);
          effectiveMasterKey = this.masterKey!;
          adoptedKdf = this.cachedPayload!.kdf;
        } catch {
          throw new VaultSaltMismatchError(handle.name, handle);
        }
      } else {
        if (!remotePassword) {
          throw new VaultSaltMismatchError(handle.name, handle);
        }

        const { keyBytes } = await deriveMasterKey(remotePassword, remotePayload.kdf);
        remoteData = await decryptVault(remotePayload, keyBytes);
        effectiveMasterKey = keyBytes;
        adoptedKdf = remotePayload.kdf;
      }

      const mergeResult = mergeVaultData(this.data!, remoteData);

      const now = Date.now();
      const updatedSettings: VaultSettings = {
        ...mergeResult.merged.settings,
        syncProvider: 'local-file',
        localFileSync: {
          fileName: handle.name,
          autoSync: this.data!.settings.localFileSync?.autoSync ?? true,
          lastSyncedAt: now,
        },
      };

      const finalData: VaultData = {
        ...mergeResult.merged,
        settings: updatedSettings,
        updatedAt: Math.max(mergeResult.merged.updatedAt, now),
      };

      const keyOrSaltChanged =
        effectiveMasterKey !== this.masterKey || this.cachedPayload!.kdf.salt !== adoptedKdf.salt;

      if (keyOrSaltChanged) {
        this.masterKey = effectiveMasterKey;
        this.cachedPayload = {
          ...this.cachedPayload!,
          kdf: adoptedKdf,
        };
        await db.biometrics.clear();
        finalData.settings.biometricUnlockEnabled = false;
      }

      await storeLinkedHandle(handle);
      await this.persistData(finalData);

      if (this.cachedPayload) {
        await writeVaultToFileHandle(handle, this.cachedPayload);
      }

      this.syncStatus = 'synced';
      return mergeResult;
    } catch (err: unknown) {
      this.syncStatus = 'error';
      this.syncError = (err as Error).message || 'Failed to sync with local file.';
      throw err;
    }
  }

  /**
   * Directly exports current encrypted vault payload to a local file handle.
   */
  async saveToLocalFile(handle: FileSystemFileHandle): Promise<void> {
    this.ensureUnlocked();
    this.syncStatus = 'syncing';
    this.syncError = null;

    try {
      if (!this.cachedPayload) {
        this.cachedPayload = await encryptVault(
          this.data!,
          this.masterKey!,
          this.cachedPayload!.kdf,
        );
      }
      await storeLinkedHandle(handle);
      await writeVaultToFileHandle(handle, this.cachedPayload);

      const now = Date.now();
      await this.updateSettings({
        syncProvider: 'local-file',
        localFileSync: {
          fileName: handle.name,
          autoSync: this.data!.settings.localFileSync?.autoSync ?? true,
          lastSyncedAt: now,
        },
      });

      this.syncStatus = 'synced';
    } catch (err: unknown) {
      this.syncStatus = 'error';
      this.syncError = (err as Error).message || 'Failed to save to local file.';
      throw err;
    }
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
    await this.triggerAutoSync(payload, updatedData);
  }

  private async triggerAutoSync(payload: EncryptedVaultPayload, data: VaultData): Promise<void> {
    if (this.isAutoSyncing) return;
    this.isAutoSyncing = true;

    try {
      // 1. Local file auto-save if linked and autoSync is enabled
      if (data.settings.localFileSync?.autoSync) {
        const handle = await getLinkedHandle();
        if (handle) {
          try {
            await writeVaultToFileHandle(handle, payload);
            this.syncStatus = 'synced';
          } catch (err: unknown) {
            console.warn('Auto-save to local file failed:', err);
          }
        }
      }

      // 2. GitHub Gist auto-sync if configured and autoSync is enabled
      if (
        data.settings.gistSync?.autoSync &&
        data.settings.gistSync?.token &&
        data.settings.gistSync?.gistId
      ) {
        try {
          await updateGistPayload(
            data.settings.gistSync.token,
            data.settings.gistSync.gistId,
            payload,
          );
          this.syncStatus = 'synced';
        } catch (err: unknown) {
          console.warn('Auto-sync to GitHub Gist failed:', err);
        }
      }
    } finally {
      this.isAutoSyncing = false;
    }
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
