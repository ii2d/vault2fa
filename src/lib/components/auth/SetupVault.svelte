<script lang="ts">
  import {
    Shield,
    KeyRound,
    Check,
    AlertCircle,
    Loader2,
    Upload,
    FileText,
    FileCode,
    Lock,
    Eye,
    EyeOff,
    RotateCcw,
    Download,
    BookOpen,
    ShieldCheck,
    FolderSync,
    Cloud,
    ClipboardPaste,
  } from '@lucide/svelte';
  import { vault, pwaInstall } from '$lib/stores';
  import {
    detectBackupFormat,
    parseEncryptedBackup,
    parseUnencryptedBackup,
    type BackupFormat,
  } from '$lib/core/backup';
  import {
    isFileSystemAccessSupported,
    pickLocalVaultFile,
    readVaultFromFileHandle,
    fetchGistPayload,
    parseSyncConfigQr,
  } from '$lib/core/sync';
  import { isPlainTextOtpList } from '$lib/core/totp';
  import type { EncryptedVaultPayload, VaultData, GistSyncConfig } from '$lib/types';
  import { APP_CONFIG } from '$lib/config';
  import InstallGuideModal from '$lib/components/modals/InstallGuideModal.svelte';
  import PrivacyModal from '$lib/components/modals/PrivacyModal.svelte';
  import UserGuideModal from '$lib/components/modals/UserGuideModal.svelte';

  let activeTab = $state<'create' | 'restore'>('create');
  let isInstallGuideOpen = $state(false);
  let isPrivacyModalOpen = $state(false);
  let isUserGuideOpen = $state(false);

  // Create Flow State
  let password = $state('');
  let confirmPassword = $state('');
  let createErrorMessage = $state('');
  let isInitializing = $state(false);

  // Restore Flow State
  let fileInputEl = $state<HTMLInputElement | null>(null);
  let selectedFileHandle = $state<FileSystemFileHandle | null>(null);
  let selectedGistConfig = $state<GistSyncConfig | null>(null);
  let selectedFileName = $state('');
  let detectedFormat = $state<BackupFormat | null>(null);
  let encryptedPayload = $state.raw<EncryptedVaultPayload | null>(null);
  let unencryptedVaultData = $state.raw<VaultData | null>(null);

  let showGistRestoreForm = $state(false);
  let gistRestoreToken = $state('');
  let gistRestoreId = $state('');
  let isFetchingGist = $state(false);

  let restorePassword = $state('');
  let restoreConfirmPassword = $state('');
  let showRestorePassword = $state(false);
  let restoreErrorMessage = $state('');
  let isRestoring = $state(false);

  // Password entropy score for new vault passwords: 0 to 4
  const passwordStrength = $derived.by(() => {
    const pw = activeTab === 'create' ? password : restorePassword;
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 14) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
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
    createErrorMessage = '';

    if (password.length < 8) {
      createErrorMessage = 'Master password must be at least 8 characters long.';
      return;
    }

    if (password !== confirmPassword) {
      createErrorMessage = 'Passwords do not match.';
      return;
    }

    try {
      isInitializing = true;
      await vault.initVault(password);
    } catch (err: unknown) {
      createErrorMessage = (err as Error).message || 'Failed to initialize vault.';
    } finally {
      isInitializing = false;
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

  async function handlePickVaultFileHandle() {
    restoreErrorMessage = '';
    try {
      const picked = await pickLocalVaultFile();
      if (!picked) return;
      selectedFileHandle = picked.handle;
      selectedFileName = picked.fileName;
      restorePassword = '';
      restoreConfirmPassword = '';

      const payload = await readVaultFromFileHandle(picked.handle);
      detectedFormat = 'vault2fa-encrypted';
      encryptedPayload = payload;
      unencryptedVaultData = null;
    } catch (err: unknown) {
      resetFileSelection();
      restoreErrorMessage = (err as Error).message || 'Failed to read vault file.';
    }
  }

  async function handleFetchGist(e: SubmitEvent) {
    e.preventDefault();
    if (!gistRestoreToken.trim() || !gistRestoreId.trim()) return;

    restoreErrorMessage = '';
    isFetchingGist = true;

    try {
      const payload = await fetchGistPayload(gistRestoreToken.trim(), gistRestoreId.trim());
      detectedFormat = 'vault2fa-encrypted';
      encryptedPayload = payload;
      selectedFileHandle = null;
      selectedFileName = `GitHub Gist (${gistRestoreId.trim().slice(0, 8)}...)`;
      selectedGistConfig = {
        token: gistRestoreToken.trim(),
        gistId: gistRestoreId.trim(),
        autoSync: true,
      };
      showGistRestoreForm = false;
    } catch (err: unknown) {
      restoreErrorMessage = (err as Error).message || 'Failed to fetch GitHub Gist.';
    } finally {
      isFetchingGist = false;
    }
  }

  function applyGistConfigUri(raw: string): boolean {
    const config = parseSyncConfigQr(raw);
    if (config) {
      gistRestoreToken = config.token;
      if (config.gistId) {
        gistRestoreId = config.gistId;
      }
      restoreErrorMessage = '';
      return true;
    }
    return false;
  }

  function handleGistRestoreTokenInput(e: Event) {
    const val = (e.target as HTMLInputElement).value.trim();
    if (val.startsWith('v2fa-sync://gist')) {
      applyGistConfigUri(val);
    }
  }

  async function handlePasteGistUri() {
    try {
      const text = await navigator.clipboard.readText();
      if (text && applyGistConfigUri(text.trim())) {
        restoreErrorMessage = '';
      } else {
        restoreErrorMessage = 'Clipboard does not contain a valid v2fa-sync:// pairing URI.';
      }
    } catch {
      restoreErrorMessage =
        'Unable to access clipboard. Please paste the URI directly into the token field.';
    }
  }

  function resetFileSelection() {
    selectedFileHandle = null;
    selectedGistConfig = null;
    selectedFileName = '';
    detectedFormat = null;
    encryptedPayload = null;
    unencryptedVaultData = null;

    restorePassword = '';
    restoreConfirmPassword = '';
    restoreErrorMessage = '';
  }

  async function handleRestore(e: SubmitEvent) {
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
        await vault.restoreAndUnlockFromPayload(
          encryptedPayload,
          restorePassword,
          selectedFileHandle || undefined,
          selectedGistConfig || undefined,
        );
      } catch (err: unknown) {
        console.error('Failed to restore encrypted vault:', err);
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
      // Unencrypted backup: requires creating a new master password
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
      } catch (err: unknown) {
        restoreErrorMessage = (err as Error).message || 'Failed to create vault from backup.';
      } finally {
        isRestoring = false;
      }
    }
  }
