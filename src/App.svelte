<script lang="ts">
  import { onMount } from 'svelte';
  import { Loader2, Shield } from '@lucide/svelte';
  import { vault, pwaInstall } from '$lib/stores';
  import { SetupVault, UnlockVault } from '$lib/components/auth';
  import { MainVault } from '$lib/components/vault';
  import { AddAccountModal, SettingsModal } from '$lib/components/modals';
  import ReloadPrompt from '$lib/components/pwa/ReloadPrompt.svelte';
  import { APP_CONFIG } from '$lib/config';

  let isAddModalOpen = $state(false);
  let isSettingsModalOpen = $state(false);

  onMount(async () => {
    pwaInstall.init();
    await vault.checkInitialState();
  });

  function handleUserActivity() {
    if (vault.isUnlocked) {
      vault.recordActivity();
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    handleUserActivity();

    if (!vault.isUnlocked) return;

    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    const activeEl = document.activeElement;
    const isInputActive =
      activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement;

    // Escape to close modals or blur input
    if (e.key === 'Escape') {
      if (isAddModalOpen) {
        isAddModalOpen = false;
        return;
      }
      if (isSettingsModalOpen) {
        isSettingsModalOpen = false;
        return;
      }
      if (isInputActive) {
        (activeEl as HTMLElement).blur();
        return;
      }
    }

    // ⌘K or Ctrl+K or '/' (when not typing in an input) to focus search
    if ((isCmdOrCtrl && e.key.toLowerCase() === 'k') || (!isInputActive && e.key === '/')) {
      e.preventDefault();
      const searchInput = document.getElementById('vault-search-input') as HTMLInputElement | null;
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // ⌘N or Ctrl+N to open Add Account modal
    if (isCmdOrCtrl && e.key.toLowerCase() === 'n' && !e.shiftKey) {
      e.preventDefault();
      isAddModalOpen = true;
      return;
    }
  }
</script>

<svelte:window
  onmousemove={handleUserActivity}
  onkeydown={handleGlobalKeydown}
  onclick={handleUserActivity}
  ontouchstart={handleUserActivity}
/>

<div
  class="min-h-screen bg-zinc-950 font-sans text-zinc-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200 print:min-h-0 print:bg-white print:text-black"
>
  {#if vault.status === 'loading'}
    <div class="flex min-h-screen flex-col items-center justify-center gap-4">
      <div
        class="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-600/20 text-indigo-400 shadow-xl shadow-indigo-500/10"
      >
        <Shield class="h-7 w-7 animate-pulse" />
      </div>
      <div class="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 class="h-4 w-4 animate-spin" />
        <span>Loading {APP_CONFIG.name}...</span>
      </div>
    </div>
  {:else if vault.status === 'uninitialized'}
    <SetupVault />
  {:else if vault.status === 'locked'}
    <UnlockVault />
  {:else}
    <MainVault
      onOpenAddModal={() => (isAddModalOpen = true)}
      onOpenSettingsModal={() => (isSettingsModalOpen = true)}
    />
    <AddAccountModal isOpen={isAddModalOpen} onClose={() => (isAddModalOpen = false)} />
    <SettingsModal isOpen={isSettingsModalOpen} onClose={() => (isSettingsModalOpen = false)} />
  {/if}

  <ReloadPrompt />
</div>
