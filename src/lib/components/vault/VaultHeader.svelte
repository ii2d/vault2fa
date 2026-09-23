<script lang="ts">
  import {
    Shield,
    Lock,
    Plus,
    Search,
    Clock,
    X,
    Settings,
    Cloud,
    RefreshCw,
    Download,
    Eye,
    EyeOff,
  } from '@lucide/svelte';
  import { vault, pwaInstall } from '$lib/stores';
  import { APP_CONFIG } from '$lib/config';
  import InstallGuideModal from '$lib/components/modals/InstallGuideModal.svelte';

  let {
    onOpenAddModal,
    onOpenSettingsModal,
  }: {
    onOpenAddModal: () => void;
    onOpenSettingsModal: () => void;
  } = $props();

  let isInstallGuideOpen = $state(false);

  async function handleInstallClick() {
    if (pwaInstall.canInstall) {
      await pwaInstall.promptInstall();
    } else {
      isInstallGuideOpen = true;
    }
  }

  const formattedCountdown = $derived.by(() => {
    const totalSec = vault.autoLockSecondsLeft;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  });
</script>

<header
  class="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-zinc-950/80 px-4 py-3.5 backdrop-blur-xl sm:px-6"
>
  <!-- Brand -->
  <div class="flex items-center gap-3">
    <div
      class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-md shadow-indigo-600/30"
    >
      <Shield class="h-5 w-5 text-white" />
    </div>
    <div class="hidden items-center sm:flex">
      <span class="text-base font-bold tracking-tight text-white">{APP_CONFIG.name}</span>
      <span class="text-xs text-zinc-500 sm:ml-2">{APP_CONFIG.subtitle}</span>
    </div>
  </div>

  <!-- Search Bar -->
  <div class="order-3 w-full sm:order-2 sm:w-auto sm:max-w-md sm:flex-1">
    <div class="relative">
      <Search class="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-zinc-500" />
      <input
        id="vault-search-input"
        type="text"
        bind:value={vault.searchQuery}
        placeholder="Search accounts or issuers..."
        class="w-full rounded-xl border border-white/10 bg-zinc-900/80 py-2 pr-14 pl-9 text-sm text-zinc-200 placeholder-zinc-500 transition outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
      />
      {#if vault.searchQuery}
        <button
          type="button"
          aria-label="Clear search"
          onclick={() => (vault.searchQuery = '')}
          class="absolute top-2.5 right-2.5 text-zinc-500 hover:text-zinc-300"
        >
          <X class="h-4 w-4" />
        </button>
      {:else}
        <div
          class="pointer-events-none absolute top-2 right-2.5 hidden items-center rounded border border-white/10 bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 sm:flex"
        >
          ⌘K
        </div>
      {/if}
    </div>
  </div>

  <!-- Actions: Auto-lock status, Lock button, Add button -->
  <div class="order-2 flex items-center gap-2.5 sm:order-3">
    <!-- Sync Status Badge -->
    <button
      type="button"
      onclick={onOpenSettingsModal}
      class="hidden items-center gap-1.5 rounded-xl border border-white/5 bg-zinc-900/60 px-2.5 py-1.5 text-xs text-zinc-400 transition hover:border-white/10 hover:text-zinc-200 lg:flex"
      title={vault.lastSyncResult
        ? `${vault.lastSyncResult.summary} (${new Date(vault.lastSyncResult.timestamp).toLocaleTimeString()}). Click to manage sync.`
        : vault.data?.settings.syncProvider && vault.data.settings.syncProvider !== 'none'
          ? `Sync Active (${vault.data.settings.syncProvider}). Click to manage sync.`
          : 'Setup decentralized sync or backup.'}
    >
      {#if vault.syncStatus === 'syncing'}
        <RefreshCw class="h-3.5 w-3.5 animate-spin text-indigo-400" />
        <span class="text-indigo-400">Syncing...</span>
      {:else if vault.syncStatus === 'error'}
        <span class="h-2 w-2 rounded-full bg-rose-500"></span>
        <span class="text-rose-400">Sync Error</span>
      {:else if vault.data?.settings.syncProvider && vault.data.settings.syncProvider !== 'none'}
        <Cloud class="h-3.5 w-3.5 text-emerald-400" />
        <span class="text-emerald-400"
          >{vault.lastSyncResult ? vault.lastSyncResult.badgeText : 'Synced'}</span
        >
      {:else}
        <Cloud class="h-3.5 w-3.5 text-zinc-500" />
        <span class="text-zinc-400">Sync Off</span>
      {/if}
    </button>

    <!-- Auto-lock countdown badge -->
    <div
      class="hidden items-center gap-1.5 rounded-xl border border-white/5 bg-zinc-900/60 px-2.5 py-1.5 text-xs text-zinc-400 md:flex"
      title="Vault auto-locks after idle timeout"
    >
      <Clock class="h-3.5 w-3.5 text-zinc-500" />
      <span>Auto-lock:</span>
      <span class="font-mono font-medium text-zinc-200">{formattedCountdown}</span>
    </div>

    <!-- Install App Button (if not already standalone) -->
    {#if !pwaInstall.isInstalled}
      <button
        type="button"
        onclick={handleInstallClick}
        class="hidden items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-600/20 px-3 py-2 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-600/30 hover:text-white sm:flex"
        title="Install {APP_CONFIG.name} as a standalone application"
      >
        <Download class="h-3.5 w-3.5" />
        <span>Install App</span>
      </button>
    {/if}

    <!-- Privacy Mode Quick Toggle Button -->
    <button
      type="button"
      onclick={() =>
        vault.updateSettings({
          hideCodesByDefault: !(vault.settings.hideCodesByDefault ?? true),
        })}
      class="flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
      title={(vault.settings.hideCodesByDefault ?? true)
        ? 'Privacy Mode is ON (Codes masked). Click to show all codes.'
        : 'Privacy Mode is OFF (Codes visible). Click to mask all codes.'}
      aria-label="Toggle Privacy Mode"
    >
      {#if vault.settings.hideCodesByDefault ?? true}
        <EyeOff class="h-3.5 w-3.5 text-indigo-400" />
      {:else}
        <Eye class="h-3.5 w-3.5 text-zinc-400" />
      {/if}
      <span class="hidden md:inline">
        {(vault.settings.hideCodesByDefault ?? true) ? 'Masked' : 'Visible'}
      </span>
    </button>

    <!-- Settings Button -->
    <button
      type="button"
      onclick={onOpenSettingsModal}
      class="flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
      title="Settings & Preferences"
    >
      <Settings class="h-3.5 w-3.5 text-zinc-400" />
      <span class="hidden sm:inline">Settings</span>
    </button>

    <!-- Manual Lock Button -->
    <button
      type="button"
      onclick={() => vault.lockVault()}
      class="flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
      title="Lock Vault Immediately"
    >
      <Lock class="h-3.5 w-3.5 text-zinc-400" />
      <span class="hidden sm:inline">Lock</span>
    </button>

    <!-- Add Account Button -->
    <button
      type="button"
      onclick={onOpenAddModal}
      class="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/25 transition hover:from-blue-500 hover:to-indigo-500"
    >
      <Plus class="h-4 w-4" />
      <span>Add Account</span>
    </button>
  </div>
</header>

<InstallGuideModal isOpen={isInstallGuideOpen} onClose={() => (isInstallGuideOpen = false)} />
