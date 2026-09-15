<script lang="ts">
  import { onMount } from 'svelte';
  import { Lock, KeyRound, Eye, EyeOff, Fingerprint, AlertCircle, Loader2 } from '@lucide/svelte';
  import { vault } from '$lib/stores';
  import {
    authenticateWithBiometrics,
    hasBiometricCredential,
    isBiometricsAvailable,
  } from '$lib/core/crypto';

  let password = $state('');
  let showPassword = $state(false);
  let errorMessage = $state('');
  let isUnlocking = $state(false);
  let canUseBiometrics = $state(false);

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
        value="vault2fa"
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
  </div>
</div>
