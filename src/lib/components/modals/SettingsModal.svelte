<script lang="ts">
  import { onMount } from 'svelte';
  import {
    X,
    Fingerprint,
    Lock,
    KeyRound,
    Download,
    Upload,
    Shield,
    AlertTriangle,
    Loader2,
    Info,
    FileCode,
    FileText,
    Cloud,
    HardDrive,
    QrCode,
    Check,
    Eye,
    EyeOff,
    ExternalLink,
    Unlink,
    RefreshCw,
    Camera,
  } from '@lucide/svelte';
  import { vault } from '$lib/stores';
  import {
    isBiometricsAvailable,
    hasBiometricCredential,
    registerBiometricUnlock,
    removeBiometricUnlock,
  } from '$lib/core/crypto/biometrics';
  import {
    downloadTextFile,
    exportEncryptedBackup,
    exportDecryptedBackup,
    exportToAegisJson,
    exportPlainTextBackup,
    detectBackupFormat,
    parseUnencryptedBackup,
  } from '$lib/core/backup';
  import { isPlainTextOtpList } from '$lib/core/totp';
  import { SyncConfigShareModal, SyncConfigScanModal } from '$lib/components/sync';
  import {
    isFileSystemAccessSupported,
    pickLocalVaultFile,
    createLocalVaultFile,
    getLinkedHandle,
    uncheckLinkedHandle,
    validateGitHubToken,
  } from '$lib/core/sync';
  import type { GistSyncConfig } from '$lib/types';

  let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();

  let activeTab = $state<'security' | 'sync' | 'backup' | 'about'>('security');

  // Biometrics State
  let biometricsSupported = $state(false);
  let biometricsEnrolled = $state(false);
  let isTogglingBiometrics = $state(false);
  let biometricsMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password Change State
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let isChangingPassword = $state(false);
  let passwordMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  // Backup Import State
  let fileInputEl = $state<HTMLInputElement | null>(null);
  let isImporting = $state(false);
  let backupMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);
  let showDecryptedWarning = $state(false);

  // Sync State
  let localFileSupported = $state(false);
  let localHandle = $state<FileSystemFileHandle | null>(null);
  let localFileMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);
  let isProcessingLocalFile = $state(false);

  let gistToken = $state('');
  let gistId = $state('');
  let showGistToken = $state(false);
  let isValidatingToken = $state(false);
  let isSyncingGist = $state(false);
  let gistMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  let isShareConfigOpen = $state(false);
  let isScanConfigOpen = $state(false);

  // Check biometrics and sync status when modal opens
  async function checkBiometrics() {
    biometricsSupported = await isBiometricsAvailable();
    biometricsEnrolled = await hasBiometricCredential();
  }

  async function checkSyncStatus() {
    localFileSupported = isFileSystemAccessSupported();
    if (localFileSupported) {
      localHandle = await getLinkedHandle();
    }
    const gist = vault.data?.settings.gistSync;
    if (gist) {
      gistToken = gist.token || '';
      gistId = gist.gistId || '';
    }
  }

  $effect(() => {
    if (isOpen) {
      checkBiometrics();
      checkSyncStatus();
    }
  });

  onMount(() => {
    checkBiometrics();
    checkSyncStatus();
  });

  async function handleToggleBiometrics() {
    biometricsMessage = null;
    isTogglingBiometrics = true;

    try {
      if (biometricsEnrolled) {
        await removeBiometricUnlock();
        await vault.updateSettings({ biometricUnlockEnabled: false });
        biometricsEnrolled = false;
        biometricsMessage = { type: 'success', text: 'Biometric unlock disabled.' };
      } else {
        const masterKey = vault.getMasterKey();
        if (!masterKey) {
          throw new Error('Vault master key is not accessible in memory.');
        }
        const success = await registerBiometricUnlock(masterKey);
        if (success) {
          await vault.updateSettings({ biometricUnlockEnabled: true });
          biometricsEnrolled = true;
          biometricsMessage = { type: 'success', text: 'Biometric unlock enabled successfully!' };
        } else {
          biometricsMessage = { type: 'error', text: 'Biometric registration was cancelled.' };
        }
      }
    } catch (err: unknown) {
      biometricsMessage = {
        type: 'error',
        text: (err as Error).message || 'Failed to update biometric settings.',
      };
    } finally {
      isTogglingBiometrics = false;
    }
  }

  async function handleAutoLockChange(minutes: number) {
    await vault.updateSettings({ autoLockTimeoutMinutes: minutes });
  }

  async function handleChangePassword(e: SubmitEvent) {
    e.preventDefault();
    passwordMessage = null;

    if (!currentPassword) {
      passwordMessage = { type: 'error', text: 'Please enter your current password.' };
      return;
    }

    if (newPassword.length < 8) {
      passwordMessage = { type: 'error', text: 'New password must be at least 8 characters long.' };
      return;
    }

    if (newPassword !== confirmPassword) {
      passwordMessage = { type: 'error', text: 'New passwords do not match.' };
      return;
    }

    try {
      isChangingPassword = true;
      await vault.changeMasterPassword(currentPassword, newPassword);

      // If biometrics was active, re-wrap with the new key
      if (biometricsEnrolled) {
        const newKey = vault.getMasterKey();
        if (newKey) {
          await registerBiometricUnlock(newKey);
        }
      }

      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      passwordMessage = { type: 'success', text: 'Master password changed successfully!' };
    } catch (err: unknown) {
      passwordMessage = {
        type: 'error',
        text:
          (err as Error).message ||
          'Failed to change password. Ensure current password is correct.',
      };
    } finally {
      isChangingPassword = false;
    }
  }

  function handleExportEncrypted() {
    const payload = vault.getCachedPayload();
    if (!payload) return;

    const content = exportEncryptedBackup(payload);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadTextFile(`vault2fa-backup-${dateStr}.json`, content);
    backupMessage = { type: 'success', text: 'Encrypted backup downloaded successfully.' };
  }

  function handleExportAegis() {
    if (!vault.data) return;

    const content = exportToAegisJson(vault.data);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadTextFile(`aegis-export-${dateStr}.json`, content);
    backupMessage = { type: 'success', text: 'Aegis JSON backup downloaded successfully.' };
  }

  function handleExportPlainText() {
    if (!vault.data) return;

    const content = exportPlainTextBackup(vault.data);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadTextFile(`vault2fa-uris-${dateStr}.txt`, content, 'text/plain');
    backupMessage = { type: 'success', text: 'Plain text URI list downloaded successfully.' };
  }

  function handleExportDecryptedConfirmed() {
    if (!vault.data) return;

    const content = exportDecryptedBackup(vault.data);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadTextFile(`vault2fa-decrypted-${dateStr}.json`, content);
    showDecryptedWarning = false;
    backupMessage = { type: 'success', text: 'Decrypted backup downloaded. Keep it secure!' };
  }

  async function handleImportFile(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    backupMessage = null;
    isImporting = true;

    try {
      const content = await file.text();
      let format = detectBackupFormat(content);

      // Fallback for .txt files
      if (format === 'unknown' && file.name.toLowerCase().endsWith('.txt')) {
        if (isPlainTextOtpList(content)) {
          format = 'plain-text-uris';
        }
      }

      if (format === 'aegis' || format === 'vault2fa-decrypted' || format === 'plain-text-uris') {
        const parsed = parseUnencryptedBackup(content);
        if (parsed.entries.length === 0) {
          backupMessage = {
            type: 'error',
            text: 'No valid OTP accounts were found in this file.',
          };
        } else {
          const { addedCount } = await vault.importEntriesAndGroups(parsed.entries, parsed.groups);
          if (addedCount === 0) {
            backupMessage = {
              type: 'success',
              text: `All ${parsed.entries.length} accounts found in this file are already in your vault.`,
            };
          } else {
            backupMessage = {
              type: 'success',
              text: `Successfully imported ${addedCount} accounts into your vault!`,
            };
          }
        }
      } else if (format === 'vault2fa-encrypted') {
        backupMessage = {
          type: 'error',
          text: 'To restore a full encrypted backup file, please lock and reset the vault from onboarding.',
        };
      } else {
        backupMessage = {
          type: 'error',
          text: 'Unrecognized file format. Expected Aegis JSON, vault2fa backup, or plain text URI list (.txt).',
        };
      }
    } catch (err: unknown) {
      backupMessage = {
        type: 'error',
        text: (err as Error).message || 'Failed to read backup file.',
      };
    } finally {
      isImporting = false;
      if (fileInputEl) fileInputEl.value = '';
    }
  }

  // Local File Sync Handlers
  async function handleLinkLocalFile() {
    localFileMessage = null;
    isProcessingLocalFile = true;
    try {
      const picked = await pickLocalVaultFile();
      if (!picked) return;
      localHandle = picked.handle;
      const res = await vault.syncWithLocalFile(picked.handle);
      localFileMessage = {
        type: 'success',
        text: `Linked "${picked.fileName}"! (${res.entriesAdded} added, ${res.entriesUpdated} updated)`,
      };
    } catch (err: unknown) {
      localFileMessage = {
        type: 'error',
        text: (err as Error).message || 'Failed to link file.',
      };
    } finally {
      isProcessingLocalFile = false;
    }
  }

  async function handleCreateLocalFile() {
    localFileMessage = null;
    isProcessingLocalFile = true;
    try {
      const created = await createLocalVaultFile();
      if (!created) return;
      localHandle = created.handle;
      await vault.saveToLocalFile(created.handle);
      localFileMessage = {
        type: 'success',
        text: `Created and linked "${created.fileName}"!`,
      };
    } catch (err: unknown) {
      localFileMessage = {
        type: 'error',
        text: (err as Error).message || 'Failed to create file.',
      };
    } finally {
      isProcessingLocalFile = false;
    }
  }

  async function handleSaveLocalFileNow() {
    if (!localHandle) return;
    localFileMessage = null;
    isProcessingLocalFile = true;
    try {
      await vault.saveToLocalFile(localHandle);
      localFileMessage = {
        type: 'success',
        text: `Saved to "${localHandle.name}" successfully.`,
      };
    } catch (err: unknown) {
      localFileMessage = {
        type: 'error',
        text: (err as Error).message || 'Failed to save to local file.',
      };
    } finally {
      isProcessingLocalFile = false;
    }
  }

  async function handleMergeLocalFileNow() {
    if (!localHandle) return;
    localFileMessage = null;
    isProcessingLocalFile = true;
    try {
      const res = await vault.syncWithLocalFile(localHandle);
      localFileMessage = {
        type: 'success',
        text: `Synced with "${localHandle.name}" (${res.entriesAdded} added, ${res.entriesUpdated} updated, ${res.entriesDeleted} deleted).`,
      };
    } catch (err: unknown) {
      localFileMessage = {
        type: 'error',
        text: (err as Error).message || 'Failed to sync with local file.',
      };
    } finally {
      isProcessingLocalFile = false;
    }
  }

  async function handleUnlinkLocalFile() {
    await uncheckLinkedHandle();
    localHandle = null;
    await vault.updateSettings({
      localFileSync: undefined,
      syncProvider:
        vault.data?.settings.syncProvider === 'local-file'
          ? 'none'
          : vault.data?.settings.syncProvider,
    });
    localFileMessage = { type: 'success', text: 'Local file unlinked.' };
  }

  async function handleToggleLocalAutoSync() {
    const current = vault.data?.settings.localFileSync;
    if (!current) return;
    await vault.updateSettings({
      localFileSync: {
        ...current,
        autoSync: !current.autoSync,
      },
    });
  }

  // GitHub Gist Handlers
  async function handleValidateGistToken() {
    gistMessage = null;
    if (!gistToken.trim()) {
      gistMessage = { type: 'error', text: 'Please enter a GitHub Personal Access Token.' };
      return;
    }
    isValidatingToken = true;
    try {
      const user = await validateGitHubToken(gistToken);
      gistMessage = {
        type: 'success',
        text: `Authenticated as @${user.login}! Token is valid.`,
      };
      await vault.updateSettings({
        gistSync: {
          token: gistToken.trim(),
          gistId: gistId.trim() || undefined,
          autoSync: vault.data?.settings.gistSync?.autoSync ?? true,
          lastSyncedAt: vault.data?.settings.gistSync?.lastSyncedAt,
        },
      });
    } catch (err: unknown) {
      gistMessage = {
        type: 'error',
        text: (err as Error).message || 'Invalid GitHub token or network error.',
      };
    } finally {
      isValidatingToken = false;
    }
  }

  async function handleSyncGistNow() {
    gistMessage = null;
    if (!gistToken.trim()) {
      gistMessage = { type: 'error', text: 'Please enter a GitHub Personal Access Token first.' };
      return;
    }
    isSyncingGist = true;
    try {
      await vault.updateSettings({
        gistSync: {
          token: gistToken.trim(),
          gistId: gistId.trim() || undefined,
          autoSync: vault.data?.settings.gistSync?.autoSync ?? true,
          lastSyncedAt: vault.data?.settings.gistSync?.lastSyncedAt,
        },
      });

      const res = await vault.syncWithGist();
      gistId = res.gistId;
      gistMessage = {
        type: 'success',
        text: `Synced with Gist ${res.gistId.slice(0, 8)}... (${res.entriesAdded} added, ${res.entriesUpdated} updated, ${res.entriesDeleted} deleted)`,
      };
    } catch (err: unknown) {
      gistMessage = {
        type: 'error',
        text: (err as Error).message || 'Gist sync failed.',
      };
    } finally {
      isSyncingGist = false;
    }
  }

  async function handleDisconnectGist() {
    gistToken = '';
    gistId = '';
    await vault.updateSettings({
      gistSync: undefined,
      syncProvider:
        vault.data?.settings.syncProvider === 'github-gist'
          ? 'none'
          : vault.data?.settings.syncProvider,
    });
    gistMessage = { type: 'success', text: 'GitHub Gist disconnected.' };
  }

  async function handleToggleGistAutoSync() {
    const current = vault.data?.settings.gistSync;
    if (!current) return;
    await vault.updateSettings({
      gistSync: {
        ...current,
        autoSync: !current.autoSync,
      },
    });
  }

  async function handleSyncConfigScanned(config: GistSyncConfig) {
    gistToken = config.token;
    gistId = config.gistId ?? '';
    gistMessage = null;
    isSyncingGist = true;

    try {
      await vault.updateSettings({
        gistSync: config,
        syncProvider: 'github-gist',
      });

      const res = await vault.syncWithGist();
      gistId = res.gistId;
      gistMessage = {
        type: 'success',
        text: `Connected to Gist from QR! (${res.entriesAdded} added, ${res.entriesUpdated} updated)`,
      };
    } catch (err: unknown) {
      gistMessage = {
        type: 'error',
        text: (err as Error).message || 'Failed to sync with scanned Gist configuration.',
      };
    } finally {
      isSyncingGist = false;
    }
  }
