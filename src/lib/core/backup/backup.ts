/**
 * Native Vault Backup & Restore Utilities
 * Manages encrypted and unencrypted backups, format detection, and browser downloads.
 */

import type { EncryptedVaultPayload, VaultData } from '$lib/types';
import { isAegisJson, parseAegisJson } from './aegis';

export type BackupFormat = 'vault2fa-encrypted' | 'vault2fa-decrypted' | 'aegis' | 'unknown';

/**
 * Triggers a browser file download with the specified text content.
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'application/json',
): void {
  if (typeof window === 'undefined') return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates an encrypted backup JSON string ready for download.
 */
export function exportEncryptedBackup(payload: EncryptedVaultPayload): string {
  const backupObject = {
    exportedAt: new Date().toISOString(),
    generator: 'vault2fa',
    ...payload,
  };
  return JSON.stringify(backupObject, null, 2);
}

/**
 * Generates an unencrypted backup JSON string.
 */
export function exportDecryptedBackup(vault: VaultData): string {
  const backupObject = {
    exportedAt: new Date().toISOString(),
    generator: 'vault2fa',
    warning: 'UNENCRYPTED BACKUP - STORE SECURELY',
    vault,
  };
  return JSON.stringify(backupObject, null, 2);
}

/**
 * Detects the format of a backup file string.
 */
export function detectBackupFormat(content: string): BackupFormat {
  try {
    const data = JSON.parse(content);
    if (!data || typeof data !== 'object') return 'unknown';

    if (data.format === 'vault2fa-v1' && typeof data.ciphertext === 'string') {
      return 'vault2fa-encrypted';
    }

    if (data.vault?.entries && Array.isArray(data.vault.entries)) {
      return 'vault2fa-decrypted';
    }

    if (Array.isArray(data.entries) && Array.isArray(data.groups)) {
      return 'vault2fa-decrypted';
    }

    if (isAegisJson(content)) {
      return 'aegis';
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Parses unencrypted backup content (either native vault2fa or Aegis).
 */
export function parseUnencryptedBackup(content: string) {
  const format = detectBackupFormat(content);

  if (format === 'aegis') {
    return parseAegisJson(content);
  }

  if (format === 'vault2fa-decrypted') {
    const data = JSON.parse(content);
    const vault: VaultData = data.vault || data;
    return {
      entries: vault.entries || [],
      groups: vault.groups || [],
    };
  }

  throw new Error('Unsupported unencrypted backup format.');
}
