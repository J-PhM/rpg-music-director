<script lang="ts">
  /**
   * Panneau Inspecteur — édition du nœud sélectionné.
   *
   * **Anti-piège proto v9 :** on ne re-rend pas l'inspecteur sur chaque
   * keystroke. La technique :
   * - `selectedNode` est lu via `$derived` depuis le store, qui retourne
   *   la même référence d'objet tant que la sélection ne change pas.
   * - `bind:value={selectedNode.title}` met à jour la propriété sur place.
   * - Svelte 5 a une réactivité fine : seul l'attribut `value` du champ
   *   est mis à jour, pas le composant entier. Le focus est préservé.
   *
   * Le DOM ne re-monte que quand `selectedNode` change (= autre nœud
   * sélectionné, ce qui justifie une perte de focus).
   */

  import { isCartouche, isAudioNode, type AudioNode, type CartoucheNode, type NodeId } from '$lib/model/types';
  import { store } from '$lib/store/scenarioStore.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { engine } from '$lib/audio/engine.svelte';
  import { history } from '$lib/history/history.svelte';
  import { isTauriContext, pickAudioFiles } from '$lib/io/scenarioFile';
  import { titleFromPath } from '$lib/io/dragDrop';

  // === Snapshot par session d'édition (jalon 12) ===
  // Une "session" = entre focus et blur d'un champ. Un snapshot est
  // capturé au focus, poussé à l'historique au blur si l'état a changé.
  // Donne une granularité naturelle d'undo : un clic dans un champ +
  // édition + clic ailleurs = une étape annulable.
  let editStartSnapshot: string | null = null;
  function handleEditFocus(): void {
    if (editStartSnapshot === null) {
      editStartSnapshot = history.currentSnapshot();
    }
  }
  function handleEditBlur(): void {
    if (editStartSnapshot !== null) {
      history.pushExplicit(editStartSnapshot, 'Édition');
      editStartSnapshot = null;
    }
  }

  interface Props {
    onToast: (msg: string) => void;
  }
  let { onToast }: Props = $props();

  function handleTest(node: AudioNode): void {
    // Le moteur (jalon 17) aiguille vers Web Audio ou YouTube selon
    // ce qui est attaché. Si rien n'est attaché, pushLayer/playStinger
    // throw avec un message explicite — capté par le .catch.
    const promise =
      node.type === 'stinger'
        ? engine.playStinger(node)
        : engine.pushLayer(node, node.type);
    const okKey = node.type === 'stinger' ? 'toast.audioStinger' : 'toast.audioPushed';
    promise
      .then(() => onToast(t(okKey, { title: node.title })))
      .catch((e) =>
        onToast(t('toast.audioError', { msg: e instanceof Error ? e.message : String(e) })),
      );
  }

  function handleStopOne(node: AudioNode): void {
    engine.popLayerByNodeId(node.id);
  }

  // === Actions playlist fleuve (jalon 15) ===
  // Pattern undo : on capture un snapshot AVANT la mutation et on
  // l'empile via pushExplicit APRÈS. Ouvrir le dialog Tauri perd le
  // focus de l'éventuel champ en édition — pas de risque de double
  // snapshot car les boutons ne sont pas dans le flot focus/blur.
  function addTracks(cartoucheId: NodeId): void {
    if (!isTauriContext()) return; // Bouton désactivé en preview, garde-fou.
    const snap = history.currentSnapshot();
    pickAudioFiles()
      .then((paths) => {
        if (paths.length === 0) return;
        store.addBgPlaylistTracks(cartoucheId, paths);
        history.pushExplicit(snap, 'Ajout morceaux playlist');
        onToast(t('toast.tracksAdded', { n: paths.length }));
      })
      .catch((e) => {
        onToast(t('toast.audioError', { msg: e instanceof Error ? e.message : String(e) }));
      });
  }

  function moveTrack(cartoucheId: NodeId, from: number, to: number): void {
    const snap = history.currentSnapshot();
    store.reorderBgPlaylistTrack(cartoucheId, from, to);
    history.pushExplicit(snap, 'Réordonner playlist');
  }

  function removeTrack(cartoucheId: NodeId, index: number): void {
    const snap = history.currentSnapshot();
    store.removeBgPlaylistTrack(cartoucheId, index);
    history.pushExplicit(snap, 'Retirer morceau playlist');
  }

  // Type narrowing — selectedNode est NodeUnion, on récupère des
  // références fortement typées pour les blocs spécialisés.
  const audioNode = $derived.by((): AudioNode | null => {
    const n = store.selectedNode;
    return n && isAudioNode(n) ? n : null;
  });

  const cartoucheNode = $derived.by((): CartoucheNode | null => {
    const n = store.selectedNode;
    return n && isCartouche(n) ? n : null;
  });

  const childCountForCartouche = $derived.by((): number => {
    if (!cartoucheNode) return 0;
    return store.scenario.nodes.filter((n) => n.parentId === cartoucheNode.id).length;
  });
