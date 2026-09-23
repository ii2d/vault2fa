<script lang="ts">
  import { Cloud, X } from '@lucide/svelte';
  import { fly } from 'svelte/transition';
  import { vault } from '$lib/stores';
</script>

{#if vault.syncToast}
  <aside
    transition:fly={{ y: 16, duration: 220 }}
    class="pointer-events-auto fixed bottom-6 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-emerald-500/30 bg-zinc-900/95 px-4 py-2.5 shadow-2xl shadow-black/70 backdrop-blur-xl sm:right-6 sm:left-auto sm:translate-x-0"
    role="status"
    aria-live="polite"
    aria-label="Sync notification"
  >
    <div
      class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400"
    >
      <Cloud class="h-3.5 w-3.5" />
    </div>

    <p class="text-xs font-medium text-emerald-300">
      {vault.syncToast.message}
    </p>

    <button
      type="button"
      onclick={() => vault.dismissSyncToast()}
      aria-label="Dismiss notification"
      class="ml-1.5 flex h-5 w-5 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200"
    >
      <X class="h-3.5 w-3.5" />
    </button>
  </aside>
{/if}
