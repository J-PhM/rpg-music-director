<script lang="ts">
  /**
   * Canvas SVG : rendu des nœuds visibles + drag pour déplacer + sélection.
   *
   * Pour le jalon 3 :
   * - Pas de zoom/pan (jalon 6) — coordonnées écran = coordonnées monde.
   * - Pas de connexions (jalon 4) — pas de ports affichés.
   * - Pas de navigation cartouche (jalon 5) — on n'affiche que la racine.
   *
   * Drag :
   * - `pointerdown` sur un nœud sélectionne + amorce le drag, et capture
   *   le pointeur sur la SVG racine. Cela garantit que `pointermove`/`up`
   *   arrivent toujours sur la SVG, même si le curseur sort du nœud
   *   pendant le drag.
   * - Hit-testing : on s'appuie sur le bubbling DOM (chaque nœud a son
   *   propre listener). Le hit-test mathématique critique mentionné dans
   *   le cahier concerne les **ports de connexion** (jalon 4) — pas le
   *   corps des nœuds.
   */

  import { isCartouche, type Node, type NodeId } from '$lib/model/types';
  import { store } from '$lib/store/scenarioStore.svelte';
  import { t } from '$lib/i18n/i18n.svelte';

  const NODE_W = 160;
  const NODE_H = 70;
  const CARTOUCHE_W = 280;
  const CARTOUCHE_H = 180;

  function dim(node: Node): { w: number; h: number } {
    return isCartouche(node)
      ? { w: CARTOUCHE_W, h: CARTOUCHE_H }
      : { w: NODE_W, h: NODE_H };
  }

  function getIcon(node: Node): string {
    switch (node.type) {
      case 'scene':
        return '🗺️';
      case 'character':
        return '👤';
      case 'stinger':
        return '✨';
      case 'cartouche':
        return '📁';
    }
  }

  function getSubtitle(node: Node): string {
    if (isCartouche(node)) {
      const childCount = store.scenario.nodes.filter((n) => n.parentId === node.id).length;
      if (childCount === 0) return t('inspector.contentCount.zero');
      if (childCount === 1) return t('inspector.contentCount.one');
      return t('inspector.contentCount.many', { n: childCount });
    }
    const loopMark = node.loop ? '🔁 ' : '▶ ';
    if (node.localFilePath) return loopMark + t('node.audio.local');
    if (node.ytUrl) return loopMark + t('node.audio.youtube');
    return '⚠ ' + t('node.audio.none');
  }

  // ============================================================
  // Drag
  // ============================================================

  let svgEl: SVGSVGElement;
  let dragId = $state<NodeId | null>(null);
  // Offset pointeur → coin haut-gauche du nœud, en coords monde. Pas
  // dans un $state : c'est de l'état interne au geste, pas réactif.
  let dragOffset = { x: 0, y: 0 };
  let dragMoved = false;

  function clientToSvgPoint(e: PointerEvent): { x: number; y: number } {
    const rect = svgEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleNodePointerDown(e: PointerEvent, node: Node): void {
    // Empêche la SVG de recevoir l'événement et de désélectionner.
    e.stopPropagation();
    if (e.button !== 0) return;

    store.select(node.id);

    const pt = clientToSvgPoint(e);
    dragOffset = { x: pt.x - node.x, y: pt.y - node.y };
    dragId = node.id;
    dragMoved = false;
    svgEl.setPointerCapture(e.pointerId);
  }

  function handleSvgPointerMove(e: PointerEvent): void {
    if (dragId === null) return;
    const pt = clientToSvgPoint(e);
    store.moveNode(dragId, pt.x - dragOffset.x, pt.y - dragOffset.y);
    dragMoved = true;
  }

  function handleSvgPointerUp(e: PointerEvent): void {
    if (dragId !== null) {
      try {
        svgEl.releasePointerCapture(e.pointerId);
      } catch {
        // peut lever si le pointeur n'est plus capturé (pointercancel)
      }
      dragId = null;
    }
  }

  function handleSvgPointerDown(e: PointerEvent): void {
    // Cet événement n'arrive ici que si aucun nœud ne l'a stoppé →
    // c'est un clic dans le vide → désélectionner.
    if (e.button !== 0) return;
    store.select(null);
  }
</script>

<div class="canvas-area">
  <svg
    bind:this={svgEl}
    role="presentation"
    onpointerdown={handleSvgPointerDown}
    onpointermove={handleSvgPointerMove}
    onpointerup={handleSvgPointerUp}
    onpointercancel={handleSvgPointerUp}
  >
    {#each store.visibleNodes as node (node.id)}
      {@const d = dim(node)}
      {@const isSelected = store.selectedId === node.id}
      {@const subtitle = getSubtitle(node)}
      <g
        class="node {node.type}"
        class:selected={isSelected}
        class:dragging={dragId === node.id}
        transform="translate({node.x},{node.y})"
        onpointerdown={(e) => handleNodePointerDown(e, node)}
        role="button"
        tabindex="-1"
        aria-label={node.title}
      >
        <rect class="node-bg" width={d.w} height={d.h} rx="8" />

        {#if isCartouche(node)}
          <text class="node-icon" x="28" y="36" font-size="24">{getIcon(node)}</text>
          <text class="node-title cartouche-title" x={d.w / 2} y="38" font-size="16">
            {node.title.length > 22 ? node.title.slice(0, 21) + '…' : node.title}
          </text>
          <text class="cartouche-count" x={d.w / 2} y="62" text-anchor="middle">{subtitle}</text>
        {:else}
          <text class="node-icon" x="22" y="28">{getIcon(node)}</text>
          <text class="node-title" x={d.w / 2 + 10} y="28">
            {node.title.length > 16 ? node.title.slice(0, 15) + '…' : node.title}
          </text>
          <text class="node-subtitle" x={d.w / 2} y="50">{subtitle}</text>
        {/if}
      </g>
    {/each}
  </svg>

  {#if store.visibleNodes.length === 0}
    <div class="empty-hint">
      <p>{t('empty.canvas')}</p>
    </div>
  {/if}
</div>

<style>
  .canvas-area {
    position: relative;
    overflow: hidden;
    background: var(--paper);
    height: 100%;
    width: 100%;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
    cursor: default;
  }

  /* ============================================================
     Nœuds — fond et bordures
     ============================================================ */

  .node {
    user-select: none;
    cursor: move;
  }
  .node.dragging {
    cursor: grabbing;
  }

  .node-bg {
    stroke: var(--rule);
    stroke-width: 1;
    transition: stroke var(--t-fast) var(--ease);
  }
  .node.selected .node-bg {
    stroke: var(--highlight);
    stroke-width: 2;
  }

  .node.scene .node-bg {
    fill: var(--node-scene);
  }
  .node.character .node-bg {
    fill: var(--node-character);
  }
  .node.stinger .node-bg {
    fill: var(--node-stinger);
  }
  .node.cartouche .node-bg {
    fill: var(--node-cartouche);
    stroke: var(--accent-soft);
    stroke-dasharray: 3 2;
  }
  .node.cartouche.selected .node-bg {
    stroke: var(--highlight);
    stroke-dasharray: none;
  }

  /* ============================================================
     Textes des nœuds
     ============================================================ */

  .node-icon {
    font-size: 18px;
    fill: var(--ink);
    text-anchor: middle;
    pointer-events: none;
  }

  .node-title {
    font-family: var(--font-text);
    font-size: 14px;
    font-weight: 500;
    fill: var(--ink);
    text-anchor: middle;
    pointer-events: none;
  }

  .node-title.cartouche-title {
    font-size: 16px;
  }

  .node-subtitle {
    font-family: var(--font-mono);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    fill: var(--ink-soft);
    text-anchor: middle;
    pointer-events: none;
  }

  .cartouche-count {
    font-family: var(--font-text);
    font-size: 11px;
    font-style: italic;
    fill: var(--ink-soft);
    pointer-events: none;
  }

  /* ============================================================
     Indication d'état vide
     ============================================================ */

  .empty-hint {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    padding: 32px;
  }
  .empty-hint p {
    max-width: 420px;
    text-align: center;
    font-style: italic;
    color: var(--ink-soft);
    line-height: 1.55;
  }
</style>
