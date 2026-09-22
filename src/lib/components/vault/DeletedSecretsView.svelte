<script lang="ts">
  import {
    RotateCcw,
    Trash2,
    AlertTriangle,
    Folder,
    Eye,
    EyeOff,
    Check,
    ArrowLeft,
  } from '@lucide/svelte';
  import { vault } from '$lib/stores';
  import { generateToken, formatToken } from '$lib/core/totp';
  import type { OTPEntry } from '$lib/types';

  let revealedEntries = $state<Record<string, boolean>>({});
  let isRestoringAll = $state(false);
  let isPurgingAll = $state(false);
  let actionMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

  const deletedList = $derived(vault.entries);
  const totalDeletedCount = $derived(vault.deletedEntriesCount);

  function formatTimeAgo(timestamp?: number): string {
    if (!timestamp) return 'Recently';
    const diffMs = Date.now() - timestamp;
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 60) return 'Just now';
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  function getGroup(groupId?: string) {
    if (!groupId) return null;
    return vault.groups.find((g) => g.id === groupId);
  }

  function getOtpCode(entry: OTPEntry): string {
    try {
      return formatToken(generateToken(entry));
    } catch {
      return '••••••';
    }
  }

  function toggleReveal(id: string) {
    revealedEntries[id] = !revealedEntries[id];
  }

  async function handleRestore(entry: OTPEntry) {
    actionMessage = null;
    try {
      await vault.restoreEntry(entry.id);
      actionMessage = {
        type: 'success',
        text: `Restored "${entry.issuer || entry.label}" back to your vault.`,
      };
    } catch (err: unknown) {
      actionMessage = {
        type: 'error',
        text: (err as Error).message || 'Failed to restore secret.',
      };
    }
  }

  async function handlePurge(entry: OTPEntry) {
    actionMessage = null;
    const displayName = entry.issuer ? `${entry.issuer} (${entry.label})` : entry.label;
    if (
      !confirm(
        `Permanently delete "${displayName}"?\n\nThis secret will be permanently removed from your vault and cannot be recovered.`,
      )
    ) {
      return;
    }

    try {
      await vault.purgeEntry(entry.id);
      actionMessage = {
        type: 'success',
        text: `Permanently deleted "${displayName}".`,
      };
    } catch (err: unknown) {
      actionMessage = {
        type: 'error',
        text: (err as Error).message || 'Failed to completely delete secret.',
      };
    }
  }

  async function handleRestoreAll() {
    if (totalDeletedCount === 0) return;
    actionMessage = null;
    isRestoringAll = true;
    try {
      await vault.restoreAllDeletedEntries();
      actionMessage = {
        type: 'success',
        text: `Successfully restored all ${totalDeletedCount} secrets back to active vault.`,
      };
    } catch (err: unknown) {
      actionMessage = {
        type: 'error',
        text: (err as Error).message || 'Failed to restore all secrets.',
      };
    } finally {
      isRestoringAll = false;
    }
  }

  async function handlePurgeAll() {
    if (totalDeletedCount === 0) return;
    actionMessage = null;
    if (
      !confirm(
        `Permanently delete all ${totalDeletedCount} deleted secrets?\n\nWARNING: This will permanently wipe these secrets from your vault and all synced devices. This action CANNOT be undone.`,
      )
    ) {
      return;
    }

    isPurgingAll = true;
    try {
      await vault.purgeAllDeletedEntries();
      actionMessage = {
        type: 'success',
        text: 'All deleted secrets have been permanently removed.',
      };
    } catch (err: unknown) {
      actionMessage = {
        type: 'error',
        text: (err as Error).message || 'Failed to empty deleted secrets.',
      };
    } finally {
      isPurgingAll = false;
    }
  }
</script>

