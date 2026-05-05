<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import { isTauriContext } from '$lib/io/scenarioFile';
  import {
    appLoadExample,
    appNew,
    appOpen,
    appOpenPath,
    appSave,
    appSaveAs,
  } from '$lib/io/actions';
  import { titleFromPath } from '$lib/io/dragDrop';
  import { clearRecents, loadRecents } from '$lib/io/recents';
  import { store } from '$lib/store/scenarioStore.svelte';
  import { history } from '$lib/history/history.svelte';
  import type { NodeType } from '$lib/model/types';

  interface Props {
    onToast: (msg: string) => void;
    onOpenSettings: () => void;
  }
  let { onToast, onOpenSettings }: Props = $props();

  const APP_VERSION = '0.1.0';

  let inTauri = $state(false);

  // onMount-équivalent en runes : un effect qui ne tourne qu'une fois.
  $effect(() => {
    inTauri = isTauriContext();
  });

  // ============================================================
  // Actions fichiers — délégation au module `io/actions.ts`
  // (réutilisé par les raccourcis clavier dans +page.svelte)
  // ============================================================

  function handleNew(): void {
    appNew(onToast);
  }
  function handleLoadExample(): void {
    appLoadExample(onToast);
  }
  function handleOpen(): void {
    void appOpen(onToast);
  }
  function handleSave(): void {
    void appSave(onToast);
  }
  function handleSaveAs(): void {
    void appSaveAs(onToast);
  }

  // ============================================================
  // Indicateur "✓ Enregistré" : flash 1.5 s après chaque save.
  // S'efface dès la première modification suivante.
  // ============================================================
  let showSavedFlash = $state(false);
  $effect(() => {
    if (store.lastSavedAt === null) return;
    showSavedFlash = true;
    const tid = setTimeout(() => {
      showSavedFlash = false;
    }, 1500);
    return () => clearTimeout(tid);
  });

  // ============================================================
  // Menu Récents (jalon 18). On recharge la liste à chaque ouverture
  // pour refléter les ajouts faits par appSave/appSaveAs.
  // ============================================================
  let recentsOpen = $state(false);
  let recents = $state<string[]>([]);
  let recentsRoot: HTMLElement | undefined = $state();

  function toggleRecents(): void {
    if (!recentsOpen) {
      recents = loadRecents();
    }
    recentsOpen = !recentsOpen;
  }

  function handleRecentClick(path: string): void {
    recentsOpen = false;
    void appOpenPath(onToast, path);
  }

  function handleClearRecents(): void {
    clearRecents();
    recents = [];
    recentsOpen = false;
    onToast(t('toolbar.recents.cleared'));
  }

  // Fermeture sur clic en dehors et sur Échap.
  $effect(() => {
    if (!recentsOpen) return;
    function onPointerDown(e: PointerEvent): void {
      if (recentsRoot && !recentsRoot.contains(e.target as Node)) {
        recentsOpen = false;
      }
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') recentsOpen = false;
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  });

  // ============================================================
  // Actions nœuds
  // ============================================================

  /**
   * Position d'apparition d'un nouveau nœud : on cascade pour ne pas
   * empiler les nouveautés au même endroit. Les jalons 6 (zoom/pan) et
   * 5 (cartouches) raffineront ce calcul (centre de la vue, etc.).
   */
  function nextSpawnPosition(): { x: number; y: number } {
    const count = store.visibleNodes.length;
    const offset = (count % 6) * 30;
    return { x: 80 + offset, y: 80 + offset };
  }

  function handleAdd(type: NodeType): void {
    history.snapshot('Ajouter ' + t(`node.type.${type}` as const));
    const { x, y } = nextSpawnPosition();
    store.addNode(type, x, y);
    onToast(t('toast.nodeAdded'));
  }

  function handleDelete(): void {
    if (store.selectedId === null) {
      onToast(t('toast.nothingSelected'));
      return;
    }
    const selected = store.selectedNode;
    if (selected?.type === 'cartouche') {
      const childCount = store.scenario.nodes.filter((n) => n.parentId === selected.id).length;
      if (
        childCount > 0 &&
        !confirm(t('confirm.deleteCartoucheWithChildren', { title: selected.title, n: childCount }))
      ) {
        return;
      }
    }
    history.snapshot('Supprimer');
    const n = store.deleteNode(store.selectedId);
    onToast(n > 1 ? t('toast.nodesDeleted', { n }) : t('toast.nodeDeleted'));
  }

  // ============================================================
  // Undo / Redo (jalon 12)
  // ============================================================

  function handleUndo(): void {
    if (history.undo()) {
      onToast(t('toast.undone'));
    } else {
      onToast(t('toast.cantUndo'));
    }
  }

  function handleRedo(): void {
    if (history.redo()) {
      onToast(t('toast.redone'));
    } else {
      onToast(t('toast.cantRedo'));
    }
  }
</script>

<header class="toolbar">
  <h1 class="brand display">
    {t('toolbar.appName')}
    <span class="version kicker">v{APP_VERSION}</span>
  </h1>

  <span class="mode-badge" class:play={store.mode === 'play'}>
    {store.mode === 'play' ? t('mode.play') : t('mode.edit')}
  </span>

  <div class="group">
    <button class="btn" type="button" onclick={handleNew}>{t('toolbar.new')}</button>
    <button
      class="btn"
      type="button"
      onclick={handleOpen}
      disabled={!inTauri}
      title={inTauri ? '' : t('toolbar.tooltip.tauriOnly')}
    >
      {t('toolbar.open')}
    </button>
    <div class="recents-wrap" bind:this={recentsRoot}>
      <button
        class="btn recents-toggle"
        type="button"
        onclick={toggleRecents}
        disabled={!inTauri}
        title={inTauri ? t('toolbar.recents.tooltip') : t('toolbar.tooltip.tauriOnly')}
        aria-haspopup="menu"
        aria-expanded={recentsOpen}
      >
        {t('toolbar.recents')}<span class="caret" aria-hidden="true">▾</span>
      </button>
      {#if recentsOpen}
        <div class="recents-menu" role="menu">
          {#if recents.length === 0}
            <p class="recents-empty">{t('toolbar.recents.empty')}</p>
          {:else}
            {#each recents as path (path)}
              <button
                class="recents-item"
                type="button"
                role="menuitem"
                onclick={() => handleRecentClick(path)}
              >
                <span class="recents-name">{titleFromPath(path, 36)}</span>
                <span class="recents-path">{path}</span>
              </button>
            {/each}
            <hr class="recents-sep" />
            <button
              class="recents-item recents-clear"
              type="button"
              role="menuitem"
              onclick={handleClearRecents}
            >{t('toolbar.recents.clear')}</button>
          {/if}
        </div>
      {/if}
    </div>
    <button
      class="btn"
      type="button"
      onclick={handleSave}
      disabled={!inTauri}
      title={inTauri ? '' : t('toolbar.tooltip.tauriOnly')}
    >
      {t('toolbar.save')}
    </button>
    <button
      class="btn"
      type="button"
      onclick={handleSaveAs}
      disabled={!inTauri}
      title={inTauri ? '' : t('toolbar.tooltip.tauriOnly')}
    >
      {t('toolbar.saveAs')}
    </button>
    <button class="btn ghost" type="button" onclick={handleLoadExample}>
      {t('toolbar.example')}
    </button>
  </div>

  <div class="separator"></div>

  <div class="group">
    <button
      class="btn"
      type="button"
      onclick={() => handleAdd('scene')}
      disabled={store.mode === 'play'}
      title={store.mode === 'play' ? t('mode.tooltip.noEditInPlay') : ''}
    >{t('toolbar.addScene')}</button>
    <button
      class="btn"
      type="button"
      onclick={() => handleAdd('character')}
      disabled={store.mode === 'play'}
      title={store.mode === 'play' ? t('mode.tooltip.noEditInPlay') : ''}
    >{t('toolbar.addCharacter')}</button>
    <button
      class="btn"
      type="button"
      onclick={() => handleAdd('stinger')}
      disabled={store.mode === 'play'}
      title={store.mode === 'play' ? t('mode.tooltip.noEditInPlay') : ''}
    >{t('toolbar.addStinger')}</button>
    <button
      class="btn"
      type="button"
      onclick={() => handleAdd('cartouche')}
      disabled={store.mode === 'play'}
      title={store.mode === 'play' ? t('mode.tooltip.noEditInPlay') : ''}
    >{t('toolbar.addCartouche')}</button>
    <button
      class="btn danger"
      type="button"
      onclick={handleDelete}
      disabled={store.selectedId === null || store.mode === 'play'}
      title={store.mode === 'play' ? t('mode.tooltip.noEditInPlay') : ''}
    >{t('toolbar.delete')}</button>
    <button
      class="btn eraser-btn"
      class:eraser-active={store.eraserMode}
      type="button"
      onclick={() => store.toggleEraser()}
      disabled={store.mode === 'play'}
      title={store.mode === 'play' ? t('toolbar.tooltip.eraserNotInPlay') : ''}
    >{t('toolbar.eraser')}</button>
  </div>

  <div class="group right">
    <button
      class="btn undo-btn"
      type="button"
      onclick={handleUndo}
      disabled={!history.canUndo}
      title={t('toolbar.tooltip.undo')}
      aria-label={t('toolbar.undo')}
    >↶</button>
    <button
      class="btn redo-btn"
      type="button"
      onclick={handleRedo}
      disabled={!history.canRedo}
      title={t('toolbar.tooltip.redo')}
      aria-label={t('toolbar.redo')}
    >↷</button>
    <button class="btn" type="button" onclick={() => store.recadrer()}>
      {t('toolbar.recadrer')}
    </button>
    <button
      class="btn primary"
      type="button"
      onclick={() => store.toggleMode()}
    >
      {store.mode === 'play' ? t('toolbar.modeEdit') : t('toolbar.modePlay')}
    </button>
    <button
      class="btn settings-btn"
      type="button"
      onclick={onOpenSettings}
      title={t('toolbar.settings')}
      aria-label={t('toolbar.settings')}
    >⚙</button>
    {#if store.modified}
      <span class="modified" title={t('state.modifiedTooltip')}>●&nbsp;{t('state.modified')}</span>
    {:else if showSavedFlash}
      <span class="saved" title={t('state.savedTooltip')}>✓&nbsp;{t('state.saved')}</span>
    {/if}
  </div>
</header>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 24px;
    background: var(--paper-soft);
    border-bottom: 1px solid var(--rule);
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .brand {
    font-size: 22px;
    font-style: italic;
    margin: 0;
    line-height: 1;
    flex-shrink: 0;
  }

  .version {
    margin-left: 6px;
    vertical-align: middle;
    font-style: normal;
  }

  .group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .group.right {
    margin-left: auto;
  }

  .separator {
    flex: 1;
  }

  .settings-btn {
    font-size: 14px;
    padding: 4px 10px;
    line-height: 1;
    letter-spacing: 0;
  }

  /* Boutons Undo / Redo (jalon 12) — caractères symboliques larges */
  .undo-btn,
  .redo-btn {
    font-size: 16px;
    padding: 4px 10px;
    line-height: 1;
    letter-spacing: 0;
  }

  .modified {
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--warm);
    padding-left: 8px;
    flex-shrink: 0;
  }

  .saved {
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--playing);
    padding-left: 8px;
    flex-shrink: 0;
    /* Apparition douce du flash, le retrait est immédiat (le composant se démonte). */
    animation: saved-in 200ms var(--ease) both;
  }

  @keyframes saved-in {
    from {
      opacity: 0;
      transform: translateY(-2px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  /* Menu Récents (jalon 18) */
  .recents-wrap {
    position: relative;
  }
  .recents-toggle {
    /* Plus compact : on a juste un libellé + un chevron, pas besoin du
       padding standard d'un bouton textuel large. */
    padding: 6px 10px 6px 12px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .caret {
    font-size: 9px;
    line-height: 1;
    color: var(--accent);
    margin-left: 2px;
  }
  .recents-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 320px;
    max-width: 480px;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 2px;
    box-shadow: 0 6px 18px rgba(20, 16, 10, 0.18);
    z-index: 50;
    animation: recents-in 150ms var(--ease) both;
    padding: 4px 0;
  }
  @keyframes recents-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .recents-empty {
    margin: 8px 14px;
    color: var(--ink-soft);
    font-size: 12px;
    font-style: italic;
  }
  .recents-item {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 7px 14px;
    font-family: inherit;
    color: var(--ink);
    transition:
      background var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease);
  }
  .recents-item:hover {
    background: var(--paper-deep);
  }
  .recents-name {
    display: block;
    font-style: italic;
    font-size: 13px;
    line-height: 1.3;
  }
  .recents-path {
    display: block;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--ink-soft);
    line-height: 1.3;
    margin-top: 1px;
    word-break: break-all;
  }
  .recents-sep {
    border: none;
    border-top: 1px solid var(--rule-soft);
    margin: 4px 0;
  }
  .recents-clear {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-family: var(--font-mono);
    color: var(--ink-soft);
  }
  .recents-clear:hover {
    color: var(--warm);
  }

  /* Bouton Gomme actif : couleur terre cuite appuyée (cf. cahier) */
  .eraser-btn.eraser-active {
    background: var(--warm);
    color: var(--paper);
    border-color: var(--warm);
  }
  .eraser-btn.eraser-active:hover:not(:disabled) {
    background: var(--warm);
    color: var(--paper);
    border-color: var(--warm);
    opacity: 0.92;
  }

  /* Badge de mode (jalon 8) */
  .mode-badge {
    font-family: var(--font-mono);
    background: transparent;
    color: var(--accent);
    padding: 4px 10px;
    border: 1px solid var(--rule);
    border-radius: 2px;
    font-size: 9px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    flex-shrink: 0;
    transition: all var(--t-fast) var(--ease);
  }
  .mode-badge.play {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }
</style>
