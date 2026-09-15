<script lang="ts">
  import { Folder, Plus, Check, X } from '@lucide/svelte';
  import { vault } from '$lib/stores';

  let isAddingGroup = $state(false);
  let newGroupName = $state('');

  const allCount = $derived(vault.data?.entries.length ?? 0);

  function getGroupCount(groupId: string): number {
    return vault.data?.entries.filter((e) => e.groupId === groupId).length ?? 0;
  }

  const uncategorizedCount = $derived.by(() => {
    return vault.data?.entries.filter((e) => !e.groupId).length ?? 0;
  });

  async function handleCreateGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    try {
      const created = await vault.addGroup(trimmed);
      vault.activeGroupId = created.id;
      newGroupName = '';
      isAddingGroup = false;
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  }
</script>

<div class="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1 text-sm">
  <!-- All tab -->
  <button
    type="button"
    onclick={() => (vault.activeGroupId = null)}
    class="flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 font-medium transition {vault.activeGroupId ===
    null
      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
      : 'border border-white/10 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}"
  >
    <span>All</span>
    <span
      class="rounded-full px-1.5 py-0.5 text-xs font-semibold {vault.activeGroupId === null
        ? 'bg-indigo-800/80 text-indigo-100'
        : 'bg-zinc-800 text-zinc-400'}"
    >
      {allCount}
    </span>
  </button>

  <!-- Group tabs -->
  {#each vault.groups as group (group.id)}
    {@const count = getGroupCount(group.id)}
    <button
      type="button"
      onclick={() => (vault.activeGroupId = group.id)}
      class="flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 font-medium transition {vault.activeGroupId ===
      group.id
        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
        : 'border border-white/10 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}"
    >
      <Folder class="h-3.5 w-3.5" />
      <span>{group.name}</span>
      <span
        class="rounded-full px-1.5 py-0.5 text-xs font-semibold {vault.activeGroupId === group.id
          ? 'bg-indigo-800/80 text-indigo-100'
          : 'bg-zinc-800 text-zinc-400'}"
      >
        {count}
      </span>
    </button>
  {/each}

  <!-- Uncategorized tab (if entries exist without group) -->
  {#if uncategorizedCount > 0}
    <button
      type="button"
      onclick={() => (vault.activeGroupId = 'uncategorized')}
      class="flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 font-medium transition {vault.activeGroupId ===
      'uncategorized'
        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
        : 'border border-white/10 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}"
    >
      <span>Uncategorized</span>
      <span
        class="rounded-full px-1.5 py-0.5 text-xs font-semibold {vault.activeGroupId ===
        'uncategorized'
          ? 'bg-indigo-800/80 text-indigo-100'
          : 'bg-zinc-800 text-zinc-400'}"
      >
        {uncategorizedCount}
      </span>
    </button>
  {/if}

  <!-- Add new group inline input or button -->
  {#if isAddingGroup}
    <form
      onsubmit={(e) => {
        e.preventDefault();
        handleCreateGroup();
      }}
      class="flex items-center gap-1.5"
    >
      <input
        type="text"
        bind:value={newGroupName}
        placeholder="Group name..."
        class="rounded-lg border border-indigo-500 bg-zinc-950 px-2.5 py-1 text-xs text-white placeholder-zinc-500 outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <button
        type="submit"
        aria-label="Confirm new group"
        class="rounded-lg bg-indigo-600 p-1 text-white hover:bg-indigo-500"
      >
        <Check class="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Cancel new group"
        onclick={() => (isAddingGroup = false)}
        class="rounded-lg bg-zinc-800 p-1 text-zinc-400 hover:text-white"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </form>
  {:else}
    <button
      type="button"
      onclick={() => (isAddingGroup = true)}
      class="flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-white/30 hover:text-zinc-200"
    >
      <Plus class="h-3 w-3" />
      <span>New Group</span>
    </button>
  {/if}
</div>
