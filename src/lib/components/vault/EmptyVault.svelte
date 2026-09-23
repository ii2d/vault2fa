<script lang="ts">
  import { Plus, Shield } from '@lucide/svelte';

  let { onOpenAddModal }: { onOpenAddModal: () => void } = $props();
</script>

<div
  class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-zinc-900/30 p-12 text-center"
>
  <div
    class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-indigo-500/20 bg-gradient-to-tr from-blue-600/20 to-indigo-600/20 text-indigo-400 shadow-xl"
  >
    <Shield class="h-8 w-8" />
  </div>

  <h3 class="text-lg font-bold text-white">Your Vault is Empty</h3>
  <p class="mt-1.5 max-w-sm text-sm text-zinc-400">
    Add your first two-factor authentication account using a QR code or manual secret key.
  </p>

  <div class="mt-6">
    <button
      type="button"
      onclick={onOpenAddModal}
      class="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:from-blue-500 hover:to-indigo-500"
    >
      <Plus class="h-4 w-4" />
      <span>Add Your First Account</span>
    </button>
  </div>
</div>
