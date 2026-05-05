<script lang="ts">
  import { t } from '$lib/i18n/i18n.svelte';
  import {
    isTauriContext,
    openScenario,
    saveScenarioAs,
    saveScenarioToPath,
  } from '$lib/io/scenarioFile';
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
  // Actions fichiers
  // ============================================================

  function handleNew(): void {
    if (store.modified && !confirm(t('confirm.discardChanges'))) return;
    store.newScenario();
    onToast(t('toast.newScenario'));
  }

  function handleLoadExample(): void {
    if (store.modified && !confirm(t('confirm.discardChanges'))) return;
    store.loadExample();
    onToast(t('toast.exampleLoaded'));
  }

  async function handleOpen(): Promise<void> {
    try {
      const result = await openScenario();
      if (!result) return;
      store.loadScenario(result.scenario, result.path);

      const warnSuffix = result.warnings.length
        ? result.warnings.length === 1
          ? ' ' + t('toast.warningSuffix.one')
          : ' ' + t('toast.warningSuffix.many', { n: result.warnings.length })
        : '';
      onToast((result.migrated ? t('toast.openedMigrated') : t('toast.opened')) + warnSuffix);

      if (result.warnings.length) {
        for (const w of result.warnings) console.warn('[scenario]', w);
      }
    } catch (e) {
      onToast(t('toast.error', { msg: e instanceof Error ? e.message : String(e) }));
    }
  }

  async function handleSave(): Promise<void> {
    if (!store.currentPath) {
      await handleSaveAs();
      return;
    }
    try {
      await saveScenarioToPath(store.scenario, store.currentPath);
      store.markSaved(store.currentPath);
      onToast(t('toast.saved'));
    } catch (e) {
      onToast(t('toast.error', { msg: e instanceof Error ? e.message : String(e) }));
    }
  }

  async function handleSaveAs(): Promise<void> {
    try {
      const path = await saveScenarioAs(store.scenario);
      if (!path) return;
      store.markSaved(path);
      onToast(t('toast.saved'));
    } catch (e) {
      onToast(t('toast.error', { msg: e instanceof Error ? e.message : String(e) }));
    }
  }

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
