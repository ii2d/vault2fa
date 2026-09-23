<script lang="ts">
  import { Search } from '@lucide/svelte';
  import { EditAccountModal } from '$lib/components/modals';
  import { vault } from '$lib/stores';
  import type { OTPEntry } from '$lib/types';
  import DeletedSecretsView from './DeletedSecretsView.svelte';
  import EmptyVault from './EmptyVault.svelte';
  import GroupFilterBar from './GroupFilterBar.svelte';
  import SyncToast from './SyncToast.svelte';
  import TokenCard from './TokenCard.svelte';
  import VaultHeader from './VaultHeader.svelte';

  let {
    onOpenAddModal,
    onOpenSettingsModal,
  }: {
    onOpenAddModal: () => void;
    onOpenSettingsModal: () => void;
  } = $props();

  let editingEntry = $state<OTPEntry | null>(null);

  const totalEntriesCount = $derived(vault.data?.entries.length ?? 0);
  const isDeletedView = $derived(vault.activeGroupId === 'deleted');
  const filteredEntries = $derived(vault.entries);
</script>

<div class="flex min-h-screen flex-col bg-zinc-950 print:hidden">
  <!-- Sticky Header -->
  <VaultHeader {onOpenAddModal} {onOpenSettingsModal} />

  <!-- Main Content Container -->
  <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
    {#if totalEntriesCount === 0}
      <div class="mt-12">
        <EmptyVault {onOpenAddModal} />
      </div>
    {:else}
      <!-- Group Filter Chips Bar -->
      <div class="mb-6">
        <GroupFilterBar />
      </div>

      {#if isDeletedView}
        <DeletedSecretsView />
      {:else if filteredEntries.length === 0}
        <div class="rounded-2xl border border-white/5 bg-zinc-900/40 p-12 text-center">
          <Search class="mx-auto mb-3 h-8 w-8 text-zinc-600" />
          <p class="text-sm font-medium text-zinc-300">No matching accounts found</p>
          <p class="mt-1 text-xs text-zinc-500">
            Try adjusting your search query or switching groups.
          </p>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {#each filteredEntries as entry (entry.id)}
            <TokenCard {entry} onEdit={(e) => (editingEntry = e)} />
          {/each}
        </div>
      {/if}
    {/if}
  </main>

  <EditAccountModal
    entry={editingEntry}
    isOpen={editingEntry !== null}
    onClose={() => (editingEntry = null)}
  />

  <SyncToast />
</div>
