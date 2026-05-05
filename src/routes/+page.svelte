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

  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import Canvas from '$lib/components/Canvas.svelte';
  import Inspector from '$lib/components/Inspector.svelte';
  import PlaybackBar from '$lib/components/PlaybackBar.svelte';
  import Settings from '$lib/components/Settings.svelte';
  import Toolbar from '$lib/components/Toolbar.svelte';
  import { history } from '$lib/history/history.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { appAutoSave, appNew, appOpen, appSave, appSaveAs } from '$lib/io/actions';
  import { isTauriContext } from '$lib/io/scenarioFile';
  import { store } from '$lib/store/scenarioStore.svelte';
  import { toJson } from '$lib/model/serialize';

  /** Délai après la dernière modification avant la sauvegarde auto. */
  const AUTO_SAVE_DEBOUNCE_MS = 2000;

  // Toast partagé : Toolbar/Canvas/Settings émettent, la page affiche.
  let toastMsg = $state<string>('');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function showToast(msg: string): void {
    toastMsg = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMsg = '';
    }, 1800);
  }

  // État de la modale Paramètres
  let settingsOpen = $state<boolean>(false);
  function openSettings(): void {
    settingsOpen = true;
  }
  function closeSettings(): void {
    settingsOpen = false;
  }

  /**
   * Raccourcis clavier globaux pour annuler/rétablir (jalon 12).
   * - Ctrl+Z (Cmd+Z sur macOS) : annuler
   * - Ctrl+Y ou Ctrl+Shift+Z : rétablir
   *
   * On ignore l'événement si le focus est dans un champ texte —
   * dans un input, Ctrl+Z doit faire l'undo natif du navigateur sur
   * la frappe, pas l'undo de l'app.
   */
  function isInTextInput(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return target.isContentEditable;
  }

  function handleKeyDown(e: KeyboardEvent): void {
    const ctrl = e.ctrlKey || e.metaKey; // Cmd sur macOS
    if (!ctrl) return;
    const key = e.key.toLowerCase();

    // Undo / Redo : ignorés si le focus est dans un champ texte
    // (pour ne pas écraser l'undo natif du navigateur sur la frappe).
    if (key === 'z' && !e.shiftKey) {
      if (isInTextInput(e.target)) return;
      e.preventDefault();
      if (history.undo()) showToast(t('toast.undone'));
      return;
    }
    if ((key === 'z' && e.shiftKey) || key === 'y') {
      if (isInTextInput(e.target)) return;
      e.preventDefault();
      if (history.redo()) showToast(t('toast.redone'));
      return;
    }

    // Raccourcis fichier (jalon 18). On les laisse passer même depuis
    // un champ texte — Ctrl+S dans une textarea n'a pas d'action native
    // utile (le navigateur essaierait de sauvegarder la page entière),
    // donc autant faire la sauvegarde de l'app.
    if (key === 'n') {
      e.preventDefault();
      appNew(showToast);
      return;
    }
    if (key === 'o') {
      e.preventDefault();
      void appOpen(showToast);
      return;
    }
    if (key === 's') {
      e.preventDefault();
      if (e.shiftKey) {
        void appSaveAs(showToast);
      } else {
        void appSave(showToast);
      }
      return;
    }
  }

  // ============================================================
  // Sauvegarde auto débouncée (jalon 18)
  // ============================================================
  // Dès que le scénario est marqué `modified` ET qu'il a un chemin
  // courant (i.e. l'utilisateur a déjà fait Save As au moins une fois),
  // on déclenche un timer de 2 s. Toute nouvelle modification réinitialise
  // le timer. Si rien ne bouge pendant 2 s, on sauvegarde silencieusement.
  // Hors Tauri (preview navigateur), no-op : pas d'accès filesystem.
  $effect(() => {
    if (!isTauriContext()) return;
    if (!store.modified || !store.currentPath) return;
    // Lecture explicite du contenu sérialisé pour faire dépendre cet
    // effet de chaque mutation profonde du scénario. Sans ça, l'effet
    // ne re-run pas après la première modification (modified reste true).
    void toJson(store.scenario);

    const tid = setTimeout(() => {
      void appAutoSave(showToast);
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => clearTimeout(tid);
  });

  // ============================================================
  // Confirmation à la fermeture si modifications non sauvegardées
  // (jalon 18). Plugin dialog Tauri non requis : on utilise window.confirm,
  // que le webview Tauri sait afficher.
  // ============================================================
  $effect(() => {
    if (!isTauriContext()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          if (!store.modified) return;
          const ok = window.confirm(t('confirm.quitUnsaved'));
          if (!ok) {
            event.preventDefault();
          }
        });
        if (cancelled && unlisten) unlisten();
      } catch (e) {
        console.warn('[close-handler]', e);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  });
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="app">
  <Toolbar onToast={showToast} onOpenSettings={openSettings} />
  <Breadcrumb />

  <div class="main">
    <Canvas onToast={showToast} />
    <Inspector onToast={showToast} />
  </div>

  <PlaybackBar onToast={showToast} />

  <Settings open={settingsOpen} onClose={closeSettings} onToast={showToast} />

  {#if toastMsg}
    <div class="toast">{toastMsg}</div>
  {/if}
</div>

<style>
  .app {
    height: 100vh;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
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
