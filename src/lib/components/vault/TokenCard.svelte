<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Pin, Trash2, Copy, Check, RefreshCw, Folder, Pencil, Eye, EyeOff } from '@lucide/svelte';
  import { formatToken, generateToken, getPeriodRemaining } from '$lib/core/totp';
  import { vault } from '$lib/stores';
  import type { OTPEntry } from '$lib/types';

  let {
    entry,
    onEdit,
  }: {
    entry: OTPEntry;
    onEdit?: (entry: OTPEntry) => void;
  } = $props();

  let currentTime = $state(Date.now());
  let copied = $state(false);
  let isRevealed = $state(false);
  let revealTimeout: ReturnType<typeof setTimeout> | null = null;

  // Update clock every second
  onMount(() => {
    const interval = setInterval(() => {
      currentTime = Date.now();
    }, 1000);
    return () => clearInterval(interval);
  });

  onDestroy(() => {
    if (revealTimeout) clearTimeout(revealTimeout);
  });

  const token = $derived(generateToken(entry, currentTime));
  const formattedToken = $derived(formatToken(token));

  const isPrivacyModeActive = $derived(vault.settings.hideCodesByDefault ?? true);
  const isMasked = $derived(isPrivacyModeActive && !isRevealed);

  const remaining = $derived(
    entry.type === 'totp'
      ? getPeriodRemaining(entry.period || 30, currentTime)
      : { seconds: 0, progress: 1 },
  );

  const ringColor = $derived.by(() => {
    if (remaining.seconds <= 4) return 'text-rose-500 stroke-rose-500';
    if (remaining.seconds <= 8) return 'text-amber-500 stroke-amber-500';
    return 'text-emerald-500 stroke-emerald-500';
  });

  const groupName = $derived.by(() => {
    if (!entry.groupId) return null;
    return vault.groups.find((g) => g.id === entry.groupId)?.name ?? null;
  });

  // SVG ring circumference (radius = 12)
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = $derived(circumference * (1 - remaining.progress));

  function handleReveal(e: MouseEvent) {
    e.stopPropagation();
    isRevealed = true;
    if (revealTimeout) clearTimeout(revealTimeout);
    const duration = (vault.settings.revealDurationSeconds || 8) * 1000;
    revealTimeout = setTimeout(() => {
      isRevealed = false;
    }, duration);
  }

  function handleHide(e: MouseEvent) {
    e.stopPropagation();
    if (revealTimeout) clearTimeout(revealTimeout);
    isRevealed = false;
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(token);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(30);
        } catch {
          // Ignore vibration failure
        }
      }
      copied = true;
      if (isPrivacyModeActive) {
        isRevealed = true;
        if (revealTimeout) clearTimeout(revealTimeout);
        const duration = (vault.settings.revealDurationSeconds || 8) * 1000;
        revealTimeout = setTimeout(() => {
          isRevealed = false;
        }, duration);
      }
      setTimeout(() => (copied = false), 1500);
    } catch {
      // Fallback
    }
  }

  async function handleTogglePin(e: MouseEvent) {
    e.stopPropagation();
    await vault.updateEntry(entry.id, { pinned: !entry.pinned });
  }

  function handleEdit(e: MouseEvent) {
    e.stopPropagation();
    onEdit?.(entry);
  }

  async function handleIncrementCounter(e: MouseEvent) {
    e.stopPropagation();
    if (entry.type !== 'hotp') return;
    const nextCounter = (entry.counter ?? 0) + 1;
    await vault.updateEntry(entry.id, { counter: nextCounter });
  }

  async function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    if (confirm(`Remove "${entry.issuer || entry.label}" from your vault?`)) {
      await vault.deleteEntry(entry.id);
    }
  }

  // Initial letter for issuer badge
  const initial = $derived((entry.issuer || entry.label || '?').charAt(0).toUpperCase());
</script>

<div
  role="button"
  tabindex="0"
  onclick={handleCopy}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCopy();
    }
  }}
  class="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70 p-5 shadow-lg backdrop-blur-sm transition duration-200 hover:border-indigo-500/40 hover:bg-zinc-900 hover:shadow-indigo-500/10 focus:ring-2 focus:ring-indigo-500/40 focus:outline-none"
