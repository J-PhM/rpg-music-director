<script lang="ts">
  /**
   * Page principale — orchestre les 3 zones (Toolbar / Canvas / Inspecteur).
   *
   * Le scénario d'exemple est chargé automatiquement par le store au
   * démarrage (cf. `scenarioStore.svelte.ts`). L'utilisateur peut
   * « Nouveau » pour repartir vide ou « Ouvrir » pour charger un fichier.
   *
   * Le fil d'Ariane (zone 2) et la barre de lecture arrivent aux
   * jalons 5 et 9 respectivement.
   */

  import Canvas from '$lib/components/Canvas.svelte';
  import Inspector from '$lib/components/Inspector.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';

  // Toast partagé : la Toolbar émet, la page affiche.
  let toastMsg = $state<string>('');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(msg: string): void {
    toastMsg = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMsg = '';
    }, 1800);
  }
</script>

<div class="app">
  <Toolbar onToast={showToast} />

  <div class="main">
    <Canvas onToast={showToast} />
    <Inspector />
  </div>

  {#if toastMsg}
    <div class="toast">{toastMsg}</div>
  {/if}
</div>

<style>
  .app {
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
  }

  .main {
    display: grid;
    grid-template-columns: 1fr auto;
    overflow: hidden;
  }

  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--paper);
    border: 1px solid var(--rule);
    padding: 10px 18px;
    border-radius: 2px;
    font-size: 13px;
    font-family: var(--font-text);
    font-style: italic;
    color: var(--ink);
    box-shadow: var(--shadow);
    animation: toast-in var(--t-mid) var(--ease) both;
    z-index: 100;
    pointer-events: none;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translate(-50%, 6px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
</style>