<div class="space-y-6">
  <!-- Restoring View Header Banner -->
  <div
    class="flex flex-col gap-4 rounded-3xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-zinc-900 to-zinc-900 p-5 shadow-xl sm:flex-row sm:items-center sm:justify-between"
  >
    <div class="flex items-start gap-3.5">
      <div
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/20 text-amber-400 shadow-md shadow-amber-500/10"
      >
        <RotateCcw class="h-5 w-5" />
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-bold tracking-tight text-white sm:text-base">
            Restoring View & Deleted Secrets
          </h2>
          <span
            class="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300"
          >
            {totalDeletedCount}
            {totalDeletedCount === 1 ? 'secret' : 'secrets'}
          </span>
        </div>
        <p class="mt-1 text-xs text-zinc-400">
          Deleted accounts remain here so you can restore them to your vault or completely delete
          them permanently.
        </p>
      </div>
    </div>

    <!-- Batch Actions -->
    {#if totalDeletedCount > 0}
      <div class="flex items-center gap-2 self-end sm:self-center">
        <button
          type="button"
          onclick={handleRestoreAll}
          disabled={isRestoringAll || isPurgingAll}
          class="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-600/20 px-3.5 py-2 text-xs font-semibold text-emerald-300 shadow-sm transition hover:bg-emerald-600 hover:text-white disabled:opacity-50"
        >
          <RotateCcw class="h-3.5 w-3.5" />
          <span>{isRestoringAll ? 'Restoring...' : 'Restore All'}</span>
        </button>

        <button
          type="button"
          onclick={handlePurgeAll}
          disabled={isRestoringAll || isPurgingAll}
          class="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/15 px-3.5 py-2 text-xs font-semibold text-rose-300 shadow-sm transition hover:bg-rose-600 hover:text-white disabled:opacity-50"
        >
          <Trash2 class="h-3.5 w-3.5" />
          <span>{isPurgingAll ? 'Purging...' : 'Empty Trash'}</span>
        </button>
      </div>
    {/if}
  </div>

  <!-- Notification Banner -->
  {#if actionMessage}
    <div
      class="flex items-center gap-2.5 rounded-2xl border p-3.5 text-xs transition {actionMessage.type ===
      'success'
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}"
    >
      {#if actionMessage.type === 'success'}
        <Check class="h-4 w-4 shrink-0 text-emerald-400" />
      {:else}
        <AlertTriangle class="h-4 w-4 shrink-0 text-rose-400" />
      {/if}
      <span class="flex-1 font-medium">{actionMessage.text}</span>
    </div>
  {/if}

  <!-- Content: Cards or Empty State -->
  {#if deletedList.length === 0}
    <div class="rounded-3xl border border-white/5 bg-zinc-900/40 p-12 text-center">
      <div
        class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800/80 text-zinc-500"
      >
        <Trash2 class="h-6 w-6" />
      </div>
      <h3 class="text-sm font-semibold text-zinc-200">No Deleted Secrets</h3>
      <p class="mx-auto mt-1 max-w-sm text-xs text-zinc-500">
        When you remove accounts from your vault, they will be kept here safely where you can
        restore them or delete them forever.
      </p>
      <button
        type="button"
        onclick={() => (vault.activeGroupId = null)}
        class="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700 hover:text-white"
      >
        <ArrowLeft class="h-3.5 w-3.5" />
        <span>Return to Active Accounts</span>
      </button>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each deletedList as entry (entry.id)}
        {@const group = getGroup(entry.groupId)}
        {@const initial = (entry.issuer || entry.label || '?').charAt(0).toUpperCase()}
        {@const isRevealed = Boolean(revealedEntries[entry.id])}

        <div
          class="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-amber-500/20 bg-zinc-900/80 p-5 shadow-lg backdrop-blur-sm transition duration-200 hover:border-amber-500/40 hover:bg-zinc-900"
        >
          <!-- Top: Info & Badges -->
          <div>
            <div class="flex items-start justify-between gap-3">
              <div class="flex min-w-0 flex-1 items-center gap-3">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-zinc-800 to-zinc-700 font-bold text-zinc-100 shadow-inner"
                >
                  {initial}
                </div>

                <div class="min-w-0 flex-1">
                  {#if entry.issuer}
                    <h4 class="truncate text-sm font-bold tracking-tight text-white">
                      {entry.issuer}
                    </h4>
                    <p class="truncate text-xs text-zinc-400">{entry.label}</p>
                  {:else}
                    <h4 class="truncate text-sm font-bold tracking-tight text-white">
                      {entry.label}
                    </h4>
                  {/if}
                </div>
              </div>

              <!-- Time tag -->
              <span
                class="shrink-0 rounded-md border border-white/5 bg-zinc-800/80 px-2 py-0.5 text-[10px] font-medium text-zinc-400"
                title={entry.deletedAt ? new Date(entry.deletedAt).toLocaleString() : ''}
              >
                {formatTimeAgo(entry.deletedAt)}
              </span>
            </div>

            <!-- Tags / Group badge -->
            <div class="mt-3 flex flex-wrap items-center gap-1.5">
              {#if group}
                <span
                  class="inline-flex items-center gap-1 rounded-md bg-zinc-800/80 px-2 py-0.5 text-[10px] font-medium text-zinc-300"
                >
                  <Folder class="h-2.5 w-2.5 text-indigo-400" />
                  <span>{group.name}</span>
                </span>
              {/if}
              <span
                class="rounded-md bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 uppercase"
              >
                {entry.type} • {entry.digits}d
              </span>
            </div>

            <!-- Optional Code Reveal -->
            <div class="mt-4 flex items-center justify-between rounded-xl bg-zinc-950/60 p-2.5">
              <div class="flex items-center gap-2">
                <span class="text-[11px] font-medium text-zinc-400">Code:</span>
                {#if isRevealed}
                  <span class="font-mono text-sm font-bold tracking-wider text-amber-200">
                    {getOtpCode(entry)}
                  </span>
                {:else}
                  <span class="font-mono text-xs tracking-widest text-zinc-500">••••••</span>
                {/if}
              </div>
              <button
                type="button"
                onclick={() => toggleReveal(entry.id)}
                class="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                title={isRevealed ? 'Hide code' : 'Reveal code'}
              >
                {#if isRevealed}
                  <EyeOff class="h-3.5 w-3.5" />
                {:else}
                  <Eye class="h-3.5 w-3.5" />
                {/if}
              </button>
            </div>

            <!-- Note snippet (if present) -->
            {#if entry.note}
              <div
                class="mt-2.5 line-clamp-2 rounded-lg border border-white/5 bg-zinc-950/50 p-2 font-mono text-[11px] break-words text-zinc-400"
                title={entry.note}
              >
                {entry.note}
              </div>
            {/if}
          </div>

          <!-- Bottom Actions: Restore or Completely Delete -->
          <div class="mt-5 flex items-center gap-2 border-t border-white/5 pt-4">
            <button
              type="button"
              onclick={() => handleRestore(entry)}
              class="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-600/15 py-2 text-xs font-semibold text-emerald-300 shadow-sm transition hover:bg-emerald-600 hover:text-white"
            >
              <RotateCcw class="h-3.5 w-3.5" />
              <span>Restore</span>
            </button>

            <button
              type="button"
              onclick={() => handlePurge(entry)}
              class="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 py-2 text-xs font-semibold text-rose-300 shadow-sm transition hover:bg-rose-600 hover:text-white"
            >
              <Trash2 class="h-3.5 w-3.5" />
              <span>Delete Forever</span>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