>
  <!-- Top: Issuer, Label, Badges & Actions -->
  <div class="flex items-start justify-between gap-3">
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <!-- Icon / Monogram -->
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-zinc-800 to-zinc-700 font-bold text-zinc-100 shadow-inner"
      >
        {initial}
      </div>

      <!-- Names -->
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h2
            class="truncate text-base font-semibold text-white"
            title={entry.issuer || 'Unnamed Issuer'}
          >
            {entry.issuer || 'Unnamed Issuer'}
          </h2>
          {#if entry.pinned}
            <Pin class="h-3 w-3 shrink-0 fill-indigo-400 text-indigo-400" />
          {/if}
        </div>
        <p class="truncate text-xs text-zinc-400" title={entry.label}>{entry.label}</p>
      </div>
    </div>

    <!-- Quick action buttons -->
    <div
      class="flex shrink-0 items-center gap-1 opacity-80 transition group-hover:opacity-100 sm:opacity-60"
    >
      <button
        type="button"
        onclick={handleTogglePin}
        aria-label={entry.pinned ? 'Unpin token' : 'Pin token'}
        class="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
        title={entry.pinned ? 'Unpin' : 'Pin to top'}
      >
        <Pin class="h-3.5 w-3.5 {entry.pinned ? 'fill-indigo-400 text-indigo-400' : ''}" />
      </button>

      <button
        type="button"
        onclick={handleEdit}
        aria-label="Edit token"
        class="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
        title="Edit account"
      >
        <Pencil class="h-3.5 w-3.5" />
      </button>

      {#if entry.type === 'hotp'}
        <button
          type="button"
          onclick={handleIncrementCounter}
          aria-label="Next HOTP code"
          class="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          title="Generate next code (increment counter)"
        >
          <RefreshCw class="h-3.5 w-3.5" />
        </button>
      {/if}

      <button
        type="button"
        onclick={handleDelete}
        aria-label="Delete token"
        class="rounded-lg p-1.5 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-400"
        title="Delete"
      >
        <Trash2 class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>

  <!-- Bottom: OTP Digits + Countdown Ring -->
  <div class="mt-6 flex items-center justify-between">
    <!-- Code display -->
    <div class="flex items-center gap-2">
      {#if isMasked}
        <button
          type="button"
          onclick={handleReveal}
          class="hover:bg-zinc-850 flex items-center gap-2.5 rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-1.5 text-zinc-400 transition hover:border-indigo-500/40 hover:text-zinc-200"
          title="Click to reveal code for {vault.settings.revealDurationSeconds || 8}s"
        >
          <span class="font-mono text-xl tracking-[0.25em] text-zinc-500 sm:text-2xl">••••••</span>
          <Eye class="h-4 w-4 text-indigo-400" />
        </button>
      {:else}
        <div class="flex items-baseline gap-2">
          <span class="font-mono text-2xl font-bold tracking-wider text-zinc-100 sm:text-3xl">
            {formattedToken}
          </span>
          {#if isPrivacyModeActive}
            <button
              type="button"
              onclick={handleHide}
              class="rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
              title="Hide code"
            >
              <EyeOff class="h-3.5 w-3.5" />
            </button>
          {/if}
        </div>
      {/if}

      {#if copied}
        <span
          class="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400"
        >
          <Check class="h-3 w-3" />
          Copied
        </span>
      {:else}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            handleCopy();
          }}
          aria-label="Copy OTP code"
          class="rounded-lg p-1.5 text-zinc-400 opacity-80 transition group-hover:opacity-100 hover:bg-zinc-800 hover:text-white"
          title="Copy code to clipboard"
        >
          <Copy class="h-4 w-4" />
        </button>
      {/if}
    </div>

    <!-- Countdown Ring (TOTP) or HOTP counter badge -->
    {#if entry.type === 'totp'}
      <div class="relative flex items-center justify-center">
        <svg class="h-9 w-9 -rotate-90 transform">
          <!-- Background track -->
          <circle cx="18" cy="18" r={radius} stroke-width="3" class="fill-none stroke-zinc-800" />
          <!-- Animated remaining progress -->
          <circle
            cx="18"
            cy="18"
            r={radius}
            stroke-width="3"
            stroke-linecap="round"
            class="fill-none transition-all duration-1000 {ringColor}"
            style="stroke-dasharray: {circumference}; stroke-dashoffset: {strokeDashoffset};"
          />
        </svg>
        <span class="absolute text-[10px] font-bold {ringColor}">
          {remaining.seconds}
        </span>
      </div>
    {:else}
      <span
        class="rounded-lg border border-white/10 bg-zinc-800/80 px-2 py-1 font-mono text-xs text-zinc-400"
      >
        C: {entry.counter ?? 0}
      </span>
    {/if}
  </div>

  <!-- Group badge (if assigned) -->
  {#if groupName}
    <div class="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
      <Folder class="h-3 w-3 text-zinc-500" />
      <span>{groupName}</span>
    </div>
  {/if}
</div>
