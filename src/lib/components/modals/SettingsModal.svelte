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

  let { isOpen, onClose }: { isOpen: boolean; onClose: () => void } = $props();

  let activeTab = $state<'security' | 'backup' | 'about'>('security');

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

  // Check biometrics status when modal opens
  async function checkBiometrics() {
    biometricsSupported = await isBiometricsAvailable();
    biometricsEnrolled = await hasBiometricCredential();
  }

  $effect(() => {
    if (isOpen) {
      checkBiometrics();
    }
  });

  onMount(() => {
    checkBiometrics();
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
      const format = detectBackupFormat(content);

      if (format === 'aegis' || format === 'vault2fa-decrypted') {
        const parsed = parseUnencryptedBackup(content);
        const { addedCount } = await vault.importEntriesAndGroups(parsed.entries, parsed.groups);
        backupMessage = {
          type: 'success',
          text: `Successfully imported ${addedCount} accounts into your vault!`,
        };
      } else if (format === 'vault2fa-encrypted') {
        backupMessage = {
          type: 'error',
          text: 'To restore a full encrypted backup file, please lock and reset the vault from onboarding.',
        };
      } else {
        backupMessage = {
          type: 'error',
          text: 'Unrecognized file format. Expected Aegis JSON or vault2fa backup.',
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

      <!-- Navigation Tabs -->
      <div class="flex border-b border-white/10 bg-zinc-950/40 p-2">
        <button
          type="button"
          onclick={() => (activeTab = 'security')}
          class="flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition {activeTab ===
          'security'
            ? 'bg-zinc-800 text-white shadow-sm'
            : 'text-zinc-400 hover:text-zinc-200'}"
        >
          <Lock class="h-3.5 w-3.5 text-indigo-400" />
          <span>Security</span>
        </button>

        <button
          type="button"
          onclick={() => (activeTab = 'backup')}
          class="flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition {activeTab ===
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
          class="flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold transition {activeTab ===
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
