<script lang="ts">
  import { registerSW } from 'virtual:pwa-register';
  import { CheckCircle2, RefreshCw, X } from '@lucide/svelte';
  import { APP_CONFIG } from '$lib/config';

  let offlineReady = $state(false);
  let needRefresh = $state(false);

  let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined ;

  // Initialize service worker registration in browser environment
  if (typeof window !== 'undefined') {
    updateServiceWorker = registerSW({
      onOfflineReady() {
        offlineReady = true;
        setTimeout(() => {
          offlineReady = false;
        }, 5000);
      },
      onNeedRefresh() {
        needRefresh = true;
      },
    });
  }

  function handleReload() {
    if (updateServiceWorker) {
      updateServiceWorker(true);
    }
  }

  function handleDismiss() {
    offlineReady = false;
    needRefresh = false;
  }
</script>

{#if offlineReady || needRefresh}
  <div
    class="border-border/80 animate-in fade-in slide-in-from-bottom-3 fixed right-5 bottom-5 z-50 flex max-w-sm items-center gap-3 rounded-xl border bg-zinc-900/95 p-4 text-zinc-100 shadow-2xl backdrop-blur-md transition-all"
    role="alert"
  >
    {#if offlineReady}
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400"
      >
        <CheckCircle2 class="h-5 w-5" />
      </div>
      <div class="flex-1 text-xs">
        <p class="font-medium text-zinc-200">Offline Ready</p>
        <p class="text-zinc-400">{APP_CONFIG.name} is cached and ready to work without internet.</p>
      </div>
    {:else if needRefresh}
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400"
      >
        <RefreshCw class="h-5 w-5 animate-spin" />
      </div>
      <div class="flex-1 text-xs">
        <p class="font-medium text-zinc-200">Update Available</p>
        <p class="text-zinc-400">A new version is ready. Reload to update.</p>
      </div>
      <button
        type="button"
        onclick={handleReload}
        class="bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary/40 rounded-lg px-3 py-1.5 text-xs font-semibold shadow transition focus:ring-2 focus:outline-none"
      >
        Reload
      </button>
    {/if}

    <button
      type="button"
      onclick={handleDismiss}
      aria-label="Dismiss notification"
      class="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
    >
      <X class="h-4 w-4" />
    </button>
  </div>
{/if}
