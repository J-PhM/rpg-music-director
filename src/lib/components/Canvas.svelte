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
  import { getNodeFullPath } from '$lib/model/navigation';
  import { store } from '$lib/store/scenarioStore.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { isTauriContext } from '$lib/io/scenarioFile';
  import {
    isAudioFile,
    subscribeToTauriDrop,
    titleFromPath,
    type DropEvent,
    type Unsubscribe,
  } from '$lib/io/dragDrop';
  import { engine } from '$lib/audio/engine.svelte';

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
   * Connexions visibles SOUS FORME DE COURBES : leurs deux extrémités
   * sont dans le cartouche courant. L'index original est préservé pour
   * la suppression au clic.
   */
  const visibleCurves = $derived.by(() => {
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
   * Connexions partiellement visibles : exactement UNE extrémité dans
   * le cartouche courant. Rendues comme petits marqueurs prune au bord
   * du nœud visible, avec une étiquette indiquant l'autre extrémité.
   */
  interface TransverseMarker {
    /** Nœud visible auquel le marqueur est attaché. */
    visibleNode: Node;
    /** Côté du nœud où placer le marqueur ('right' = sortie, 'left' = entrée). */
    side: 'right' | 'left';
    /** Texte affiché à côté du marqueur. */
    label: string;
  }
  const visibleTransverseMarkers = $derived.by((): TransverseMarker[] => {
    const result: TransverseMarker[] = [];
    const visibleIds = new Set(store.visibleNodes.map((n) => n.id));
    const allNodes = store.scenario.nodes;
    for (const c of store.scenario.connections) {
      const fromVis = visibleIds.has(c.from);
      const toVis = visibleIds.has(c.to);
      if (fromVis === toVis) continue; // soit les deux (= curve), soit aucun (= invisible)
      if (fromVis) {
        const from = allNodes.find((n) => n.id === c.from);
        const to = allNodes.find((n) => n.id === c.to);
        if (!from || !to) continue;
        result.push({
          visibleNode: from,
          side: 'right',
          label: '→ ' + getNodeFullPath(store.scenario, to.id),
        });
      } else {
        const from = allNodes.find((n) => n.id === c.from);
        const to = allNodes.find((n) => n.id === c.to);
        if (!from || !to) continue;
        result.push({
          visibleNode: to,
          side: 'left',
          label: '← ' + getNodeFullPath(store.scenario, from.id),
        });
      }
    }
    return result;
  });

  /**
   * Pour chaque cartouche visible, calcule les rectangles miniatures
   * de ses enfants pour la mini-vue satellite. Renvoie un objet par
   * cartouche, indexé par id.
   */
  interface MiniPreview {
    rects: { x: number; y: number; w: number; h: number; type: Node['type'] }[];
  }
  const miniPreviews = $derived.by((): Record<NodeId, MiniPreview> => {
    const out: Record<NodeId, MiniPreview> = {};
    const PADDING_X = 20;
    const PADDING_Y_TOP = 90;
    const PADDING_Y_BOTTOM = 10;
    for (const node of store.visibleNodes) {
      if (!isCartouche(node)) continue;
      const children = store.scenario.nodes.filter((n) => n.parentId === node.id);
      if (children.length === 0) continue;

      const xs = children.map((c) => c.x);
      const ys = children.map((c) => c.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const c of children) {
        const d = dim(c);
        if (c.x + d.w > maxX) maxX = c.x + d.w;
        if (c.y + d.h > maxY) maxY = c.y + d.h;
      }
      const bbW = Math.max(maxX - minX, 1);
      const bbH = Math.max(maxY - minY, 1);
      const previewW = CARTOUCHE_W - 2 * PADDING_X;
      const previewH = CARTOUCHE_H - PADDING_Y_TOP - PADDING_Y_BOTTOM;
      const ps = Math.min(previewW / bbW, previewH / bbH);

      out[node.id] = {
        rects: children.map((c) => {
          const d = dim(c);
          return {
            x: (c.x - minX) * ps,
            y: (c.y - minY) * ps,
            w: d.w * ps,
            h: d.h * ps,
            type: c.type,
          };
        }),
      };
    }
    return out;
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

  /**
   * Ensemble des nodeIds actuellement présents dans la pile audio
   * ou en tant que stinger en cours. Sert au visuel "playing"
   * (bordure vert olive + pulsation) sur les nœuds correspondants.
   * Inclut les couches en sourdine de la pile — elles sont
   * "actives" même si on ne les entend pas.
   */
  const playingIds = $derived.by((): Set<NodeId> => {
    const ids = new Set<NodeId>();
    for (const layer of engine.stack) ids.add(layer.nodeId);
    if (engine.stinger) ids.add(engine.stinger.nodeId);
    return ids;
  });

  /**
   * Coords écran (relatives au coin haut-gauche du SVG) — utilisées
   * pour les calculs de zoom (ancrage du curseur) et le pan.
   */
  function clientToScreen(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = svgEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /**
   * Coords monde (espace des nœuds, après application inverse du
   * transform de la vue). Utilisées pour le hit-testing mathématique
   * et pour `store.moveNode`.
   */
  function clientToWorld(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const s = clientToScreen(e);
    const v = store.currentView;
    return { x: (s.x - v.panX) / v.scale, y: (s.y - v.panY) / v.scale };
  }

  // ============================================================
  // Pointer handlers (centralisés sur la SVG racine)
  // ============================================================

  function handleSvgPointerDown(e: PointerEvent): void {
    // 0. Pan ? (clic-milieu ou Espace + clic-gauche) — toujours actif
    if (maybeStartPan(e)) return;
    if (e.button !== 0) return;
    const pt = clientToWorld(e);

    // === Mode Gomme : un clic = supprime (jalon 11) ===
    if (store.eraserMode) {
      const hit = findNodeAt(pt.x, pt.y);
      if (hit) {
        if (hit.type === 'cartouche') {
          const childCount = store.scenario.nodes.filter((n) => n.parentId === hit.id).length;
          if (childCount > 0) {
            const ok = confirm(
              t('confirm.eraseCartoucheWithChildren', { title: hit.title, n: childCount }),
            );
            if (!ok) return;
          }
        }
        const n = store.deleteNode(hit.id);
        onToast(n > 1 ? t('toast.nodesErased', { n }) : t('toast.nodeErased'));
      }
      // Pas de sélection / désélection en gomme : on reste prêt à effacer le suivant.
      return;
    }

    // === Mode Jeu : un clic = trigger via le moteur audio ===
    if (store.mode === 'play') {
      const hit = findNodeAt(pt.x, pt.y);
      if (hit && hit.type !== 'cartouche') {
        if (!hit.localFilePath) {
          onToast(t('toast.triggerNoFile', { title: hit.title }));
        } else if (hit.type === 'stinger') {
          // Tada : canal séparé, ne touche pas la pile.
          engine
            .playStinger(hit)
            .then(() => onToast(t('toast.audioStinger', { title: hit.title })))
            .catch((err) =>
              onToast(t('toast.audioError', { msg: err instanceof Error ? err.message : String(err) })),
            );
        } else {
          // Scène ou personnage : empilé au sommet.
          engine
            .pushLayer(hit, hit.type)
            .then(() => onToast(t('toast.audioPushed', { title: hit.title })))
            .catch((err) =>
              onToast(t('toast.audioError', { msg: err instanceof Error ? err.message : String(err) })),
            );
        }
      }
      // Cartouche en mode Jeu : clic simple = no-op ; le double-clic
      // continue à fonctionner pour entrer dedans.
      return;
    }

    // === Mode Préparation ===

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
    if (panning) {
      const cur = clientToScreen(e);
      const view = store.currentView;
      view.panX = panStart.view.panX + (cur.x - panStart.screen.x);
      view.panY = panStart.view.panY + (cur.y - panStart.screen.y);
      return;
    }
    const pt = clientToWorld(e);
    if (connectFromId !== null) {
      connectPreviewEnd = pt;
      return;
    }
    if (nodeDragId !== null) {
      store.moveNode(nodeDragId, pt.x - nodeDragOffset.x, pt.y - nodeDragOffset.y);
    }
  }

  function handleSvgPointerUp(e: PointerEvent): void {
    if (panning) {
      panning = false;
      try {
        svgEl.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      updateCursor();
      return;
    }
    if (connectFromId !== null) {
      const pt = clientToWorld(e);
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

  /**
   * Double-clic sur un nœud cartouche → entrer dedans. On utilise
   * `dblclick` natif (qui suit les deux pointerup) plutôt qu'un
   * détecteur custom basé sur le temps : c'est plus fiable et
   * cohérent avec le reste du système.
   */
  function handleSvgDblClick(e: MouseEvent): void {
    const wp = clientToWorld(e);
    const hit = findNodeAt(wp.x, wp.y);
    if (hit && hit.type === 'cartouche') {
      store.enterCartouche(hit.id);
    }
  }

  // ============================================================
  // Zoom (jalon 6)
  // ============================================================

  /** Facteur multiplicatif par cran de molette. */
  const ZOOM_FACTOR = 1.15;

  function handleWheel(e: WheelEvent): void {
    // Bloque le scroll de page que le navigateur ferait sinon.
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const view = store.currentView;
    const anchor = clientToScreen(e);
    store.setZoomAt(view.scale * factor, anchor.x, anchor.y);
  }

  // ============================================================
  // Pan (jalon 6)
  // ============================================================

  /**
   * Pan actif via clic-milieu OU Espace + clic-gauche. On capture le
   * pointeur sur la SVG racine pour suivre le curseur même s'il sort.
   */
  let panning = $state<boolean>(false);
  let spaceHeld = $state<boolean>(false);
  let panStart = { screen: { x: 0, y: 0 }, view: { panX: 0, panY: 0 } };

  function handleWindowKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space' && !spaceHeld) {
      const tag = (document.activeElement?.tagName ?? '').toUpperCase();
      // Ignore l'espace si le focus est sur un champ texte / textarea.
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      spaceHeld = true;
      updateCursor();
      e.preventDefault();
    }
  }

  function handleWindowKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      spaceHeld = false;
      updateCursor();
    }
  }

  // Échap pour sortir du mode gomme (cf. cahier jalon 11).
  function handleWindowEscape(e: KeyboardEvent): void {
    if (e.key === 'Escape' && store.eraserMode) {
      store.exitEraser();
      onToast(t('toast.eraserOff'));
    }
  }

  function maybeStartPan(e: PointerEvent): boolean {
    // Conditions : clic-milieu OU clic-gauche + Espace tenu.
    const wantPan = e.button === 1 || (e.button === 0 && spaceHeld);
    if (!wantPan) return false;
    panning = true;
    const view = store.currentView;
    panStart = {
      screen: clientToScreen(e),
      view: { panX: view.panX, panY: view.panY },
    };
    svgEl.setPointerCapture(e.pointerId);
    updateCursor();
    e.preventDefault();
    return true;
  }

  function updateCursor(): void {
    if (!canvasAreaEl) return;
    if (panning) canvasAreaEl.style.cursor = 'grabbing';
    else if (spaceHeld) canvasAreaEl.style.cursor = 'grab';
    else canvasAreaEl.style.cursor = '';
  }

  let canvasAreaEl: HTMLDivElement;

  // ============================================================
  // Drag-and-drop de fichiers (jalon 7)
  // ============================================================

  /** Id du nœud actuellement survolé pendant un drag de fichier (pour le highlight). */
  let dropTargetId = $state<NodeId | null>(null);

  /**
   * Convertit une position fenêtre Tauri en coords monde du canvas.
   * Renvoie null si la position est en dehors du canvas-area.
   *
   * **Important** : Tauri 2 renvoie les positions du drop event en
   * pixels PHYSIQUES de l'OS (PhysicalPosition côté Rust). Les
   * mesures DOM (getBoundingClientRect) sont en pixels LOGIQUES
   * (CSS). Si l'utilisateur a un DPI scaling Windows ≠ 100% (par
   * exemple 125%, 150%, 200% sur écran 4K), la position physique
   * vaut `logical * devicePixelRatio`. On divise donc par DPR pour
   * retrouver la position logique avant les calculs.
   */
  function tauriWindowToWorld(
    pos: { x: number; y: number },
  ): { x: number; y: number } | null {
    if (!canvasAreaEl) return null;
    const dpr = window.devicePixelRatio || 1;
    const logicalX = pos.x / dpr;
    const logicalY = pos.y / dpr;
    const rect = canvasAreaEl.getBoundingClientRect();
    const cx = logicalX - rect.left;
    const cy = logicalY - rect.top;
    if (cx < 0 || cy < 0 || cx > rect.width || cy > rect.height) return null;
    const v = store.currentView;
    return { x: (cx - v.panX) / v.scale, y: (cy - v.panY) / v.scale };
  }

  function handleDropEvent(event: DropEvent): void {
    // En mode Gomme, le drag-drop est désactivé (cf. cahier).
    if (store.eraserMode) return;
    if (event.type === 'leave') {
      dropTargetId = null;
      return;
    }
    if (event.type === 'enter' || event.type === 'over') {
      const wp = tauriWindowToWorld(event.position);
      if (!wp) {
        dropTargetId = null;
        return;
      }
      const hit = findNodeAt(wp.x, wp.y);
      dropTargetId = hit ? hit.id : null;
      return;
    }
    if (event.type === 'drop') {
      const wp = tauriWindowToWorld(event.position);
      dropTargetId = null;
      if (!wp) return;

      const audioPaths = event.paths.filter(isAudioFile);
      if (audioPaths.length === 0) {
        const first = event.paths[0];
        if (first) {
          onToast(t('toast.notAudioFile', { name: titleFromPath(first) }));
        } else {
          onToast(t('toast.noAudioFiles'));
        }
        return;
      }

      const hit = findNodeAt(wp.x, wp.y);

      // Sur un nœud audio existant : remplacer la source
      if (hit && hit.type !== 'cartouche') {
        const path = audioPaths[0];
        store.attachAudioFile(hit.id, path);
        onToast(t('toast.fileAttached', { name: titleFromPath(path) }));
        return;
      }

      // Sur une cartouche : devient le fond
      if (hit && hit.type === 'cartouche') {
        const path = audioPaths[0];
        store.attachCartoucheBg(hit.id, path);
        onToast(t('toast.bgAttached', { name: titleFromPath(path) }));
        return;
      }

      // Canvas vide : créer une (ou plusieurs) scènes
      const baseTitle = titleFromPath(audioPaths[0]);
      let offset = 0;
      for (const path of audioPaths) {
        store.createSceneFromFile(
          path,
          titleFromPath(path),
          wp.x - 80 + offset,
          wp.y - 35 + offset,
        );
        offset += 30;
      }
      onToast(
        audioPaths.length === 1
          ? t('toast.sceneCreatedFromFile', { name: baseTitle })
          : t('toast.scenesCreated', { n: audioPaths.length }),
      );
    }
  }

  let dropUnsubscribe: Unsubscribe | null = null;
  $effect(() => {
    // Abonnement au mount, désabonnement au démontage. Le wrapper
    // gère silencieusement le cas hors-Tauri (preview navigateur).
    let cancelled = false;
    subscribeToTauriDrop(handleDropEvent).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        dropUnsubscribe = unlisten;
      }
    });
    return () => {
      cancelled = true;
      if (dropUnsubscribe) {
        dropUnsubscribe();
        dropUnsubscribe = null;
      }
    };
  });

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

<svelte:window
  onkeydown={(e) => {
    handleWindowKeyDown(e);
    handleWindowEscape(e);
  }}
  onkeyup={handleWindowKeyUp}
/>

<div
  class="canvas-area"
  class:play-mode={store.mode === 'play'}
  class:eraser-mode={store.eraserMode}
  bind:this={canvasAreaEl}
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
    ondblclick={handleSvgDblClick}
    onwheel={handleWheel}
  >
    <!-- Viewport : applique le zoom + pan du cartouche courant.
         Tout le contenu (connexions, nœuds, ports) est dessiné en
         coords monde et le transform fait l'échelle vers l'écran. -->
    <g
      class="viewport"
      transform="translate({store.currentView.panX},{store.currentView.panY}) scale({store.currentView.scale})"
    >
    <!-- Couche 1 : connexions (sous les nœuds) -->
    <g class="connections-layer">
      {#each visibleCurves as conn (conn.index)}
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

      <!-- Marqueurs des connexions transverses (un seul bout visible). -->
      {#each visibleTransverseMarkers as m, i (i)}
        {@const nd = dim(m.visibleNode)}
        {@const cx = m.side === 'right' ? m.visibleNode.x + nd.w + 10 : m.visibleNode.x - 10}
        {@const cy = m.visibleNode.y + nd.h / 2}
        {@const labelX = m.side === 'right' ? cx + 8 : cx - 8}
        {@const labelText = m.label.length > 28 ? m.label.slice(0, 27) + '…' : m.label}
        <circle class="ext-marker" cx={cx} cy={cy} r="4" />
        <text
          class="ext-text"
          x={labelX}
          y={cy + 3}
          text-anchor={m.side === 'right' ? 'start' : 'end'}
        >{labelText}</text>
      {/each}
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
          class:playing={playingIds.has(node.id)}
          class:dragging={nodeDragId === node.id}
          class:drop-target={dropTargetId === node.id}
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

            <!-- Indicateur 🌊 si la cartouche a une musique de fond (cf. cahier).
                 Vert olive si fichier local prêt, terre cuite si URL YouTube
                 (en attendant le jalon 17 qui activera vraiment YouTube). -->
            {#if node.bgLocalFilePath}
              <text class="cartouche-bg-indicator" x={d.w - 12} y="22" text-anchor="end">🌊</text>
            {:else if node.bgYtUrl}
              <text class="cartouche-bg-indicator yt" x={d.w - 12} y="22" text-anchor="end">🌊</text>
            {/if}

            <!-- Mini-vue satellite : aperçu des enfants à l'échelle réduite. -->
            {@const preview = miniPreviews[node.id]}
            {#if preview}
              <g class="mini-preview" transform="translate(20, 90)">
                {#each preview.rects as r}
                  <rect
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    rx="2"
                    class="mini-rect mini-{r.type}"
                  />
                {/each}
              </g>
            {/if}
          {:else}
            <text class="node-icon" x="22" y="28">{getIcon(node)}</text>
            <text class="node-title" x={d.w / 2 + 10} y="28">
              {node.title.length > 16 ? node.title.slice(0, 15) + '…' : node.title}
            </text>
            <text class="node-subtitle" x={d.w / 2} y="50">{subtitle}</text>
          {/if}

          <!-- Ports : visuels uniquement, pointer-events:none.
               Le hit-testing se fait mathématiquement dans handleSvgPointerDown.
               Masqués en mode Jeu (cf. cahier). -->
          {#if store.mode === 'edit'}
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
          {/if}
        </g>
      {/each}
    </g>
    </g>
  </svg>

  {#if store.visibleNodes.length === 0}
    <div class="empty-hint">
      <p>{t('empty.canvas')}</p>
    </div>
  {/if}

  <!-- Indicateur de zoom (jalon 6) en bas à gauche du canvas -->
  <div class="zoom-indicator">{Math.round(store.currentView.scale * 100)}&nbsp;%</div>

  <!-- Bandeau de mode Gomme (jalon 11) -->
  {#if store.eraserMode}
    <div class="eraser-banner">{t('eraser.banner')}</div>
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

  /* Lecture en cours : vert olive avec pulsation subtile (cf. cahier).
     Surcharge la sélection — l'info "ça joue" prime visuellement. */
  .node.playing .node-bg {
    stroke: var(--playing);
    stroke-width: 2.5;
    animation: playing-pulse 2.2s ease-in-out infinite;
  }
  .node.cartouche.playing .node-bg {
    stroke: var(--playing);
    stroke-width: 2.5;
    stroke-dasharray: none;
    animation: playing-pulse 2.2s ease-in-out infinite;
  }

  @keyframes playing-pulse {
    0%,
    100% {
      stroke-opacity: 1;
    }
    50% {
      stroke-opacity: 0.55;
    }
  }

  /* Cible de drop pendant un drag de fichier (jalon 7) — surcharge tout
     le reste pendant le geste, c'est l'état le plus urgent visuellement. */
  .node.drop-target .node-bg {
    stroke: var(--transverse);
    stroke-width: 2;
    stroke-dasharray: 4 3;
    animation: none;
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

  .cartouche-bg-indicator {
    font-size: 14px;
    fill: var(--playing);
    pointer-events: none;
  }
  .cartouche-bg-indicator.yt {
    /* YouTube non implémenté pour l'instant : indicateur en attente */
    fill: var(--warm);
    opacity: 0.6;
  }

  /* ============================================================
     Mini-vue satellite (aperçu des enfants dans une cartouche)
     ============================================================ */

  .mini-rect {
    opacity: 0.55;
    pointer-events: none;
  }
  .mini-scene {
    fill: #735c3a;
  }
  .mini-character {
    fill: #6a4868;
  }
  .mini-stinger {
    fill: #8a5a3a;
  }
  .mini-cartouche {
    fill: #4a6a52;
  }

  /* ============================================================
     Marqueurs des connexions transverses
     ============================================================ */

  .ext-marker {
    fill: var(--transverse);
    pointer-events: none;
  }
  .ext-text {
    font-family: var(--font-mono);
    font-size: 9px;
    fill: var(--transverse);
    pointer-events: none;
    font-weight: 400;
    letter-spacing: 0.04em;
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
  /* En mode Jeu, le curseur est plus naturel sur les nœuds (clic = trigger) */
  .canvas-area.play-mode .node {
    cursor: pointer;
  }

  /* === Mode Gomme (jalon 11) === */
  .canvas-area.eraser-mode {
    cursor: crosshair;
  }
  .canvas-area.eraser-mode svg {
    cursor: crosshair;
  }
  .canvas-area.eraser-mode .node {
    cursor: crosshair;
  }
  .eraser-banner {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--warm);
    color: var(--paper);
    padding: 6px 16px;
    border-radius: 2px;
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    pointer-events: none;
    z-index: 60;
    box-shadow: var(--shadow);
    user-select: none;
  }

  /* ============================================================
     Indicateur de zoom (overlay bas-gauche)
     ============================================================ */

  .zoom-indicator {
    position: absolute;
    bottom: 16px;
    left: 16px;
    background: var(--paper);
    border: 1px solid var(--rule);
    padding: 4px 12px;
    border-radius: 2px;
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.15em;
    pointer-events: none;
    z-index: 50;
    user-select: none;
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
