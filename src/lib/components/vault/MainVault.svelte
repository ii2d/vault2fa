<script lang="ts">
  import { Search } from '@lucide/svelte';
  import { vault } from '$lib/stores';
  import VaultHeader from './VaultHeader.svelte';
  import GroupFilterBar from './GroupFilterBar.svelte';
  import TokenCard from './TokenCard.svelte';
  import EmptyVault from './EmptyVault.svelte';

  let { onOpenAddModal }: { onOpenAddModal: () => void } = $props();

  const totalEntriesCount = $derived(vault.data?.entries.length ?? 0);
  const filteredEntries = $derived(vault.entries);
</script>

<div class="flex min-h-screen flex-col bg-zinc-950">
  <!-- Sticky Header -->
  <VaultHeader {onOpenAddModal} />

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

      <!-- Token Grid -->
      {#if filteredEntries.length === 0}
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
            <TokenCard {entry} />
          {/each}
        </div>
      {/if}
    {/if}
  </main>
</div>
