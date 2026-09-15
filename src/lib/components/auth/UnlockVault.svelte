<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Lock,
    KeyRound,
    Eye,
    EyeOff,
    Fingerprint,
    AlertCircle,
    Loader2,
    Upload,
    RotateCcw,
    Trash2,
    X,
    Check,
  } from '@lucide/svelte';
  import { vault } from '$lib/stores';
  import {
    authenticateWithBiometrics,
    hasBiometricCredential,
    isBiometricsAvailable,
  } from '$lib/core/crypto';
  import {
    detectBackupFormat,
    parseEncryptedBackup,
    parseUnencryptedBackup,
    type BackupFormat,
  } from '$lib/core/backup';
  import { isPlainTextOtpList } from '$lib/core/totp';
  import type { EncryptedVaultPayload, VaultData } from '$lib/types';
  import { APP_CONFIG } from '$lib/config';

  let password = $state('');
  let showPassword = $state(false);
  let errorMessage = $state('');
  let isUnlocking = $state(false);
  let canUseBiometrics = $state(false);

  // Recovery / Restore Modal State
  let showRecoveryModal = $state(false);
  let fileInputEl = $state<HTMLInputElement | null>(null);
  let selectedFileName = $state('');
  let detectedFormat = $state<BackupFormat | null>(null);
  let encryptedPayload = $state.raw<EncryptedVaultPayload | null>(null);
  let unencryptedVaultData = $state.raw<VaultData | null>(null);
  let restorePassword = $state('');
  let restoreConfirmPassword = $state('');
  let showRestorePassword = $state(false);
  let restoreErrorMessage = $state('');
  let isRestoring = $state(false);
  let showResetConfirm = $state(false);
  let isResetting = $state(false);

  onMount(async () => {
    try {
      const available = await isBiometricsAvailable();
      const hasCred = await hasBiometricCredential();
      canUseBiometrics = available && hasCred;
    } catch {
      canUseBiometrics = false;
    }
  });

  async function handleUnlock(e?: SubmitEvent) {
    if (e) e.preventDefault();
    if (!password) return;

    errorMessage = '';
    isUnlocking = true;

    try {
      await vault.unlockVault(password);
    } catch {
      errorMessage = 'Incorrect master password. Please try again.';
    } finally {
      isUnlocking = false;
    }
  }

  async function handleBiometricUnlock() {
    errorMessage = '';
    isUnlocking = true;

    try {
      const masterKey = await authenticateWithBiometrics();
      if (!masterKey) {
        errorMessage = 'Biometric authentication was cancelled or failed.';
        return;
      }
      await vault.unlockWithMasterKey(masterKey);
    } catch (err: unknown) {
      errorMessage = (err as Error).message || 'Biometric authentication failed.';
    } finally {
      isUnlocking = false;
    }
  }

  async function handleFileSelected(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    restoreErrorMessage = '';
    selectedFileName = file.name;
    restorePassword = '';
    restoreConfirmPassword = '';

    try {
      const content = await file.text();
      let format = detectBackupFormat(content);

      if (format === 'unknown' && file.name.toLowerCase().endsWith('.txt')) {
        if (isPlainTextOtpList(content)) {
          format = 'plain-text-uris';
        }
      }

      detectedFormat = format;

      if (format === 'vault2fa-encrypted') {
        encryptedPayload = parseEncryptedBackup(content);
        unencryptedVaultData = null;
      } else if (
        format === 'aegis' ||
        format === 'vault2fa-decrypted' ||
        format === 'plain-text-uris'
      ) {
        const parsed = parseUnencryptedBackup(content);
        if (parsed.entries.length === 0) {
          throw new Error('No valid OTP accounts were found in this file.');
        }
        unencryptedVaultData = {
          version: 1,
          updatedAt: Date.now(),
          entries: parsed.entries,
          groups: parsed.groups,
          settings: {
            autoLockTimeoutMinutes: 5,
            biometricUnlockEnabled: false,
            syncProvider: 'none',
            theme: 'dark',
          },
        };
        encryptedPayload = null;
      } else {
        throw new Error(
          'Unrecognized backup format. Please select a valid vault2fa, Aegis, or .txt backup file.',
        );
      }
    } catch (err: unknown) {
      resetFileSelection();
      restoreErrorMessage = (err as Error).message || 'Failed to read backup file.';
    } finally {
      if (fileInputEl) fileInputEl.value = '';
    }
  }

  function resetFileSelection() {
    selectedFileName = '';
    detectedFormat = null;
    encryptedPayload = null;
    unencryptedVaultData = null;
    restorePassword = '';
    restoreConfirmPassword = '';
    restoreErrorMessage = '';
  }

  async function handleRestoreFromBackup(e: SubmitEvent) {
    e.preventDefault();
    restoreErrorMessage = '';

    if (!detectedFormat) return;

    if (detectedFormat === 'vault2fa-encrypted') {
      if (!encryptedPayload || !restorePassword) {
        restoreErrorMessage = 'Please enter the backup master password.';
        return;
      }

      isRestoring = true;
      try {
        await vault.restoreAndUnlockFromPayload(encryptedPayload, restorePassword);
        showRecoveryModal = false;
      } catch (err: unknown) {
        console.error('Failed to restore vault from lock screen:', err);
        if ((err as Error)?.name === 'DecryptionError') {
          restoreErrorMessage =
            'Incorrect backup password. Please check your password and try again.';
        } else {
          restoreErrorMessage =
            (err as Error)?.message ||
            'Decryption failed. Incorrect backup password or corrupted file.';
        }
      } finally {
        isRestoring = false;
      }
    } else {
      if (restorePassword.length < 8) {
        restoreErrorMessage = 'New master password must be at least 8 characters long.';
        return;
      }

      if (restorePassword !== restoreConfirmPassword) {
        restoreErrorMessage = 'Passwords do not match.';
        return;
      }

      if (!unencryptedVaultData) {
        restoreErrorMessage = 'No valid vault data to restore.';
        return;
      }

      isRestoring = true;
      try {
        await vault.initVaultWithData(unencryptedVaultData, restorePassword);
        showRecoveryModal = false;
      } catch (err: unknown) {
        restoreErrorMessage = (err as Error).message || 'Failed to restore vault.';
      } finally {
        isRestoring = false;
      }
    }
  }

  async function handleResetVault() {
    isResetting = true;
    try {
      await vault.resetAll();
      showRecoveryModal = false;
      showResetConfirm = false;
    } catch (err: unknown) {
      restoreErrorMessage = (err as Error).message || 'Failed to reset vault.';
    } finally {
      isResetting = false;
    }
  }
