<script lang="ts">
  import { Shield, Lock, Plus, Search, Clock, X, Settings } from '@lucide/svelte';
  import { vault } from '$lib/stores';

  let {
    onOpenAddModal,
    onOpenSettingsModal,
  }: {
    onOpenAddModal: () => void;
    onOpenSettingsModal: () => void;
  } = $props();

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
      class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-md shadow-indigo-600/30"
    >
      <Shield class="h-5 w-5 text-white" />
    </div>
    <div>
      <span class="text-base font-bold tracking-tight text-white">vault2fa</span>
      <span class="hidden text-xs text-zinc-500 sm:ml-2 sm:inline">Zero-Knowledge TOTP</span>
    </div>
  </div>

  <!-- Search Bar -->
  <div class="order-3 w-full sm:order-2 sm:w-auto sm:max-w-md sm:flex-1">
    <div class="relative">
      <Search class="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-zinc-500" />
      <input
        type="text"
        bind:value={vault.searchQuery}
        placeholder="Search accounts or issuers..."
        class="w-full rounded-xl border border-white/10 bg-zinc-900/80 py-2 pr-8 pl-9 text-sm text-zinc-200 placeholder-zinc-500 transition outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
      {/if}
    </div>
  </div>

  <!-- Actions: Auto-lock status, Lock button, Add button -->
  <div class="order-2 flex items-center gap-2.5 sm:order-3">
    <!-- Auto-lock countdown badge -->
    <div
      class="hidden items-center gap-1.5 rounded-xl border border-white/5 bg-zinc-900/60 px-2.5 py-1.5 text-xs text-zinc-400 md:flex"
      title="Vault auto-locks after idle timeout"
    >
      <Clock class="h-3.5 w-3.5 text-zinc-500" />
      <span>Auto-lock:</span>
      <span class="font-mono font-medium text-zinc-200">{formattedCountdown}</span>
    </div>

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
