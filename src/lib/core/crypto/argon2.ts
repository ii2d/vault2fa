import { argon2id } from 'hash-wasm';
import type { KeyDerivationParams } from '$lib/types';
import { base64ToUint8Array, generateRandomBytes, uint8ArrayToBase64 } from './utils';

export const DEFAULT_ARGON2_PARAMS: Omit<KeyDerivationParams, 'salt'> & { saltLength: number } = {
  algorithm: 'Argon2id',
  iterations: 3,
  memoryKiB: 65536, // 64 MB
  parallelism: 1,
  saltLength: 16,
};

/**
 * Creates default or custom KeyDerivationParams with a fresh random salt.
 */
export function generateKdfParams(
  overrides?: Partial<Omit<KeyDerivationParams, 'algorithm'>>,
): KeyDerivationParams {
  const saltBytes = generateRandomBytes(DEFAULT_ARGON2_PARAMS.saltLength);
  return {
    algorithm: 'Argon2id',
    iterations: overrides?.iterations ?? DEFAULT_ARGON2_PARAMS.iterations,
    memoryKiB: overrides?.memoryKiB ?? DEFAULT_ARGON2_PARAMS.memoryKiB,
    parallelism: overrides?.parallelism ?? DEFAULT_ARGON2_PARAMS.parallelism,
    salt: uint8ArrayToBase64(saltBytes),
  };
}

/**
 * Derives a 256-bit cryptographic master key from a password and salt using Argon2id WebAssembly.
 */
export async function deriveMasterKey(
  password: string,
  params: KeyDerivationParams,
): Promise<{ keyBytes: Uint8Array; params: KeyDerivationParams }> {
  if (!password) {
    throw new Error('Master password cannot be empty');
  }

  const saltBytes = base64ToUint8Array(params.salt);
  if (saltBytes.length < 8) {
    throw new Error('Salt must be at least 8 bytes');
  }

  const keyBytes = await argon2id({
    password,
    salt: saltBytes,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    hashLength: 32, // 256-bit AES key
    outputType: 'binary',
  });

  return {
    keyBytes,
    params,
  };
}
