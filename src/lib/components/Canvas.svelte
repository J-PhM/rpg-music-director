<script lang="ts">
  /**
   * Canvas SVG : nœuds, connexions, ports, drag de déplacement et drag
   * de création de connexion.
   *
   * **Architecture du hit-testing (anti-piège proto v9) :**
   *
   * Tous les `pointerdown` du canvas sont captés au niveau de la SVG
   * racine. La détection de ce qui se trouve sous le curseur (port /
   * nœud / vide) se fait **par calcul mathématique sur les coordonnées
   * stockées dans le modèle**, pas via les éléments DOM. Raison : les
   * éléments SVG (notamment les petits cercles des ports) peuvent être
   * détruits / recréés à chaque re-render pendant un drag, ce qui
   * casserait l'interaction. Avec le calcul mathématique, l'identité
   * du nœud / port ne dépend que des coordonnées modèle qui restent
   * stables.
   *
   * Les connexions, elles, sont cliquables via un chemin invisible
   * épais (DOM-based) — c'est sûr car le clic sur connexion est un
   * événement discret, pas une interaction de drag.
   *
   * Pour le jalon 4 :
   * - Pas encore de zoom/pan (jalon 6) — coords écran = coords monde.
   * - Pas encore de navigation cartouche (jalon 5) — on n'affiche que
   *   les nœuds racine et les connexions dont les deux extrémités y sont.
   */

  import { isCartouche, type Node, type NodeId } from '$lib/model/types';
  import { store } from '$lib/store/scenarioStore.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { isTauriContext } from '$lib/io/scenarioFile';

  interface Props {
    onToast: (msg: string) => void;
  }
  let { onToast }: Props = $props();

  // ============================================================
  // Constantes de géométrie
  // ============================================================

  const NODE_W = 160;
  const NODE_H = 70;
  const CARTOUCHE_W = 280;
  const CARTOUCHE_H = 180;
  /** Rayon de hit-testing pour les ports (12 px en coords monde). */
  const PORT_R = 12;
  /** Rayon visuel des ports (un peu plus petit pour aération). */
  const PORT_VISUAL_R = 6;

  function dim(node: Node): { w: number; h: number } {
    return isCartouche(node)
      ? { w: CARTOUCHE_W, h: CARTOUCHE_H }
      : { w: NODE_W, h: NODE_H };
  }

  function getPortPos(node: Node, role: 'in' | 'out'): { x: number; y: number } {
    const { w, h } = dim(node);
    return {
      x: node.x + (role === 'out' ? w : 0),
      y: node.y + h / 2,
    };
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
  // Hit-testing mathématique
  // ============================================================

  interface PortHit {
    nodeId: NodeId;
    role: 'in' | 'out';
    x: number;
    y: number;
  }

  function findPortAt(wx: number, wy: number): PortHit | null {
    // On itère dans l'ordre normal — il n'y a pas de chevauchement
    // significatif des ports car ils sont à l'extérieur des nœuds.
    for (const node of store.visibleNodes) {
      for (const role of ['out', 'in'] as const) {
        const p = getPortPos(node, role);
        const dx = wx - p.x;
        const dy = wy - p.y;
        if (dx * dx + dy * dy <= PORT_R * PORT_R) {
          return { nodeId: node.id, role, x: p.x, y: p.y };
        }
      }
    }
    return null;
  }

  function findNodeAt(wx: number, wy: number): Node | null {
    // Itération en sens inverse → le dernier nœud dessiné (au-dessus)
    // a la priorité pour le clic.
    const nodes = store.visibleNodes;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const { w, h } = dim(n);
      if (wx >= n.x && wx <= n.x + w && wy >= n.y && wy <= n.y + h) return n;
    }
    return null;
  }

  // ============================================================
  // Connexions visibles dans le cartouche courant
  // ============================================================

  /**
   * Index des connexions à afficher comme courbes (extrémités toutes
   * deux dans le cartouche courant). Utilise `with` pour garder l'index
   * réel dans `store.scenario.connections` — utile pour la suppression.
   *
   * Au jalon 5 on rendra aussi les connexions transverses sous forme de
   * petits marqueurs prune.
   */
  const visibleConnections = $derived.by(() => {
    const result: { index: number; from: Node; to: Node }[] = [];
    const visibleIds = new Set(store.visibleNodes.map((n) => n.id));
    const allNodes = store.scenario.nodes;
    for (let i = 0; i < store.scenario.connections.length; i++) {
      const c = store.scenario.connections[i];
      if (!visibleIds.has(c.from) || !visibleIds.has(c.to)) continue;
      const from = allNodes.find((n) => n.id === c.from);
      const to = allNodes.find((n) => n.id === c.to);
      if (!from || !to) continue;
      result.push({ index: i, from, to });
    }
    return result;
  });

  /**
   * Construit le `d` d'une courbe de Bézier cubique du port out de
   * `from` au port in de `to`. Tangentes horizontales, bras
   * proportionnels à la distance horizontale.
   */
  function bezierPath(from: Node, to: Node): string {
    const a = getPortPos(from, 'out');
    const b = getPortPos(to, 'in');
    const dx = Math.abs(b.x - a.x) * 0.5;
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }

  function previewBezierPath(from: Node, end: { x: number; y: number }): string {
    const a = getPortPos(from, 'out');
    const dx = Math.abs(end.x - a.x) * 0.5;
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;
  }

  // ============================================================
  // État de drag
  // ============================================================

  let svgEl: SVGSVGElement;

  /** Drag de déplacement d'un nœud. */
  let nodeDragId = $state<NodeId | null>(null);
  let nodeDragOffset = { x: 0, y: 0 };

  /** Drag de création de connexion. */
  let connectFromId = $state<NodeId | null>(null);
  let connectPreviewEnd = $state<{ x: number; y: number } | null>(null);

  /**
   * Référence vers le nœud source du drag de connexion (dérivée). Sert
   * au rendu du tracé de prévisualisation.
   */
  const connectFromNode = $derived.by((): Node | null => {
    if (connectFromId === null) return null;
    return store.scenario.nodes.find((n) => n.id === connectFromId) ?? null;
  });

  function clientToSvgPoint(e: PointerEvent): { x: number; y: number } {
    const rect = svgEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ============================================================
  // Pointer handlers (centralisés sur la SVG racine)
  // ============================================================

  function handleSvgPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const pt = clientToSvgPoint(e);

    // 1. Hit sur un port de sortie ? → démarre un drag de connexion.
    const port = findPortAt(pt.x, pt.y);
    if (port && port.role === 'out') {
      connectFromId = port.nodeId;
      connectPreviewEnd = pt;
      svgEl.setPointerCapture(e.pointerId);
      return;
    }

    // 2. Hit sur un nœud ? → sélection + démarre un drag de
    //    déplacement. Le hit sur un port d'entrée n'amorce rien
    //    (l'entrée n'est cible que pour terminer un drag de connexion).
    const hitNode = findNodeAt(pt.x, pt.y);
    if (hitNode) {
      store.select(hitNode.id);
      nodeDragOffset = { x: pt.x - hitNode.x, y: pt.y - hitNode.y };
      nodeDragId = hitNode.id;
      svgEl.setPointerCapture(e.pointerId);
      return;
    }

    // 3. Vide → désélectionner.
    store.select(null);
  }

  function handleSvgPointerMove(e: PointerEvent): void {
    const pt = clientToSvgPoint(e);
    if (connectFromId !== null) {
      connectPreviewEnd = pt;
      return;
    }
    if (nodeDragId !== null) {
      store.moveNode(nodeDragId, pt.x - nodeDragOffset.x, pt.y - nodeDragOffset.y);
    }
  }

  function handleSvgPointerUp(e: PointerEvent): void {
    if (connectFromId !== null) {
      const pt = clientToSvgPoint(e);
      const target = findPortAt(pt.x, pt.y);
      if (target && target.role === 'in') {
        const result = store.addConnection(connectFromId, target.nodeId);
        if (result === 'created') {
          // Détecte transverse : extrémités dans des cartouches différents.
          const fromNode = store.scenario.nodes.find((n) => n.id === connectFromId);
          const toNode = store.scenario.nodes.find((n) => n.id === target.nodeId);
          const transverse = fromNode && toNode && fromNode.parentId !== toNode.parentId;
          onToast(transverse ? t('toast.connectionTransverse') : t('toast.connectionCreated'));
        } else if (result === 'exists') {
          onToast(t('toast.connectionExists'));
        }
        // 'invalid' (même nœud, ou ids inconnus) : silencieux.
      }
      connectFromId = null;
      connectPreviewEnd = null;
      try {
        svgEl.releasePointerCapture(e.pointerId);
      } catch {
        // ignore — peut lever après pointercancel
      }
      return;
    }
    if (nodeDragId !== null) {
      try {
        svgEl.releasePointerCapture(e.pointerId);
      } catch {
        // idem
      }
      nodeDragId = null;
    }
  }

  function handleConnectionClick(index: number, e: MouseEvent): void {
    e.stopPropagation();
    store.deleteConnectionByIndex(index);
    onToast(t('toast.connectionDeleted'));
  }

  // ============================================================
  // Image de fond (jalon 4.5)
  // ============================================================

  /**
   * URL utilisable par CSS pour l'image de fond, dérivée de
   * `appearance.backgroundImagePath`. Trois cas :
   * - null   → image bundlée par défaut (servie par Vite/SvelteKit)
   * - ''     → pas d'image
   * - chemin → fichier local : convertFileSrc (Tauri uniquement)
   *
   * En preview navigateur, les chemins absolus ne peuvent pas être
   * chargés (sécurité) → on retombe sur l'image par défaut.
   */
  const backgroundUrl = $derived.by((): string | null => {
    const path = store.scenario.appearance.backgroundImagePath;
    if (path === '') return null;
    if (path === null) return '/textures/fossil-default.jpg';
    // Chemin custom : nécessite Tauri pour servir le fichier local
    if (isTauriContext()) {
      // Import dynamique pour éviter de charger l'API Tauri en preview
      // (ce convertFileSrc est synchrone une fois importé)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const tauriCore = (window as unknown as { __TAURI__?: { core?: { convertFileSrc?: (p: string) => string } } }).__TAURI__;
      if (tauriCore?.core?.convertFileSrc) {
        return tauriCore.core.convertFileSrc(path);
      }
      // Fallback : tente le format URL directement (asset.localhost)
      return `https://asset.localhost/${encodeURIComponent(path).replaceAll('%2F', '/').replaceAll('%5C', '/')}`;
    }
    // En preview navigateur, repli sur l'image par défaut
    return '/textures/fossil-default.jpg';
  });
