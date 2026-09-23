import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/core/storage';
import {
  authenticateWithBiometrics,
  hasBiometricCredential,
  isBiometricsAvailable,
  isPrfSupported,
  registerBiometricUnlock,
  removeBiometricUnlock,
} from './biometrics';
import { generateRandomBytes } from './utils';

describe('WebAuthn PRF Biometrics Unlock', () => {
  const mockMasterKey = new Uint8Array(32).fill(42);
  const mockPrfSecret = new Uint8Array(32).fill(99).buffer; // 32-byte ArrayBuffer

  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.biometrics.clear();

    // Mock PublicKeyCredential
    const mockPKC = {
      isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
      getClientCapabilities: vi.fn().mockResolvedValue({ prf: true }),
    };
    vi.stubGlobal('PublicKeyCredential', mockPKC);
  });

  it('detects biometric and PRF availability', async () => {
    expect(await isBiometricsAvailable()).toBe(true);
    expect(await isPrfSupported()).toBe(true);

    vi.stubGlobal('PublicKeyCredential', undefined);
    expect(await isBiometricsAvailable()).toBe(false);
    expect(await isPrfSupported()).toBe(false);
  });

  it('fails registration when PRF extension is not supported by authenticator', async () => {
    vi.stubGlobal('navigator', {
      credentials: {
        create: vi.fn().mockResolvedValue({
          rawId: new Uint8Array([1, 2, 3, 4]).buffer,
          getClientExtensionResults: () => ({
            prf: { enabled: false },
          }),
        }),
      },
    });

    await expect(registerBiometricUnlock(mockMasterKey)).rejects.toThrow(
      'Your platform authenticator does not support WebAuthn PRF encryption',
    );
  });

  it('registers and unwraps master key successfully with PRF evaluation on create', async () => {
    const rawCredId = generateRandomBytes(16);

    vi.stubGlobal('navigator', {
      credentials: {
        create: vi.fn().mockResolvedValue({
          rawId: rawCredId.buffer,
          getClientExtensionResults: () => ({
            prf: {
              enabled: true,
              results: {
                first: mockPrfSecret,
              },
            },
          }),
        }),
        get: vi.fn().mockResolvedValue({
          rawId: rawCredId.buffer,
          getClientExtensionResults: () => ({
            prf: {
              results: {
                first: mockPrfSecret,
              },
            },
          }),
        }),
      },
    });

    expect(await hasBiometricCredential()).toBe(false);

    const registered = await registerBiometricUnlock(mockMasterKey);
    expect(registered).toBe(true);
    expect(await hasBiometricCredential()).toBe(true);

    const record = await db.biometrics.get('primary');
    expect(record).toBeDefined();
    expect(record?.prfSalt).toBeDefined();
    expect(record?.wrappedKey).toBeDefined();

    // Authenticate and unwrap
    const unwrapped = await authenticateWithBiometrics();
    expect(unwrapped).not.toBeNull();
    expect(unwrapped).toEqual(mockMasterKey);
  });

  it('evaluates PRF via get assertion during registration if not evaluated on create', async () => {
    const rawCredId = generateRandomBytes(16);
    let getCallCount = 0;

    vi.stubGlobal('navigator', {
      credentials: {
        create: vi.fn().mockResolvedValue({
          rawId: rawCredId.buffer,
          getClientExtensionResults: () => ({
            prf: {
              enabled: true,
              // results undefined on create
            },
          }),
        }),
        get: vi.fn().mockImplementation(async () => {
          getCallCount++;
          return {
            rawId: rawCredId.buffer,
            getClientExtensionResults: () => ({
              prf: {
                results: {
                  first: mockPrfSecret,
                },
              },
            }),
          };
        }),
      },
    });

    const registered = await registerBiometricUnlock(mockMasterKey);
    expect(registered).toBe(true);
    expect(getCallCount).toBe(1); // evaluated during registration

    const unwrapped = await authenticateWithBiometrics();
    expect(getCallCount).toBe(2); // evaluated during unlock
    expect(unwrapped).toEqual(mockMasterKey);
  });

  it('rejects legacy records lacking prfSalt and prompts for re-enrollment', async () => {
    // Insert a legacy record with no prfSalt
    await db.biometrics.put({
      id: 'primary',
      credentialId: 'legacy-cred',
      wrappedKey: 'legacy-wrapped',
      iv: 'legacy-iv',
      salt: 'legacy-salt',
      createdAt: Date.now(),
    });

    expect(await hasBiometricCredential()).toBe(false);

    await expect(authenticateWithBiometrics()).rejects.toThrow(
      'Biometric unlock was upgraded for enhanced security',
    );
  });

  it('removes biometric credentials completely', async () => {
    await db.biometrics.put({
      id: 'primary',
      credentialId: 'test-cred',
      wrappedKey: 'wrapped',
      iv: 'iv',
      salt: 'salt',
      prfSalt: 'prfSalt',
      createdAt: Date.now(),
    });

    expect(await hasBiometricCredential()).toBe(true);
    await removeBiometricUnlock();
    expect(await hasBiometricCredential()).toBe(false);
  });
});