</script>

<div class="flex min-h-screen items-center justify-center p-4">
  <div
    class="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/90 p-8 shadow-2xl backdrop-blur-xl"
  >
    <!-- Header -->
    <div class="mb-8 text-center">
      <div
        class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-500/30"
      >
        <Lock class="h-7 w-7 text-white" />
      </div>
      <h1 class="text-2xl font-bold tracking-tight text-white">Vault Locked</h1>
      <p class="mt-2 text-sm text-zinc-400">
        Enter your master password to decrypt your 2FA accounts.
      </p>
    </div>

    <!-- Error Banner -->
    {#if errorMessage}
      <div
        class="mb-6 flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-300"
      >
        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
        <span>{errorMessage}</span>
      </div>
    {/if}

    <!-- Unlock Form (Semantic Password Manager Autofill) -->
    <form onsubmit={handleUnlock} class="space-y-5">
      <!-- Hidden username for macOS Keychain / Chrome Password Manager indexing -->
      <input
        type="text"
        name="username"
        value={APP_CONFIG.name}
        autocomplete="username"
        tabindex="-1"
        aria-hidden="true"
        class="sr-only"
        readonly
      />

      <!-- Password Input -->
      <div>
        <label
          for="unlock-password"
          class="mb-2 block text-xs font-semibold tracking-wider text-zinc-400 uppercase"
        >
          Master Password
        </label>
        <div class="relative">
          <input
            id="unlock-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            bind:value={password}
            required
            autocomplete="current-password"
            placeholder="Enter master password..."
            class="w-full rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 pr-11 pl-11 text-sm text-white placeholder-zinc-500 transition outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          <KeyRound class="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-zinc-400" />
          <button
            type="button"
            onclick={() => (showPassword = !showPassword)}
            class="absolute top-3.5 right-3.5 text-zinc-400 transition hover:text-zinc-200"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {#if showPassword}
              <EyeOff class="h-4 w-4" />
            {:else}
              <Eye class="h-4 w-4" />
            {/if}
          </button>
        </div>
      </div>

      <!-- Submit Button -->
      <button
        type="submit"
        disabled={isUnlocking}
        class="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500 focus:ring-2 focus:ring-indigo-500/40 focus:outline-none disabled:opacity-50"
      >
        {#if isUnlocking}
          <Loader2 class="h-4 w-4 animate-spin" />
          <span>Decrypting Vault...</span>
        {:else}
          <span>Unlock Vault</span>
        {/if}
      </button>

      <!-- Biometric Option (if enabled on device) -->
      {#if canUseBiometrics}
        <div class="relative my-4 flex items-center justify-center">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-white/10"></div>
          </div>
          <span class="relative bg-zinc-900 px-3 text-xs text-zinc-500">or</span>
        </div>

        <button
          type="button"
          onclick={handleBiometricUnlock}
          disabled={isUnlocking}
          class="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-zinc-800/60 py-3 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800 hover:text-white"
        >
          <Fingerprint class="h-4 w-4 text-indigo-400" />
          <span>Unlock with Biometrics</span>
        </button>
      {/if}
    </form>

    <!-- Recovery / Reset Link -->
    <div class="mt-6 border-t border-white/10 pt-4 text-center">
      <button
        type="button"
        onclick={() => {
          showRecoveryModal = true;
          resetFileSelection();
        }}
        class="text-xs text-zinc-400 transition hover:text-indigo-400"
      >
        Forgot password or have a backup file?
      </button>
    </div>
  </div>
</div>

<!-- Restore & Recovery Modal -->
{#if showRecoveryModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
    role="dialog"
    aria-modal="true"
    aria-labelledby="recovery-modal-title"
  >
    <div class="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
      <div class="flex items-center justify-between border-b border-white/10 pb-4">
        <div class="flex items-center gap-3">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400"
          >
            <Upload class="h-5 w-5" />
          </div>
          <div>
            <h3 id="recovery-modal-title" class="text-sm font-bold text-white">Vault Recovery</h3>
            <p class="text-[11px] text-zinc-400">Restore from backup or reset vault</p>
          </div>
        </div>

        <button
          type="button"
          onclick={() => (showRecoveryModal = false)}
          class="rounded-xl p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          aria-label="Close"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <div class="mt-5 space-y-4">
        {#if restoreErrorMessage}
          <div
            class="flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300"
          >
            <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <span>{restoreErrorMessage}</span>
          </div>
        {/if}

        <input
          bind:this={fileInputEl}
          type="file"
          accept=".json,.txt"
          onchange={handleFileSelected}
          class="hidden"
        />

        {#if !detectedFormat}
          <div>
            <button
              type="button"
              onclick={() => fileInputEl?.click()}
              class="group flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-700 bg-zinc-950/40 p-6 text-center transition hover:border-indigo-500 hover:bg-zinc-950/80"
            >
              <Upload class="h-6 w-6 text-zinc-400 group-hover:text-indigo-400" />
              <h4 class="mt-2 text-xs font-semibold text-zinc-200 group-hover:text-white">
                Select Backup File (.json / .txt)
              </h4>
              <p class="mt-0.5 text-[11px] text-zinc-400">
                Restore accounts with your backup's master password
              </p>
            </button>
          </div>

          <!-- Reset Vault Danger Zone -->
          <div class="border-t border-white/10 pt-4">
            {#if showResetConfirm}
              <div class="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5">
                <h4 class="text-xs font-bold text-rose-300">Are you sure you want to reset?</h4>
                <p class="mt-1 text-[11px] text-zinc-300">
                  This will erase current local vault data and return to setup. Only do this if you
                  cannot remember your password and have no backup.
                </p>
                <div class="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onclick={() => (showResetConfirm = false)}
                    class="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onclick={handleResetVault}
                    disabled={isResetting}
                    class="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                  >
                    {#if isResetting}
                      <Loader2 class="h-3 w-3 animate-spin" />
                    {:else}
                      <Trash2 class="h-3 w-3" />
                    {/if}
                    <span>Confirm Reset</span>
                  </button>
                </div>
              </div>
            {:else}
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="text-xs font-medium text-zinc-300">Reset Local Vault</h4>
                  <p class="text-[11px] text-zinc-500">Wipe local data and start fresh</p>
                </div>
                <button
                  type="button"
                  onclick={() => (showResetConfirm = true)}
                  class="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 transition hover:bg-rose-500/20"
                >
                  Reset
                </button>
              </div>
            {/if}
          </div>
        {:else}
          <!-- File Chosen -> Enter password -->
          <form onsubmit={handleRestoreFromBackup} class="space-y-4">
            <div
              class="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-950/80 p-3"
            >
              <div class="truncate">
                <p class="truncate text-xs font-semibold text-zinc-200">{selectedFileName}</p>
                <p class="text-[10px] text-zinc-400">
                  {detectedFormat === 'vault2fa-encrypted'
                    ? `Encrypted ${APP_CONFIG.name} backup`
                    : 'Unencrypted backup'}
                </p>
              </div>

              <button
                type="button"
                onclick={resetFileSelection}
                class="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
                title="Change file"
              >
                <RotateCcw class="h-3.5 w-3.5" />
              </button>
            </div>

            {#if detectedFormat === 'vault2fa-encrypted'}
              <div>
                <label
                  for="unlock-restore-password"
                  class="mb-1.5 block text-xs font-semibold text-zinc-300"
                >
                  Backup Master Password
                </label>
                <div class="relative">
                  <input
                    id="unlock-restore-password"
                    type={showRestorePassword ? 'text' : 'password'}
                    bind:value={restorePassword}
                    required
                    placeholder="Enter backup password..."
                    class="w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2.5 pr-10 text-xs text-white placeholder-zinc-500 outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onclick={() => (showRestorePassword = !showRestorePassword)}
                    class="absolute top-2.5 right-3 text-zinc-400 transition hover:text-zinc-200"
                    aria-label={showRestorePassword ? 'Hide password' : 'Show password'}
                  >
                    {#if showRestorePassword}
                      <EyeOff class="h-4 w-4" />
                    {:else}
                      <Eye class="h-4 w-4" />
                    {/if}
                  </button>
                </div>
              </div>
            {:else}
              <div class="space-y-3">
                <div>
                  <label
                    for="unlock-restore-new-password"
                    class="mb-1.5 block text-xs font-semibold text-zinc-300"
                  >
                    Choose New Master Password
                  </label>
                  <input
                    id="unlock-restore-new-password"
                    type="password"
                    bind:value={restorePassword}
                    required
                    placeholder="At least 8 characters..."
                    class="w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label
                    for="unlock-restore-confirm-password"
                    class="mb-1.5 block text-xs font-semibold text-zinc-300"
                  >
                    Confirm Master Password
                  </label>
                  <input
                    id="unlock-restore-confirm-password"
                    type="password"
                    bind:value={restoreConfirmPassword}
                    required
                    placeholder="Re-enter password..."
                    class="w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            {/if}

            <div class="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onclick={resetFileSelection}
                class="rounded-xl border border-white/10 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Back
              </button>

              <button
                type="submit"
                disabled={isRestoring || !restorePassword}
                class="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-indigo-500 disabled:opacity-50"
              >
                {#if isRestoring}
                  <Loader2 class="h-3.5 w-3.5 animate-spin" />
                  <span>Restoring...</span>
                {:else}
                  <Check class="h-3.5 w-3.5" />
                  <span>Restore & Unlock</span>
                {/if}
              </button>
            </div>
          </form>
        {/if}
      </div>
    </div>
  </div>
{/if}
