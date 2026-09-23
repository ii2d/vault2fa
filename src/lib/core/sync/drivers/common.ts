import { decryptVault, deriveMasterKey } from '$lib/core/crypto';
import type { MergeResult } from '$lib/core/sync/merge';
import type { EncryptedVaultPayload, KeyDerivationParams, VaultData } from '$lib/types';

export interface SyncDriverResult extends Omit<MergeResult, 'merged'> {
  syncedVault: VaultData;
  adoptedKey?: Uint8Array;
  adoptedKdf?: KeyDerivationParams;
}

export interface DecryptedRemoteResult {
  remoteData: VaultData;
  effectiveMasterKey: Uint8Array;
  effectiveKdf: KeyDerivationParams;
}

/**
 * Decrypts a remote encrypted vault payload, resolving salt and credential mismatches.
 * If credentials match local salt, uses local masterKey.
 * If salt mismatches, derives key using remotePassword and remotePayload.kdf.
 * If credentials mismatch and no remotePassword is provided, invokes onSaltMismatch to throw.
 */
export async function decryptRemotePayload(
  remotePayload: EncryptedVaultPayload,
  masterKey: Uint8Array,
  localKdf: KeyDerivationParams,
  remotePassword?: string,
  onSaltMismatch?: () => Error,
): Promise<DecryptedRemoteResult> {
  const isSameSalt =
    remotePayload.kdf?.salt && localKdf?.salt && remotePayload.kdf.salt === localKdf.salt;

  if (isSameSalt && !remotePassword) {
    try {
      const remoteData = await decryptVault(remotePayload, masterKey);
      return {
        remoteData,
        effectiveMasterKey: masterKey,
        effectiveKdf: localKdf,
      };
    } catch {
      if (onSaltMismatch) throw onSaltMismatch();
      throw new Error('Failed to decrypt remote vault with current key.');
    }
  }

  if (!remotePassword) {
    if (onSaltMismatch) throw onSaltMismatch();
    throw new Error('Password required to decrypt remote vault.');
  }

  const { keyBytes } = await deriveMasterKey(remotePassword, remotePayload.kdf);
  const remoteData = await decryptVault(remotePayload, keyBytes);
  return {
    remoteData,
    effectiveMasterKey: keyBytes,
    effectiveKdf: remotePayload.kdf,
  };
}