</script>

<aside class="inspector">
  <h2 class="kicker heading">{t('inspector.heading')}</h2>

  {#if !store.selectedNode}
    <p class="empty">{t('empty.inspector')}</p>
  {:else if audioNode}
    {@const node = audioNode}
    <p class="type-label display">{t(`node.type.${node.type}` as const)}</p>
    <p class="type-hint">{t(`node.hint.${node.type}` as const)}</p>

    <label class="label" for="i-title">{t('inspector.fields.title')}</label>
    <input
      id="i-title"
      class="field"
      type="text"
      bind:value={node.title}
      onfocus={handleEditFocus}
      onblur={handleEditBlur}
    />

    <!-- Statut du fichier audio (drag-and-drop arrive au jalon 7) -->
    {#if node.localFilePath}
      <div class="file-status local">
        <strong>{t('inspector.fileStatus.local')} :</strong>
        <span class="path-mono">{node.localFilePath}</span>
      </div>
    {/if}

    <label class="label" for="i-yt">{t('inspector.fields.ytUrl')}</label>
    <input
      id="i-yt"
      class="field"
      type="text"
      bind:value={node.ytUrl}
      placeholder="https://www.youtube.com/watch?v=…"
      disabled={!!node.localFilePath}
      onfocus={handleEditFocus}
      onblur={handleEditBlur}
    />

    <label class="label loop-label">
      <input
        type="checkbox"
        bind:checked={node.loop}
        onpointerdown={handleEditFocus}
        onchange={handleEditBlur}
      />
      <span>{t('inspector.fields.loop')}</span>
    </label>

    <label class="label" for="i-notes">{t('inspector.fields.notes')}</label>
    <textarea
      id="i-notes"
      class="field"
      bind:value={node.notes}
      placeholder={t('inspector.fields.notesPlaceholder')}
      onfocus={handleEditFocus}
      onblur={handleEditBlur}
    ></textarea>

    <div class="audio-actions">
      <button
        class="btn primary"
        type="button"
        onclick={() => handleTest(node)}
      >{t('inspector.actions.test')}</button>
      <button
        class="btn"
        type="button"
        onclick={() => handleStopOne(node)}
      >{t('inspector.actions.stop')}</button>
    </div>

    <p class="hint">{t('inspector.fileHint')}</p>
  {:else if cartoucheNode}
    {@const node = cartoucheNode}
    <p class="type-label display">{t('node.type.cartouche')}</p>
    <p class="type-hint">{t('node.hint.cartouche')}</p>

    <label class="label" for="i-title">{t('inspector.fields.title')}</label>
    <input
      id="i-title"
      class="field"
      type="text"
      bind:value={node.title}
      onfocus={handleEditFocus}
      onblur={handleEditBlur}
    />

    <fieldset class="bg-block">
      <legend class="kicker">{t('node.type.cartouche')} · Fond</legend>
      <p class="bg-hint">{t('inspector.bgHint')}</p>

      {#if node.bgLocalFilePath}
        <div class="file-status local">
          <strong>{t('inspector.fileStatus.bgLocal')} :</strong>
          <span class="path-mono">{node.bgLocalFilePath}</span>
        </div>
      {/if}

      <label class="label" for="i-bg-yt">{t('inspector.fields.bgYtUrl')}</label>
      <input
        id="i-bg-yt"
        class="field"
        type="text"
        bind:value={node.bgYtUrl}
        placeholder="https://www.youtube.com/watch?v=…"
        disabled={!!node.bgLocalFilePath}
        onfocus={handleEditFocus}
        onblur={handleEditBlur}
      />

      <label class="label" for="i-bg-mode">{t('inspector.fields.bgPlaylistMode')}</label>
      <select
        id="i-bg-mode"
        class="field"
        bind:value={node.bgPlaylistMode}
        onfocus={handleEditFocus}
        onchange={handleEditBlur}
      >
        <option value="single">{t('inspector.fields.bgPlaylistMode.single')}</option>
        <option value="sequential">{t('inspector.fields.bgPlaylistMode.sequential')}</option>
      </select>

      {#if node.bgPlaylistMode === 'sequential'}
        <p class="playlist-hint">{t('inspector.bg.playlist.hint')}</p>

        {#if node.bgPlaylistIds.length === 0}
          <p class="playlist-empty">{t('inspector.bg.playlist.empty')}</p>
        {:else}
          <ol class="playlist">
            {#each node.bgPlaylistIds as path, i}
              <li class="playlist-item">
                <span class="playlist-index">{i + 1}.</span>
                <span class="playlist-track">
                  <span class="playlist-title">{titleFromPath(path, 50)}</span>
                  <span class="playlist-path">{path}</span>
                </span>
                <span class="playlist-actions">
                  <button
                    type="button"
                    class="micro-btn"
                    title={t('inspector.bg.playlist.upTooltip')}
                    aria-label={t('inspector.bg.playlist.upTooltip')}
                    disabled={i === 0}
                    onclick={() => moveTrack(node.id, i, i - 1)}
                  >{t('inspector.bg.playlist.up')}</button>
                  <button
                    type="button"
                    class="micro-btn"
                    title={t('inspector.bg.playlist.downTooltip')}
                    aria-label={t('inspector.bg.playlist.downTooltip')}
                    disabled={i === node.bgPlaylistIds.length - 1}
                    onclick={() => moveTrack(node.id, i, i + 1)}
                  >{t('inspector.bg.playlist.down')}</button>
                  <button
                    type="button"
                    class="micro-btn danger"
                    title={t('inspector.bg.playlist.removeTooltip')}
                    aria-label={t('inspector.bg.playlist.removeTooltip')}
                    onclick={() => removeTrack(node.id, i)}
                  >{t('inspector.bg.playlist.remove')}</button>
                </span>
              </li>
            {/each}
          </ol>
        {/if}

        <button
          type="button"
          class="btn add-track-btn"
          disabled={!isTauriContext()}
          onclick={() => addTracks(node.id)}
        >{t('inspector.bg.playlist.add')}</button>
      {/if}
    </fieldset>

    <label class="label" for="i-notes">{t('inspector.fields.notes')}</label>
    <textarea
      id="i-notes"
      class="field"
      bind:value={node.notes}
      placeholder={t('inspector.fields.notesPlaceholder')}
      onfocus={handleEditFocus}
      onblur={handleEditBlur}
    ></textarea>

    <div class="content-count kicker">
      {childCountForCartouche === 0
        ? t('inspector.contentCount.zero')
        : childCountForCartouche === 1
          ? t('inspector.contentCount.one')
          : t('inspector.contentCount.many', { n: childCountForCartouche })}
    </div>

    <button
      class="btn primary enter-btn"
      type="button"
      onclick={() => store.enterCartouche(node.id)}
    >
      {t('inspector.actions.enterCartouche')}
    </button>

    <p class="hint">{t('inspector.fileHintCartouche')}</p>
  {/if}
</aside>

<style>
  .inspector {
    width: 340px;
    background: var(--paper-soft);
    border-left: 1px solid var(--rule);
    overflow-y: auto;
    padding: 24px;
    flex-shrink: 0;
    height: 100%;
  }

  .heading {
    margin: 0 0 4px;
  }
  .heading::after {
    content: '';
    display: block;
    width: 40px;
    height: 1px;
    background: var(--rule);
    margin: 8px 0 16px;
  }

  .empty {
    color: var(--ink-soft);
    font-style: italic;
    font-size: 14px;
    margin-top: 20px;
    line-height: 1.5;
  }

  .type-label {
    font-size: 22px;
    margin-bottom: 4px;
  }

  .type-hint {
    color: var(--ink-soft);
    font-size: 13px;
    margin-bottom: 16px;
    font-style: italic;
    line-height: 1.45;
  }

  .file-status {
    background: var(--paper);
    padding: 10px;
    border-radius: 2px;
    margin-top: 10px;
    margin-bottom: 4px;
    font-size: 13px;
    line-height: 1.45;
    border-left: 2px solid var(--playing);
    font-style: italic;
    color: var(--ink);
  }
  .file-status strong {
    font-style: normal;
    font-weight: 500;
  }
  .file-status .path-mono {
    display: block;
    margin-top: 4px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-soft);
    word-break: break-all;
  }

  /* Les checkboxes : un peu de remise en forme pour l'alignement */
  .loop-label {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 18px;
    text-transform: none;
    letter-spacing: 0;
    color: var(--ink);
    font-family: var(--font-text);
    font-size: 13px;
    font-style: italic;
    cursor: pointer;
  }
  .loop-label input[type='checkbox'] {
    width: auto;
    margin: 0;
    cursor: pointer;
  }

  .bg-block {
    margin-top: 24px;
    padding: 14px;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 2px;
  }
  .bg-block legend {
    padding: 0 6px;
  }
  .bg-hint {
    color: var(--ink-soft);
    font-size: 12px;
    font-style: italic;
    line-height: 1.5;
    margin-bottom: 12px;
  }

  .content-count {
    display: inline-block;
    margin-top: 16px;
    padding: 8px 12px;
    background: var(--paper);
    border-radius: 2px;
  }

  .enter-btn {
    display: block;
    width: 100%;
    margin-top: 14px;
    text-align: center;
  }

  /* Boutons Tester / Stop pour nœud audio */
  .audio-actions {
    display: flex;
    gap: 8px;
    margin-top: 18px;
  }
  .audio-actions .btn {
    flex: 1;
  }

  .hint {
    margin-top: 16px;
    font-size: 11px;
    color: var(--ink-soft);
    font-style: italic;
    line-height: 1.45;
  }

  /* Playlist fleuve (jalon 15) */
  .playlist-hint {
    margin: 14px 0 8px;
    font-size: 11px;
    color: var(--ink-soft);
    font-style: italic;
    line-height: 1.5;
  }
  .playlist-empty {
    margin: 0 0 10px;
    padding: 12px;
    text-align: center;
    font-size: 12px;
    font-style: italic;
    color: var(--ink-soft);
    border: 1px dashed var(--rule-soft);
    border-radius: 2px;
  }
  .playlist {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    border: 1px solid var(--rule-soft);
    border-radius: 2px;
    background: var(--paper-soft);
  }
  .playlist-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--rule-soft);
  }
  .playlist-item:last-child {
    border-bottom: none;
  }
  .playlist-index {
    color: var(--ink-soft);
    font-family: var(--font-mono);
    font-size: 11px;
    flex-shrink: 0;
    min-width: 22px;
    padding-top: 1px;
  }
  .playlist-track {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .playlist-title {
    color: var(--ink);
    font-size: 13px;
    font-style: italic;
    word-break: break-word;
    line-height: 1.3;
  }
  .playlist-path {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--ink-soft);
    word-break: break-all;
    line-height: 1.3;
  }
  .playlist-actions {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
  }
  .micro-btn {
    background: var(--paper);
    border: 1px solid var(--rule);
    color: var(--ink);
    cursor: pointer;
    padding: 2px 7px;
    font-size: 12px;
    border-radius: 2px;
    font-family: inherit;
    line-height: 1.4;
    transition:
      background 150ms cubic-bezier(0.22, 0.61, 0.36, 1),
      border-color 150ms cubic-bezier(0.22, 0.61, 0.36, 1),
      color 150ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  .micro-btn:hover:not(:disabled) {
    background: var(--paper-deep);
    border-color: var(--ink-soft);
  }
  .micro-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .micro-btn.danger:hover:not(:disabled) {
    background: var(--warm);
    border-color: var(--warm);
    color: var(--paper);
  }
  .add-track-btn {
    display: block;
    width: 100%;
    margin-top: 4px;
    text-align: center;
    font-size: 13px;
  }
</style>