</script>

{#if isOpen}
  <!-- Modal Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
  >
    <div
      class="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 shadow-2xl"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <h2 id="settings-title" class="text-base font-bold text-white">Vault Settings</h2>
        <button
          type="button"
          onclick={onClose}
          aria-label="Close dialog"
          class="rounded-xl p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <div class="flex border-b border-white/10 bg-zinc-950/40 p-2">
        <button
          type="button"
          onclick={() => (activeTab = 'security')}
          class="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition {activeTab ===
          'security'
            ? 'bg-zinc-800 text-white shadow-sm'
            : 'text-zinc-400 hover:text-zinc-200'}"
        >
          <Lock class="h-3.5 w-3.5 text-indigo-400" />
          <span>Security</span>
        </button>

        <button
          type="button"
          onclick={() => (activeTab = 'sync')}
          class="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition {activeTab ===
          'sync'
            ? 'bg-zinc-800 text-white shadow-sm'
            : 'text-zinc-400 hover:text-zinc-200'}"
        >
          <Cloud class="h-3.5 w-3.5 text-indigo-400" />
          <span>Sync</span>
        </button>

        <button
          type="button"
          onclick={() => (activeTab = 'backup')}
          class="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition {activeTab ===
          'backup'
            ? 'bg-zinc-800 text-white shadow-sm'
            : 'text-zinc-400 hover:text-zinc-200'}"
        >
          <Download class="h-3.5 w-3.5 text-indigo-400" />
          <span>Backups</span>
        </button>

        <button
          type="button"
          onclick={() => (activeTab = 'about')}
          class="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition {activeTab ===
          'about'
            ? 'bg-zinc-800 text-white shadow-sm'
            : 'text-zinc-400 hover:text-zinc-200'}"
        >
          <Info class="h-3.5 w-3.5 text-indigo-400" />
          <span>About</span>
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="flex-1 overflow-y-auto p-6">
        <!-- SECURITY TAB -->
        {#if activeTab === 'security'}
          <div class="space-y-6">
            <!-- Biometric Section -->
            <div class="rounded-2xl border border-white/5 bg-zinc-950/60 p-4">
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400"
                  >
                    <Fingerprint class="h-5 w-5" />
                  </div>
                  <div>
                    <h3 class="text-xs font-bold text-white">Platform Biometrics</h3>
                    <p class="mt-0.5 text-[11px] text-zinc-400">
                      Use Touch ID, Face ID, or Windows Hello for instant vault unlock.
                    </p>
                  </div>
                </div>

                {#if biometricsSupported}
                  <button
                    type="button"
                    onclick={handleToggleBiometrics}
                    disabled={isTogglingBiometrics}
                    class="shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition {biometricsEnrolled
                      ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500'}"
                  >
                    {#if isTogglingBiometrics}
                      <Loader2 class="h-3.5 w-3.5 animate-spin" />
                    {:else if biometricsEnrolled}
                      Disable
                    {:else}
                      Enable
                    {/if}
                  </button>
                {:else}
                  <span class="rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-500">
                    Not Supported
                  </span>
                {/if}
              </div>

              {#if biometricsMessage}
                <div
                  class="mt-3 text-[11px] {biometricsMessage.type === 'success'
                    ? 'text-emerald-400'
                    : 'text-rose-400'}"
                >
                  {biometricsMessage.text}
                </div>
              {/if}
            </div>

            <!-- Auto-Lock Timeout -->
            <div>
              <label for="auto-lock-select" class="mb-2 block text-xs font-bold text-white">
                Auto-Lock Inactivity Timeout
              </label>
              <div class="grid grid-cols-4 gap-2">
                {#each [1, 5, 15, 30] as minutes (minutes)}
                  <button
                    type="button"
                    onclick={() => handleAutoLockChange(minutes)}
                    class="rounded-xl border py-2 text-xs font-medium transition {vault.settings
                      .autoLockTimeoutMinutes === minutes
                      ? 'border-indigo-500 bg-indigo-500/10 font-semibold text-indigo-400'
                      : 'border-white/5 bg-zinc-950/60 text-zinc-400 hover:text-white'}"
                  >
                    {minutes} min
                  </button>
                {/each}
              </div>
            </div>

            <!-- Change Master Password -->
            <div class="border-t border-white/10 pt-4">
              <h3 class="mb-3 flex items-center gap-2 text-xs font-bold text-white">
                <KeyRound class="h-3.5 w-3.5 text-indigo-400" />
                <span>Change Master Password</span>
              </h3>

              <form onsubmit={handleChangePassword} class="space-y-3">
                {#if passwordMessage}
                  <div
                    class="rounded-xl p-2.5 text-[11px] {passwordMessage.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-rose-500/10 text-rose-400'}"
                  >
                    {passwordMessage.text}
                  </div>
                {/if}

                <div>
                  <input
                    type="password"
                    bind:value={currentPassword}
                    placeholder="Current Password"
                    autocomplete="current-password"
                    class="w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <input
                    type="password"
                    bind:value={newPassword}
                    placeholder="New Master Password (min. 8 chars)"
                    autocomplete="new-password"
                    class="w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <input
                    type="password"
                    bind:value={confirmPassword}
                    placeholder="Confirm New Password"
                    autocomplete="new-password"
                    class="w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2 text-xs text-white placeholder-zinc-500 outline-none focus:border-indigo-500"
                  />
                </div>

                <div class="flex justify-end">
                  <button
                    type="submit"
                    disabled={isChangingPassword || !currentPassword || !newPassword}
                    class="flex items-center gap-2 rounded-xl bg-zinc-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-40"
                  >
                    {#if isChangingPassword}
                      <Loader2 class="h-3 w-3 animate-spin" />
                      <span>Deriving Key...</span>
                    {:else}
                      <span>Update Password</span>
                    {/if}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <!-- SYNC & CLOUD TAB -->
        {:else if activeTab === 'sync'}
          <div class="space-y-6">
            <!-- Header banner -->
            <div class="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4">
              <div class="flex items-start gap-3">
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                >
                  <Cloud class="h-5 w-5" />
                </div>
                <div>
                  <h3 class="text-xs font-bold text-white">Decentralized Zero-Knowledge Sync</h3>
                  <p class="mt-0.5 text-[11px] text-zinc-300">
                    Sync your vault across multiple devices without trusting any central server. All
                    data is encrypted client-side with AES-256-GCM + Argon2id before leaving this
                    device.
                  </p>
                </div>
              </div>
            </div>

            <!-- 1. Native Local File Sync Card -->
            <div class="rounded-2xl border border-white/5 bg-zinc-950/60 p-4">
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400"
                  >
                    <HardDrive class="h-5 w-5" />
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <h3 class="text-xs font-bold text-white">Local File System (.vault)</h3>
                      {#if localHandle}
                        <span
                          class="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400"
                        >
                          Linked
                        </span>
                      {/if}
                    </div>
                    <p class="mt-0.5 text-[11px] text-zinc-400">
                      Link a local encrypted file on your disk, USB drive, Syncthing, or iCloud
                      folder.
                    </p>
                  </div>
                </div>
              </div>

              {#if !localFileSupported}
                <div
                  class="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] text-amber-300"
                >
                  Native File System Access API is not supported in this browser. You can still
                  export/import .vault backups or use GitHub Gist sync.
                </div>
              {:else if localHandle}
                <div class="mt-4 space-y-3 rounded-xl border border-white/5 bg-zinc-900/50 p-3">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-zinc-400">Linked File:</span>
                    <span class="font-mono font-medium text-zinc-200">{localHandle.name}</span>
                  </div>

                  {#if vault.data?.settings.localFileSync?.lastSyncedAt}
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="text-zinc-500">Last Synced:</span>
                      <span class="text-zinc-400">
                        {new Date(
                          vault.data.settings.localFileSync.lastSyncedAt,
                        ).toLocaleTimeString()}
                      </span>
                    </div>
                  {/if}

                  <label class="flex cursor-pointer items-center justify-between pt-1">
                    <span class="text-xs text-zinc-300">Auto-save on vault modifications</span>
                    <input
                      type="checkbox"
                      checked={vault.data?.settings.localFileSync?.autoSync ?? true}
                      onchange={handleToggleLocalAutoSync}
                      class="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>

                  <div class="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onclick={handleSaveLocalFileNow}
                      disabled={isProcessingLocalFile}
                      class="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {#if isProcessingLocalFile}
                        <Loader2 class="h-3.5 w-3.5 animate-spin" />
                      {:else}
                        <HardDrive class="h-3.5 w-3.5" />
                      {/if}
                      <span>Save to File</span>
                    </button>

                    <button
                      type="button"
                      onclick={handleMergeLocalFileNow}
                      disabled={isProcessingLocalFile}
                      class="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-800 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700 disabled:opacity-50"
                    >
                      <RefreshCw
                        class="h-3.5 w-3.5 {isProcessingLocalFile ? 'animate-spin' : ''}"
                      />
                      <span>Pull & Merge</span>
                    </button>

                    <button
                      type="button"
                      onclick={handleUnlinkLocalFile}
                      class="flex items-center justify-center gap-1 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400 transition hover:bg-rose-500/20"
                      title="Unlink file handle"
                    >
                      <Unlink class="h-3.5 w-3.5" />
                      <span>Unlink</span>
                    </button>
                  </div>
                </div>
              {:else}
                <div class="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onclick={handleLinkLocalFile}
                    disabled={isProcessingLocalFile}
                    class="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/90 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 hover:text-white disabled:opacity-50"
                  >
                    {#if isProcessingLocalFile}
                      <Loader2 class="h-3.5 w-3.5 animate-spin" />
                    {:else}
                      <HardDrive class="h-3.5 w-3.5 text-indigo-400" />
                    {/if}
                    <span>Link Existing .vault</span>
                  </button>

                  <button
                    type="button"
                    onclick={handleCreateLocalFile}
                    disabled={isProcessingLocalFile}
                    class="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {#if isProcessingLocalFile}
                      <Loader2 class="h-3.5 w-3.5 animate-spin" />
                    {:else}
                      <HardDrive class="h-3.5 w-3.5" />
                    {/if}
                    <span>Create New .vault</span>
                  </button>
                </div>
              {/if}

              {#if localFileMessage}
                <div
                  class="mt-3 rounded-xl p-2.5 text-xs {localFileMessage.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-rose-500/10 text-rose-400'}"
                >
                  {localFileMessage.text}
                </div>
              {/if}
            </div>

            <!-- 2. GitHub Gist Sync Card -->
            <div class="rounded-2xl border border-white/5 bg-zinc-950/60 p-4">
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400"
                  >
                    <Cloud class="h-5 w-5" />
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <h3 class="text-xs font-bold text-white">GitHub Gist (Zero-Knowledge)</h3>
                      {#if vault.data?.settings.gistSync?.gistId}
                        <span
                          class="rounded-md bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-400"
                        >
                          Connected
                        </span>
                      {/if}
                    </div>
                    <p class="mt-0.5 text-[11px] text-zinc-400">
                      Sync encrypted backups using a secret GitHub Gist. Zero knowledge: seeds are
                      never exposed to GitHub.
                    </p>
                  </div>
                </div>
              </div>

              <div class="mt-4 space-y-3">
                <div>
                  <label
                    for="gist-pat-input"
                    class="flex items-center justify-between text-xs font-medium text-zinc-300"
                  >
                    <span>GitHub Personal Access Token (PAT)</span>
                    <a
                      href="https://github.com/settings/tokens/new?scopes=gist&description=vault2fa-sync"
                      target="_blank"
                      rel="noreferrer"
                      class="flex items-center gap-1 text-[11px] text-indigo-400 transition hover:underline"
                    >
                      <span>Create Token</span>
                      <ExternalLink class="h-3 w-3" />
                    </a>
                  </label>
                  <div class="relative mt-1">
                    <input
                      id="gist-pat-input"
                      type={showGistToken ? 'text' : 'password'}
                      bind:value={gistToken}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx or github_pat_..."
                      class="w-full rounded-xl border border-white/10 bg-zinc-900/80 py-2 pr-10 pl-3 text-xs text-zinc-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      aria-label={showGistToken ? 'Hide token' : 'Show token'}
                      onclick={() => (showGistToken = !showGistToken)}
                      class="absolute top-2 right-2.5 text-zinc-500 hover:text-zinc-300"
                    >
                      {#if showGistToken}
                        <EyeOff class="h-4 w-4" />
                      {:else}
                        <Eye class="h-4 w-4" />
                      {/if}
                    </button>
                  </div>
                </div>

                <div>
                  <label for="gist-id-input" class="block text-xs font-medium text-zinc-300">
                    Gist ID (Optional)
                  </label>
                  <input
                    id="gist-id-input"
                    type="text"
                    bind:value={gistId}
                    placeholder="Leave blank to create a new secret Gist automatically"
                    class="mt-1 w-full rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {#if gistToken.trim()}
                  <label class="flex cursor-pointer items-center justify-between pt-1">
                    <span class="text-xs text-zinc-300">Auto-sync on vault modifications</span>
                    <input
                      type="checkbox"
                      checked={vault.data?.settings.gistSync?.autoSync ?? true}
                      onchange={handleToggleGistAutoSync}
                      class="h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>
                {/if}

                {#if vault.data?.settings.gistSync?.lastSyncedAt}
                  <div class="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>Last Gist Sync:</span>
                    <span class="font-mono">
                      {new Date(vault.data.settings.gistSync.lastSyncedAt).toLocaleTimeString()}
                    </span>
                  </div>
                {/if}

                <div class="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onclick={() => (isScanConfigOpen = true)}
                    class="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/90 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                    title="Scan Config QR from another device"
                  >
                    <Camera class="h-3.5 w-3.5 text-purple-400" />
                    <span>Scan QR</span>
                  </button>

                  {#if gistToken.trim()}
                    <button
                      type="button"
                      onclick={() => (isShareConfigOpen = true)}
                      class="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/90 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800"
                      title="Share sync configuration via QR code"
                    >
                      <QrCode class="h-3.5 w-3.5 text-purple-400" />
                      <span>Share QR</span>
                    </button>
                  {/if}

                  <button
                    type="button"
                    onclick={handleValidateGistToken}
                    disabled={isValidatingToken || !gistToken.trim()}
                    class="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/90 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {#if isValidatingToken}
                      <Loader2 class="h-3.5 w-3.5 animate-spin" />
                    {:else}
                      <Check class="h-3.5 w-3.5 text-emerald-400" />
                    {/if}
                    <span>Validate Token</span>
                  </button>

                  <button
                    type="button"
                    onclick={handleSyncGistNow}
                    disabled={isSyncingGist || !gistToken.trim()}
                    class="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/25 transition hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50"
                  >
                    {#if isSyncingGist}
                      <Loader2 class="h-3.5 w-3.5 animate-spin" />
                    {:else}
                      <RefreshCw class="h-3.5 w-3.5" />
                    {/if}
                    <span>Sync Now</span>
                  </button>

                  {#if vault.data?.settings.gistSync}
                    <button
                      type="button"
                      onclick={handleDisconnectGist}
                      class="flex items-center justify-center gap-1 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400 transition hover:bg-rose-500/20"
                      title="Disconnect Gist"
                    >
                      <Unlink class="h-3.5 w-3.5" />
                      <span>Disconnect</span>
                    </button>
                  {/if}
                </div>

                {#if gistMessage}
                  <div
                    class="mt-2 rounded-xl p-2.5 text-xs {gistMessage.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-rose-500/10 text-rose-400'}"
                  >
                    {gistMessage.text}
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <!-- BACKUP TAB -->
        {:else if activeTab === 'backup'}
          <div class="space-y-4">
            {#if backupMessage}
              <div
                class="rounded-xl p-3 text-xs {backupMessage.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-rose-500/10 text-rose-400'}"
              >
                {backupMessage.text}
              </div>
            {/if}

            <!-- Encrypted Backup -->
            <div
              class="flex items-center justify-between rounded-2xl border border-white/5 bg-zinc-950/60 p-4"
            >
              <div>
                <h3 class="text-xs font-bold text-white">Encrypted Backup</h3>
                <p class="text-[11px] text-zinc-400">
                  AES-256-GCM ciphertext payload protected by master password.
                </p>
              </div>
              <button
                type="button"
                onclick={handleExportEncrypted}
                class="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow transition hover:bg-indigo-500"
              >
                <Download class="h-3.5 w-3.5" />
                <span>Export</span>
              </button>
            </div>

            <!-- Aegis Format -->
            <div
              class="flex items-center justify-between rounded-2xl border border-white/5 bg-zinc-950/60 p-4"
            >
              <div>
                <h3 class="text-xs font-bold text-white">Aegis JSON Format</h3>
                <p class="text-[11px] text-zinc-400">
                  Standard format for interoperability with Aegis Authenticator.
                </p>
              </div>
              <button
                type="button"
                onclick={handleExportAegis}
                class="flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700 hover:text-white"
              >
                <FileCode class="h-3.5 w-3.5 text-indigo-400" />
                <span>Export</span>
              </button>
            </div>

            <!-- Plain Text URIs -->
            <div
              class="flex items-center justify-between rounded-2xl border border-white/5 bg-zinc-950/60 p-4"
            >
              <div>
                <h3 class="text-xs font-bold text-white">Plain Text URIs (.txt)</h3>
                <p class="text-[11px] text-zinc-400">
                  Newline-delimited otpauth:// list. Convenient for bulk copy-paste.
                </p>
              </div>
              <button
                type="button"
                onclick={handleExportPlainText}
                class="flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700 hover:text-white"
              >
                <FileText class="h-3.5 w-3.5 text-indigo-400" />
                <span>Export</span>
              </button>
            </div>

            <!-- Import File -->
            <div
              class="flex items-center justify-between rounded-2xl border border-white/5 bg-zinc-950/60 p-4"
            >
              <div>
                <h3 class="text-xs font-bold text-white">Import Backup File</h3>
                <p class="text-[11px] text-zinc-400">
                  Restore from Aegis JSON, native backup, or plain text URI list (.txt).
                </p>
              </div>
              <input
                bind:this={fileInputEl}
                type="file"
                accept=".json,.txt"
                onchange={handleImportFile}
                class="hidden"
              />
              <button
                type="button"
                onclick={() => fileInputEl?.click()}
                disabled={isImporting}
                class="flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700 hover:text-white disabled:opacity-50"
              >
                {#if isImporting}
                  <Loader2 class="h-3.5 w-3.5 animate-spin" />
                  <span>Importing...</span>
                {:else}
                  <Upload class="h-3.5 w-3.5 text-indigo-400" />
                  <span>Import</span>
                {/if}
              </button>
            </div>

            <!-- Decrypted Plain JSON Export with Warning -->
            <div class="border-t border-white/10 pt-4">
              {#if showDecryptedWarning}
                <div class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <div class="flex items-start gap-2.5">
                    <AlertTriangle class="h-5 w-5 shrink-0 text-amber-400" />
                    <div>
                      <h4 class="text-xs font-bold text-amber-300">Security Warning</h4>
                      <p class="mt-1 text-[11px] text-zinc-300">
                        This will download your 2FA secret keys in unencrypted plain text. Anyone
                        with access to this file can generate your 2FA codes.
                      </p>
                      <div class="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onclick={handleExportDecryptedConfirmed}
                          class="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-zinc-950 hover:bg-amber-400"
                        >
                          I understand, Export Plaintext
                        </button>
                        <button
                          type="button"
                          onclick={() => (showDecryptedWarning = false)}
                          class="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              {:else}
                <button
                  type="button"
                  onclick={() => (showDecryptedWarning = true)}
                  class="text-[11px] text-zinc-500 transition hover:text-zinc-300"
                >
                  Export unencrypted plain JSON...
                </button>
              {/if}
            </div>
          </div>

          <!-- ABOUT TAB -->
        {:else}
          <div class="space-y-4">
            <div
              class="flex items-center gap-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4"
            >
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              >
                <Shield class="h-6 w-6" />
              </div>
              <div>
                <h3 class="text-sm font-bold text-white">vault2fa</h3>
                <p class="text-xs text-zinc-400">Zero-Backend, Local-First 2FA Authenticator</p>
              </div>
            </div>

            <div class="space-y-2 rounded-2xl border border-white/5 bg-zinc-950/60 p-4 text-xs">
              <div class="flex items-center justify-between border-b border-white/5 pb-2">
                <span class="text-zinc-400">Version</span>
                <span class="font-mono text-zinc-200">0.2.0 (Phase 2 PWA)</span>
              </div>
              <div class="flex items-center justify-between border-b border-white/5 pb-2">
                <span class="text-zinc-400">Key Derivation</span>
                <span class="text-zinc-200">Argon2id WASM (64 MB, 3 iter)</span>
              </div>
              <div class="flex items-center justify-between border-b border-white/5 pb-2">
                <span class="text-zinc-400">Encryption</span>
                <span class="text-zinc-200">AES-256-GCM (Hardware WebCrypto)</span>
              </div>
              <div class="flex items-center justify-between border-b border-white/5 pb-2">
                <span class="text-zinc-400">Persistence</span>
                <span class="text-zinc-200">IndexedDB (Dexie sandbox)</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-zinc-400">Telemetry</span>
                <span class="font-semibold text-emerald-400">0% Serverless / No Tracking</span>
              </div>
            </div>

            <div class="pt-2 text-center text-xs text-zinc-500">
              <a
                href="https://github.com/ii2d/vault2fa"
                target="_blank"
                rel="noreferrer"
                class="text-indigo-400 transition hover:underline"
              >
                GitHub Repository
              </a>
              <span> • MIT Licensed</span>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if gistToken.trim()}
  <SyncConfigShareModal
    isOpen={isShareConfigOpen}
    onClose={() => (isShareConfigOpen = false)}
    config={{
      token: gistToken.trim(),
      gistId: gistId.trim() || undefined,
      autoSync: vault.data?.settings.gistSync?.autoSync ?? true,
    }}
  />
{/if}

<SyncConfigScanModal
  isOpen={isScanConfigOpen}
  onClose={() => (isScanConfigOpen = false)}
  onScanned={handleSyncConfigScanned}
/>
