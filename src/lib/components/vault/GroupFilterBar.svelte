<script lang="ts">
  import { Folder, Plus, Check, X, ChevronDown } from '@lucide/svelte';
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

<!-- Mobile View: Clean Dropdown / Segmented Selector (No scrollbar) -->
<div class="flex items-center gap-2 sm:hidden">
  {#if isAddingGroup}
    <form
      onsubmit={(e) => {
        e.preventDefault();
        handleCreateGroup();
      }}
      class="flex flex-1 items-center gap-1.5"
    >
      <input
        type="text"
        bind:value={newGroupName}
        placeholder="New group name..."
        class="flex-1 rounded-xl border border-indigo-500 bg-zinc-900/90 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <button
        type="submit"
        aria-label="Confirm new group"
        class="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500"
      >
        <Check class="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Cancel new group"
        onclick={() => (isAddingGroup = false)}
        class="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
      >
        <X class="h-4 w-4" />
      </button>
    </form>
  {:else}
    <div class="relative flex-1">
      <Folder class="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-indigo-400" />
      <select
        value={vault.activeGroupId ?? 'all'}
        onchange={(e) => {
          const val = e.currentTarget.value;
          vault.activeGroupId = val === 'all' ? null : val;
        }}
        class="w-full appearance-none rounded-xl border border-white/10 bg-zinc-900/80 py-2 pr-9 pl-9 text-sm font-medium text-zinc-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
      >
        <option value="all" class="bg-zinc-900 text-zinc-100">All Accounts ({allCount})</option>
        {#each vault.groups as group (group.id)}
          {@const count = getGroupCount(group.id)}
          <option value={group.id} class="bg-zinc-900 text-zinc-100">{group.name} ({count})</option>
        {/each}
        {#if uncategorizedCount > 0}
          <option value="uncategorized" class="bg-zinc-900 text-zinc-100"
            >Uncategorized ({uncategorizedCount})</option
          >
        {/if}
      </select>
      <ChevronDown class="pointer-events-none absolute top-2.5 right-3 h-4 w-4 text-zinc-400" />
    </div>

    <button
      type="button"
      onclick={() => (isAddingGroup = true)}
      class="flex h-9 items-center gap-1 rounded-xl border border-dashed border-white/15 bg-zinc-900/40 px-3 text-xs font-medium text-zinc-400 transition hover:border-white/30 hover:text-zinc-200"
      title="Create New Group"
    >
      <Plus class="h-3.5 w-3.5" />
      <span>Group</span>
    </button>
  {/if}
</div>

<!-- Desktop View: Horizontal Pills (Hidden scrollbar) -->
<div class="no-scrollbar hidden items-center gap-2 overflow-x-auto pb-1 text-sm sm:flex">
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