</script>

<div
  class="canvas-area"
  style:--bg-image={backgroundUrl ? `url("${backgroundUrl}")` : 'none'}
  style:--bg-opacity={store.scenario.appearance.backgroundOpacity / 100}
>
  <svg
    bind:this={svgEl}
    role="presentation"
    onpointerdown={handleSvgPointerDown}
    onpointermove={handleSvgPointerMove}
    onpointerup={handleSvgPointerUp}
    onpointercancel={handleSvgPointerUp}
  >
    <!-- Couche 1 : connexions (sous les nœuds) -->
    <g class="connections-layer">
      {#each visibleConnections as conn (conn.index)}
        {@const d = bezierPath(conn.from, conn.to)}
        <!-- Path invisible épais : zone de clic confortable pour la suppression -->
        <path
          {d}
          class="connection-hit"
          stroke="transparent"
          stroke-width="14"
          fill="none"
          onpointerdown={(e) => e.stopPropagation()}
          onclick={(e) => handleConnectionClick(conn.index, e)}
          role="button"
          tabindex="-1"
          aria-label="Connexion"
        ></path>
        <!-- Path visible : trait fin coloré -->
        <path {d} class="connection" stroke-width="1.5" fill="none"></path>
      {/each}

      <!-- Tracé de prévisualisation pendant un drag de connexion -->
      {#if connectFromNode && connectPreviewEnd}
        <path
          d={previewBezierPath(connectFromNode, connectPreviewEnd)}
          class="connection-preview"
          stroke-width="1.5"
          stroke-dasharray="4 3"
          fill="none"
        ></path>
      {/if}
    </g>

    <!-- Couche 2 : nœuds -->
    <g class="nodes-layer">
      {#each store.visibleNodes as node (node.id)}
        {@const d = dim(node)}
        {@const isSelected = store.selectedId === node.id}
        {@const subtitle = getSubtitle(node)}
        <g
          class="node {node.type}"
          class:selected={isSelected}
          class:dragging={nodeDragId === node.id}
          transform="translate({node.x},{node.y})"
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

          <!-- Ports : visuels uniquement, pointer-events:none.
               Le hit-testing se fait mathématiquement dans handleSvgPointerDown. -->
          <circle
            class="port port-out"
            cx={d.w}
            cy={d.h / 2}
            r={PORT_VISUAL_R}
          />
          <circle
            class="port port-in"
            cx="0"
            cy={d.h / 2}
            r={PORT_VISUAL_R}
          />
        </g>
      {/each}
    </g>
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

  /* Image de fond optionnelle (par défaut le fossile bundlé). Mise
     en pseudo-élément pour pouvoir contrôler l'opacité indépendamment
     du contenu. mix-blend-mode: multiply pour intégrer la texture
     dans le vélin sans dénaturer les couleurs des nœuds. */
  .canvas-area::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: var(--bg-image, none);
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    opacity: var(--bg-opacity, 0);
    mix-blend-mode: multiply;
    pointer-events: none;
    z-index: 0;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
    cursor: default;
    position: relative;
    z-index: 1;
  }

  /* ============================================================
     Connexions
     ============================================================ */

  .connection {
    stroke: var(--accent-soft);
    pointer-events: none;
    transition: stroke var(--t-fast) var(--ease);
  }

  .connection-hit {
    cursor: pointer;
  }
  .connection-hit:hover + .connection {
    stroke: var(--warm);
  }

  .connection-preview {
    stroke: var(--highlight);
    pointer-events: none;
  }

  /* ============================================================
     Nœuds — fond et bordures
     ============================================================ */

  .node {
    user-select: none;
  }
  .node-bg {
    stroke: var(--rule);
    stroke-width: 1;
    transition: stroke var(--t-fast) var(--ease);
    pointer-events: none;
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
     Ports
     ============================================================ */

  .port {
    stroke: var(--paper);
    stroke-width: 1.5;
    pointer-events: none;
  }
  .port-out {
    fill: var(--playing);
  }
  .port-in {
    fill: var(--warm);
  }

  /* ============================================================
     État vide
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
