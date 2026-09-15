<script lang="ts">
  import { Shield, KeyRound, Check, AlertCircle, Loader2 } from '@lucide/svelte';
  import { vault } from '$lib/stores';

  let password = $state('');
  let confirmPassword = $state('');
  let errorMessage = $state('');
  let isInitializing = $state(false);

  // Simple password entropy score: 0 to 4
  const passwordStrength = $derived.by(() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 14) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
    return score;
  });

  const strengthLabel = $derived.by(() => {
    switch (passwordStrength) {
      case 0:
      case 1:
        return { text: 'Weak', color: 'bg-rose-500', textColor: 'text-rose-400' };
      case 2:
        return { text: 'Fair', color: 'bg-amber-500', textColor: 'text-amber-400' };
      case 3:
        return { text: 'Good', color: 'bg-blue-500', textColor: 'text-blue-400' };
      case 4:
      default:
        return { text: 'Strong', color: 'bg-emerald-500', textColor: 'text-emerald-400' };
    }
  });

  async function handleSetup(e: SubmitEvent) {
    e.preventDefault();
    errorMessage = '';

    if (password.length < 8) {
      errorMessage = 'Master password must be at least 8 characters long.';
      return;
    }

    if (password !== confirmPassword) {
      errorMessage = 'Passwords do not match.';
      return;
    }

    try {
      isInitializing = true;
      await vault.initVault(password);
    } catch (err: unknown) {
      errorMessage = (err as Error).message || 'Failed to initialize vault.';
    } finally {
      isInitializing = false;
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
        class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-indigo-500/30"
      >
        <Shield class="h-7 w-7 text-white" />
      </div>
      <h1 class="text-2xl font-bold tracking-tight text-white">Initialize Your Vault</h1>
      <p class="mt-2 text-sm text-zinc-400">
        Choose a master password to encrypt your 2FA accounts locally with Argon2id and AES-256-GCM.
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

    <!-- Form with Semantic Password Manager Markup -->
    <form onsubmit={handleSetup} class="space-y-5">
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

      <!-- Master Password Input -->
      <div>
        <label
          for="master-password"
          class="mb-2 block text-xs font-semibold tracking-wider text-zinc-400 uppercase"
        >
          Master Password
        </label>
        <div class="relative">
          <input
            id="master-password"
            name="password"
            type="password"
            bind:value={password}
            required
            autocomplete="new-password"
            placeholder="At least 8 characters..."
            class="w-full rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 pl-11 text-sm text-white placeholder-zinc-500 transition outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          <KeyRound class="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-zinc-400" />
        </div>

        <!-- Strength Meter -->
        {#if password.length > 0}
          <div class="mt-3">
            <div class="flex items-center justify-between text-xs">
              <span class="text-zinc-400">Password Strength:</span>
              <span class="font-medium {strengthLabel.textColor}">{strengthLabel.text}</span>
            </div>
            <div class="mt-1.5 flex h-1.5 gap-1.5">
              {#each [1, 2, 3, 4] as level (level)}
                <div
                  class="h-full flex-1 rounded-full transition-colors duration-300 {passwordStrength >=
                  level
                    ? strengthLabel.color
                    : 'bg-zinc-800'}"
                ></div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Confirm Password Input -->
      <div>
        <label
          for="confirm-password"
          class="mb-2 block text-xs font-semibold tracking-wider text-zinc-400 uppercase"
        >
          Confirm Master Password
        </label>
        <div class="relative">
          <input
            id="confirm-password"
            name="confirm-password"
            type="password"
            bind:value={confirmPassword}
            required
            autocomplete="new-password"
            placeholder="Re-enter your master password..."
            class="w-full rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 pl-11 text-sm text-white placeholder-zinc-500 transition outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          <Check class="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-zinc-400" />
        </div>
      </div>

      <!-- Zero-Knowledge Notice -->
      <div
        class="rounded-xl border border-white/5 bg-zinc-950/40 p-3.5 text-xs leading-relaxed text-zinc-400"
      >
        🔒 <strong class="text-zinc-300">Zero-Knowledge Guarantee:</strong> Your password never touches
        any server. If you forget it, your encrypted accounts cannot be recovered.
      </div>

      <!-- Submit Button -->
      <button
        type="submit"
        disabled={isInitializing}
        class="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-blue-500 hover:to-indigo-500 focus:ring-2 focus:ring-indigo-500/40 focus:outline-none disabled:opacity-50"
      >
        {#if isInitializing}
          <Loader2 class="h-4 w-4 animate-spin" />
          <span>Deriving Master Key (Argon2id)...</span>
        {:else}
          <span>Create Secure Vault</span>
        {/if}
      </button>
    </form>
  </div>
</div>
