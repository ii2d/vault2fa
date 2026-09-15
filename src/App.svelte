<script lang="ts">
  import { onMount } from 'svelte';
  import { Loader2, Shield } from '@lucide/svelte';
  import { vault } from '$lib/stores';
  import { SetupVault, UnlockVault } from '$lib/components/auth';
  import { MainVault } from '$lib/components/vault';
  import { AddAccountModal, SettingsModal } from '$lib/components/modals';
  import ReloadPrompt from '$lib/components/pwa/ReloadPrompt.svelte';

  let isAddModalOpen = $state(false);
  let isSettingsModalOpen = $state(false);

  onMount(async () => {
    await vault.checkInitialState();
  });

  function handleUserActivity() {
    if (vault.isUnlocked) {
      vault.recordActivity();
    }
  }
</script>

<svelte:window
  onmousemove={handleUserActivity}
  onkeydown={handleUserActivity}
  onclick={handleUserActivity}
  ontouchstart={handleUserActivity}
/>

<div
  class="min-h-screen bg-zinc-950 font-sans text-zinc-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200"
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
        <span>Loading vault2fa...</span>
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