</script>

<div class="flex min-h-screen flex-col items-center justify-center p-4">
  <div
    class="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/90 p-8 shadow-2xl backdrop-blur-xl"
  >
    <!-- Header -->
    <div class="mb-6 text-center">
      <div
        class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-indigo-500/30"
      >
        <Shield class="h-7 w-7 text-white" />
      </div>
      <h1 class="text-2xl font-bold tracking-tight text-white">
        {activeTab === 'create' ? 'Initialize Your Vault' : 'Restore from Backup'}
      </h1>
      <p class="mt-2 text-xs text-zinc-400">
        {activeTab === 'create'
          ? 'Choose a master password to encrypt your 2FA accounts locally with Argon2id and AES-256-GCM.'
          : 'Restore all accounts and settings from an encrypted or unencrypted backup file.'}
      </p>
    </div>

    <!-- Tab Toggle -->
    <div class="mb-6 flex rounded-xl border border-white/10 bg-zinc-950/60 p-1">
      <button
        type="button"
        onclick={() => {
          activeTab = 'create';
          createErrorMessage = '';
        }}
        class="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition {activeTab ===
        'create'
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-zinc-400 hover:text-white'}"
      >
        <KeyRound class="h-3.5 w-3.5" />
        <span>Create New</span>
      </button>

      <button
        type="button"
        onclick={() => {
          activeTab = 'restore';
          restoreErrorMessage = '';
        }}
        class="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition {activeTab ===
        'restore'
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'text-zinc-400 hover:text-white'}"
      >
        <Upload class="h-3.5 w-3.5" />
        <span>Restore Backup</span>
      </button>
    </div>

    {#if activeTab === 'create'}
      <!-- Error Banner -->
      {#if createErrorMessage}
        <div
          class="mb-6 flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-300"
        >
          <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <span>{createErrorMessage}</span>
        </div>
      {/if}

      <!-- Form with Semantic Password Manager Markup -->
      <form onsubmit={handleSetup} class="space-y-5">
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
    {:else}
      <!-- RESTORE TAB -->
      {#if restoreErrorMessage}
        <div
          class="mb-5 flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs text-rose-300"
        >
          <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <span>{restoreErrorMessage}</span>
        </div>
      {/if}

      <input
        bind:this={fileInputEl}
        type="file"
        accept=".vault,.json,.txt"
        onchange={handleFileSelected}
        class="hidden"
      />

      {#if !detectedFormat}
        <!-- File Upload Area -->
        <div class="space-y-4">
          {#if isFileSystemAccessSupported()}
            <button
              type="button"
              onclick={handlePickVaultFileHandle}
              class="group flex w-full items-center gap-3.5 rounded-2xl border border-indigo-500/30 bg-indigo-950/30 p-4 text-left transition hover:border-indigo-500/60 hover:bg-indigo-950/50"
            >
              <div
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 transition group-hover:scale-105 group-hover:bg-indigo-600/30"
              >
                <FolderSync class="h-5 w-5" />
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="text-sm font-semibold text-white">Open & Link .vault File</h3>
                <p class="text-xs text-indigo-300/80">
                  Select an existing file for continuous two-way sync
                </p>
              </div>
            </button>
          {/if}

          <!-- GitHub Gist Option -->
          {#if !showGistRestoreForm}
            <button
              type="button"
              onclick={() => (showGistRestoreForm = true)}
              class="group flex w-full items-center gap-3.5 rounded-2xl border border-purple-500/30 bg-purple-950/30 p-4 text-left transition hover:border-purple-500/60 hover:bg-purple-950/50"
            >
              <div
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-600/20 text-purple-400 transition group-hover:scale-105 group-hover:bg-purple-600/30"
              >
                <Cloud class="h-5 w-5" />
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="text-sm font-semibold text-white">Connect to GitHub Gist</h3>
                <p class="text-xs text-purple-300/80">
                  Sync cloud vault using Personal Access Token & Gist ID
                </p>
              </div>
            </button>
          {:else}
            <form
              onsubmit={handleFetchGist}
              class="space-y-3 rounded-2xl border border-purple-500/30 bg-purple-950/20 p-4 text-left"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Cloud class="h-4 w-4 text-purple-400" />
                  <span class="text-xs font-bold text-white">Connect GitHub Gist</span>
                </div>
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    onclick={handlePasteGistUri}
                    class="inline-flex items-center gap-1 text-[11px] font-medium text-purple-400 transition hover:text-purple-300 hover:underline"
                    title="Paste copied v2fa-sync:// URI from clipboard"
                  >
                    <ClipboardPaste class="h-3 w-3" />
                    <span>Paste Config URI</span>
                  </button>
                  <button
                    type="button"
                    onclick={() => (showGistRestoreForm = false)}
                    class="text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <div>
                <label
                  for="gist-restore-token"
                  class="mb-1 block text-[11px] font-semibold tracking-wider text-zinc-300 uppercase"
                >
                  GitHub Token (PAT)
                </label>
                <input
                  id="gist-restore-token"
                  type="password"
                  bind:value={gistRestoreToken}
                  oninput={handleGistRestoreTokenInput}
                  required
                  placeholder="ghp_... or paste Config URI"
                  class="w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label
                  for="gist-restore-id"
                  class="mb-1 block text-[11px] font-semibold tracking-wider text-zinc-300 uppercase"
                >
                  Gist ID
                </label>
                <input
                  id="gist-restore-id"
                  type="text"
                  bind:value={gistRestoreId}
                  required
                  placeholder="e.g. 7f3b892a..."
                  class="w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-purple-500"
                />
              </div>

              <button
                type="submit"
                disabled={isFetchingGist || !gistRestoreToken || !gistRestoreId}
                class="flex w-full items-center justify-center gap-1.5 rounded-xl bg-purple-600 py-2.5 text-xs font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50"
              >
                {#if isFetchingGist}
                  <Loader2 class="h-3.5 w-3.5 animate-spin" />
                  <span>Fetching Gist...</span>
                {:else}
                  <Check class="h-3.5 w-3.5" />
                  <span>Fetch & Unlock Gist</span>
                {/if}
              </button>
            </form>
          {/if}

          <div class="relative flex items-center justify-center">
            <div class="w-full border-t border-white/10"></div>
            <span
              class="bg-zinc-900/90 px-3 text-[11px] font-medium tracking-wider text-zinc-500 uppercase"
              >or upload backup file</span
            >
            <div class="w-full border-t border-white/10"></div>
          </div>

          <button
            type="button"
            onclick={() => fileInputEl?.click()}
            class="group flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-700 bg-zinc-950/40 p-8 text-center transition hover:border-indigo-500 hover:bg-zinc-950/80"
          >
            <div
              class="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400 transition group-hover:scale-105 group-hover:bg-indigo-600/20 group-hover:text-indigo-400"
            >
              <Upload class="h-6 w-6" />
            </div>
            <h3 class="mt-3 text-sm font-semibold text-zinc-200 group-hover:text-white">
              Select Backup File
            </h3>
            <p class="mt-1 text-xs text-zinc-400">
              Supports <span class="font-mono text-zinc-300">.vault</span>,
              <span class="font-mono text-zinc-300">.json</span>
              ({APP_CONFIG.name} / Aegis) or <span class="font-mono text-zinc-300">.txt</span>
            </p>
          </button>

          <div
            class="rounded-xl border border-white/5 bg-zinc-950/40 p-3.5 text-xs leading-relaxed text-zinc-400"
          >
            💡 If your backup was encrypted, you will be prompted for the master password used when
            creating it.
          </div>
        </div>
      {:else}
        <!-- File Loaded / Password Form -->
        <form onsubmit={handleRestore} class="space-y-4">
          <!-- File info banner -->
          <div
            class="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-950/80 p-3"
          >
            <div class="flex items-center gap-2.5 overflow-hidden">
              <div
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400"
              >
                {#if detectedFormat === 'vault2fa-encrypted'}
                  <Lock class="h-4 w-4" />
                {:else if detectedFormat === 'aegis'}
                  <FileCode class="h-4 w-4" />
                {:else}
                  <FileText class="h-4 w-4" />
                {/if}
              </div>
              <div class="truncate">
                <div class="flex items-center gap-2">
                  <p class="truncate text-xs font-semibold text-zinc-200">{selectedFileName}</p>
                  {#if selectedFileHandle}
                    <span
                      class="inline-flex items-center rounded-md bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300"
                    >
                      Auto-sync
                    </span>
                  {:else if selectedGistConfig}
                    <span
                      class="inline-flex items-center rounded-md bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-300"
                    >
                      Gist Sync
                    </span>
                  {/if}
                </div>
                <p class="text-[10px] text-zinc-400">
                  {#if detectedFormat === 'vault2fa-encrypted'}
                    Encrypted {APP_CONFIG.name} backup
                  {:else if detectedFormat === 'aegis'}
                    Aegis Authenticator format ({unencryptedVaultData?.entries.length ?? 0} accounts)
                  {:else if detectedFormat === 'vault2fa-decrypted'}
                    Decrypted {APP_CONFIG.name} ({unencryptedVaultData?.entries.length ?? 0} accounts)
                  {:else}
                    Plain text URI list ({unencryptedVaultData?.entries.length ?? 0} accounts)
                  {/if}
                </p>
              </div>
            </div>

            <button
              type="button"
              onclick={resetFileSelection}
              class="flex shrink-0 items-center gap-1 rounded-lg p-1.5 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
              title="Change file"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </button>
          </div>

          {#if detectedFormat === 'vault2fa-encrypted'}
            <!-- Encrypted Backup: Enter existing password -->
            <div>
              <label
                for="restore-encrypted-password"
                class="mb-1.5 block text-xs font-semibold text-zinc-300"
              >
                Backup Master Password
              </label>
              <div class="relative">
                <input
                  id="restore-encrypted-password"
                  type={showRestorePassword ? 'text' : 'password'}
                  bind:value={restorePassword}
                  required
                  placeholder="Enter password used for this backup..."
                  autocomplete="current-password"
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
            <!-- Unencrypted Backup: Set new master password for the new vault -->
            <div class="space-y-3">
              <div>
                <label
                  for="restore-new-password"
                  class="mb-1.5 block text-xs font-semibold text-zinc-300"
                >
                  Choose New Master Password
                </label>
                <div class="relative">
                  <input
                    id="restore-new-password"
                    type="password"
                    bind:value={restorePassword}
                    required
                    autocomplete="new-password"
                    placeholder="At least 8 characters..."
                    class="w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label
                  for="restore-confirm-password"
                  class="mb-1.5 block text-xs font-semibold text-zinc-300"
                >
                  Confirm Master Password
                </label>
                <div class="relative">
                  <input
                    id="restore-confirm-password"
                    type="password"
                    bind:value={restoreConfirmPassword}
                    required
                    autocomplete="new-password"
                    placeholder="Re-enter password..."
                    class="w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          {/if}

          <!-- Submit Restore -->
          <button
            type="submit"
            disabled={isRestoring || !restorePassword}
            class="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50"
          >
            {#if isRestoring}
              <Loader2 class="h-4 w-4 animate-spin" />
              <span>Decrypting & Restoring (Argon2id)...</span>
            {:else}
              <Check class="h-4 w-4" />
              <span>
                {detectedFormat === 'vault2fa-encrypted'
                  ? 'Decrypt & Restore Vault'
                  : 'Create Vault from Backup'}
              </span>
            {/if}
          </button>
        </form>
      {/if}
    {/if}
  </div>

  <!-- Footer Navigation Links -->
  <div class="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-zinc-500">
    {#if !pwaInstall.isInstalled}
      <button
        type="button"
        onclick={() => (isInstallGuideOpen = true)}
        class="flex items-center gap-1 transition hover:text-zinc-300"
      >
        <Download class="h-3.5 w-3.5 text-indigo-400" />
        <span>Install App</span>
      </button>
      <span>•</span>
    {/if}

    <button
      type="button"
      onclick={() => (isPrivacyModalOpen = true)}
      class="flex items-center gap-1 transition hover:text-zinc-300"
    >
      <ShieldCheck class="h-3.5 w-3.5 text-emerald-400" />
      <span>Privacy Manifesto</span>
    </button>
    <span>•</span>

    <button
      type="button"
      onclick={() => (isUserGuideOpen = true)}
      class="flex items-center gap-1 transition hover:text-zinc-300"
    >
      <BookOpen class="h-3.5 w-3.5 text-indigo-400" />
      <span>User Guide</span>
    </button>
  </div>
</div>

<InstallGuideModal isOpen={isInstallGuideOpen} onClose={() => (isInstallGuideOpen = false)} />
<PrivacyModal isOpen={isPrivacyModalOpen} onClose={() => (isPrivacyModalOpen = false)} />
<UserGuideModal isOpen={isUserGuideOpen} onClose={() => (isUserGuideOpen = false)} />
