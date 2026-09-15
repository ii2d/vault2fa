<script lang="ts">
  import {
    X,
    Folder,
    ChevronDown,
    ChevronUp,
    Eye,
    EyeOff,
    Trash2,
    Save,
    Pin,
  } from '@lucide/svelte';
  import { vault } from '$lib/stores';
  import { cleanSecret, isValidBase32 } from '$lib/core/totp';
  import type { OTPAlgorithm, OTPEntry, OTPType } from '$lib/types';

  let {
    entry,
    isOpen,
    onClose,
  }: {
    entry: OTPEntry | null;
    isOpen: boolean;
    onClose: () => void;
  } = $props();

  let issuer = $state('');
  let label = $state('');
  let secret = $state('');
  let showSecret = $state(false);
  let groupId = $state('');
  let pinned = $state(false);
  let type = $state<OTPType>('totp');
  let algorithm = $state<OTPAlgorithm>('SHA1');
  let digits = $state(6);
  let period = $state(30);
  let counter = $state(0);
  let showAdvanced = $state(false);
  let formError = $state('');
  let isSaving = $state(false);

  // Sync state whenever entry changes or modal opens
  $effect(() => {
    if (isOpen && entry) {
      issuer = entry.issuer || '';
      label = entry.label || '';
      secret = entry.secret || '';
      showSecret = false;
      groupId = entry.groupId || '';
      pinned = Boolean(entry.pinned);
      type = entry.type || 'totp';
      algorithm = entry.algorithm || 'SHA1';
      digits = entry.digits || 6;
      period = entry.period || 30;
      counter = entry.counter || 0;
      showAdvanced = false;
      formError = '';
    }
  });

  async function handleSave() {
    if (!entry) return;
    formError = '';

    const cleanedSecret = cleanSecret(secret);
    if (!cleanedSecret) {
      formError = 'Secret key is required.';
      return;
    }

    if (!isValidBase32(cleanedSecret)) {
      formError = 'Invalid Base32 secret key format.';
      return;
    }

    if (!label.trim() && !issuer.trim()) {
      formError = 'Account name or issuer is required.';
      return;
    }

    try {
      isSaving = true;
      await vault.updateEntry(entry.id, {
        issuer: issuer.trim(),
        label: label.trim() || issuer.trim(),
        secret: cleanedSecret,
        groupId: groupId ? groupId : undefined,
        pinned,
        type,
        algorithm,
        digits,
        period,
        counter: type === 'hotp' ? counter : undefined,
      });
      onClose();
    } catch (err: unknown) {
      formError = (err as Error).message || 'Failed to update account.';
    } finally {
      isSaving = false;
    }
  }

  async function handleDelete() {
    if (!entry) return;
    const displayName = entry.issuer || entry.label || 'this account';
    if (confirm(`Are you sure you want to delete "${displayName}" from your vault?`)) {
      try {
        await vault.deleteEntry(entry.id);
        onClose();
      } catch (err: unknown) {
        formError = (err as Error).message || 'Failed to delete account.';
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={isOpen ? handleKeydown : undefined} />

{#if isOpen && entry}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Backdrop -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
      onclick={onClose}
      role="button"
      tabindex="-1"
      aria-label="Close modal overlay"
    ></div>

    <!-- Modal Content -->
    <div
      class="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/80"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <h2 class="text-lg font-semibold text-white">Edit 2FA Account</h2>
          <p class="text-xs text-zinc-400">Modify account details, group category, or secret key</p>
        </div>
        <button
          type="button"
          onclick={onClose}
          class="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          aria-label="Close edit modal"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Scrollable Form Body -->
      <form
        onsubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        class="flex-1 space-y-4 overflow-y-auto p-6"
      >
        {#if formError}
          <div
            class="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400"
          >
            {formError}
          </div>
        {/if}

        <!-- Service / Issuer -->
        <div>
          <label for="edit-issuer" class="block text-xs font-medium text-zinc-300">
            Service / Issuer
          </label>
          <input
            id="edit-issuer"
            type="text"
            bind:value={issuer}
            placeholder="e.g. Google, GitHub, AWS"
            class="mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <!-- Account / Label -->
        <div>
          <label for="edit-label" class="block text-xs font-medium text-zinc-300">
            Account / Username / Email
          </label>
          <input
            id="edit-label"
            type="text"
            bind:value={label}
            placeholder="e.g. user@example.com"
            class="mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <!-- Group / Folder Category -->
        <div>
          <label
            for="edit-group"
            class="flex items-center gap-1.5 text-xs font-medium text-zinc-300"
          >
            <Folder class="h-3.5 w-3.5 text-zinc-400" />
            <span>Group / Folder</span>
          </label>
          <select
            id="edit-group"
            bind:value={groupId}
            class="mt-1.5 w-full rounded-xl border border-white/10 bg-zinc-950 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          >
            <option value="">None (Uncategorized)</option>
            {#each vault.groups as group (group.id)}
              <option value={group.id}>{group.name}</option>
            {/each}
          </select>
        </div>

        <!-- Pin to Top Toggle -->
        <div
          class="flex items-center justify-between rounded-xl border border-white/5 bg-zinc-950/60 p-3"
        >
          <div class="flex items-center gap-2">
            <Pin class="h-4 w-4 {pinned ? 'fill-indigo-400 text-indigo-400' : 'text-zinc-500'}" />
            <span class="text-xs font-medium text-zinc-200">Pin to Top</span>
          </div>
          <button
            type="button"
            onclick={() => (pinned = !pinned)}
            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none {pinned
              ? 'bg-indigo-600'
              : 'bg-zinc-700'}"
            role="switch"
            aria-checked={pinned}
            aria-label="Pin account toggle"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out {pinned
                ? 'translate-x-5'
                : 'translate-x-0'}"
            ></span>
          </button>
        </div>

        <!-- Advanced & Secret Accordion -->
        <div class="border-t border-white/10 pt-3">
          <button
            type="button"
            onclick={() => (showAdvanced = !showAdvanced)}
            class="flex w-full items-center justify-between text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            <span>Advanced Parameters & Secret Key</span>
            {#if showAdvanced}
              <ChevronUp class="h-4 w-4" />
            {:else}
              <ChevronDown class="h-4 w-4" />
            {/if}
          </button>

          {#if showAdvanced}
            <div class="mt-3 space-y-4 rounded-2xl border border-white/5 bg-zinc-950/60 p-4">
              <!-- Secret Key with Eye Toggle -->
              <div>
                <label for="edit-secret" class="block text-xs font-medium text-zinc-300">
                  Base32 Secret Key
                </label>
                <div class="relative mt-1.5">
                  <input
                    id="edit-secret"
                    type={showSecret ? 'text' : 'password'}
                    bind:value={secret}
                    class="w-full rounded-xl border border-white/10 bg-zinc-900 py-2.5 pr-10 pl-3.5 font-mono text-xs text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onclick={() => (showSecret = !showSecret)}
                    class="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lg p-1 text-zinc-400 hover:text-white"
                    title={showSecret ? 'Hide secret' : 'Show secret'}
                  >
                    {#if showSecret}
                      <EyeOff class="h-4 w-4" />
                    {:else}
                      <Eye class="h-4 w-4" />
                    {/if}
                  </button>
                </div>
              </div>

              <!-- Token Type -->
              <div class="flex items-center justify-between text-xs">
                <span class="text-zinc-400">Token Type</span>
                <div class="flex gap-2">
                  <button
                    type="button"
                    onclick={() => (type = 'totp')}
                    class="rounded-lg px-2.5 py-1 text-xs font-medium transition {type === 'totp'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-800 text-zinc-400'}"
                  >
                    TOTP (Time)
                  </button>
                  <button
                    type="button"
                    onclick={() => (type = 'hotp')}
                    class="rounded-lg px-2.5 py-1 text-xs font-medium transition {type === 'hotp'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-800 text-zinc-400'}"
                  >
                    HOTP (Counter)
                  </button>
                </div>
              </div>

              <!-- Algorithm -->
              <div class="flex items-center justify-between text-xs">
                <label for="edit-algorithm" class="text-zinc-400">Algorithm</label>
                <select
                  id="edit-algorithm"
                  bind:value={algorithm}
                  class="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="SHA1">SHA1 (Standard)</option>
                  <option value="SHA256">SHA256</option>
                  <option value="SHA512">SHA512</option>
                </select>
              </div>

              <!-- Digits -->
              <div class="flex items-center justify-between text-xs">
                <label for="edit-digits" class="text-zinc-400">Digits</label>
                <select
                  id="edit-digits"
                  bind:value={digits}
                  class="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value={6}>6 Digits</option>
                  <option value={7}>7 Digits</option>
                  <option value={8}>8 Digits</option>
                </select>
              </div>

              <!-- Period (TOTP) -->
              {#if type === 'totp'}
                <div class="flex items-center justify-between text-xs">
                  <label for="edit-period" class="text-zinc-400">Period (seconds)</label>
                  <select
                    id="edit-period"
                    bind:value={period}
                    class="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value={30}>30 Seconds (Default)</option>
                    <option value={60}>60 Seconds</option>
                  </select>
                </div>
              {:else}
                <!-- Counter (HOTP) -->
                <div class="flex items-center justify-between text-xs">
                  <label for="edit-counter" class="text-zinc-400">Current Counter</label>
                  <input
                    id="edit-counter"
                    type="number"
                    min="0"
                    bind:value={counter}
                    class="w-24 rounded-lg border border-white/10 bg-zinc-900 px-2 py-1 text-right text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Footer Buttons -->
        <div class="flex items-center justify-between border-t border-white/10 pt-4">
          <button
            type="button"
            onclick={handleDelete}
            class="flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2.5 text-xs font-semibold text-rose-400 transition hover:bg-rose-500/20 hover:text-rose-300"
          >
            <Trash2 class="h-3.5 w-3.5" />
            <span>Delete</span>
          </button>

          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={onClose}
              class="rounded-xl border border-white/10 bg-zinc-800/80 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              class="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/25 transition hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50"
            >
              <Save class="h-3.5 w-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
{/if}
