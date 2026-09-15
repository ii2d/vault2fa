import Dexie, { type EntityTable } from 'dexie';
import type { EncryptedVaultPayload } from '$lib/types';

export interface EncryptedVaultRecord {
  id: string; // always 'primary'
  payload: EncryptedVaultPayload;
  updatedAt: number;
}

export interface AppMetadataRecord {
  key: string;
  value: unknown;
}

export interface BiometricRecord {
  id: string; // 'primary'
  credentialId: string;
  wrappedKey: string; // Base64 wrapped key
  iv: string; // Base64
  salt: string; // Base64
  createdAt: number;
}

export class VaultDatabase extends Dexie {
  vaults!: EntityTable<EncryptedVaultRecord, 'id'>;
  metadata!: EntityTable<AppMetadataRecord, 'key'>;
  biometrics!: EntityTable<BiometricRecord, 'id'>;

  constructor(dbName = 'vault2fa_db') {
    super(dbName);
    this.version(1).stores({
      vaults: 'id',
      metadata: 'key',
      biometrics: 'id, credentialId',
    });
  }

  /**
   * Persists an encrypted vault payload into IndexedDB.
   */
  async saveEncryptedVault(payload: EncryptedVaultPayload): Promise<void> {
    await this.vaults.put({
      id: 'primary',
      payload,
      updatedAt: Date.now(),
    });
  }

  /**
   * Retrieves the currently stored encrypted vault payload, or null if uninitialized.
   */
  async loadEncryptedVault(): Promise<EncryptedVaultPayload | null> {
    const record = await this.vaults.get('primary');
    return record?.payload ?? null;
  }

  /**
   * Checks whether an encrypted vault exists in IndexedDB.
   */
  async hasVault(): Promise<boolean> {
    const count = await this.vaults.count();
    return count > 0;
  }

  /**
   * Completely purges all vault data and credentials from local storage.
   */
  async purgeAll(): Promise<void> {
    await this.transaction('rw', [this.vaults, this.metadata, this.biometrics], async () => {
      await this.vaults.clear();
      await this.metadata.clear();
      await this.biometrics.clear();
    });
  }
}

export const db = new VaultDatabase();
