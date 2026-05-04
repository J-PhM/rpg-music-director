/**
 * Store réactif partagé du scénario courant.
 *
 * Pattern Svelte 5 : une classe avec des membres `$state`, exposée comme
 * singleton. Les composants consomment via `import { store } from ...`
 * et lisent/écrivent directement les propriétés. La réactivité fine de
 * Svelte 5 garantit que seuls les composants qui lisent une propriété
 * modifiée se re-rendent — c'est cette propriété qui nous évite le
 * piège du proto v9 (« re-render qui casse le focus de l'inspecteur »).
 *
 * Le store **ne touche pas au filesystem** ni à l'audio — il est
 * volontairement isolé pour rester testable en pur TypeScript.
 *
 * Pour l'instant (jalon 3) : opérations sur les nœuds uniquement.
 * Connexions, navigation cartouche, undo/redo arriveront aux jalons suivants.
 */

import { emptyScenario, nextId } from '$lib/model/defaults';
import { EXAMPLE_SCENARIO } from '$lib/model/example';
import { getCartoucheParent } from '$lib/model/navigation';
import { toJson } from '$lib/model/serialize';
import { viewKey, type Node, type NodeId, type NodeType, type Scenario, type View } from '$lib/model/types';
import { setLang } from '$lib/i18n/i18n.svelte';
import { createNode } from '$lib/model/defaults';

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
/** Marge en pixels écran pour le bouton Recadrer (top-left visible). */
const RECADRER_MARGIN = 60;

class ScenarioStore {
  /** Scénario actif. Toutes les opérations passent par ce store. */
  scenario = $state<Scenario>(structuredClone(EXAMPLE_SCENARIO));

  /** Id du nœud sélectionné, ou null si rien n'est sélectionné. */
  selectedId = $state<NodeId | null>(null);

  /** Chemin absolu du fichier ouvert, ou null si jamais sauvegardé. */
  currentPath = $state<string | null>(null);

  /**
   * Sérialisation à laquelle on compare pour décider si « modifié ».
   * Mise à jour à chaque sauvegarde / chargement / nouveau scénario.
   */
  private baseSerialization = $state<string>(toJson(EXAMPLE_SCENARIO));

  /** True si le scénario diffère de la dernière sauvegarde. */
  modified = $derived(toJson(this.scenario) !== this.baseSerialization);

  /** Comptages dérivés affichés dans la status bar / résumé. */
  counts = $derived.by(() => {
    let scenes = 0;
    let characters = 0;
    let stingers = 0;
    let cartouches = 0;
    for (const n of this.scenario.nodes) {
      if (n.type === 'scene') scenes++;
      else if (n.type === 'character') characters++;
      else if (n.type === 'stinger') stingers++;
      else cartouches++;
    }
    return {
      scenes,
      characters,
      stingers,
      cartouches,
      total: this.scenario.nodes.length,
      connections: this.scenario.connections.length,
    };
  });

  // ============================================================
  // Sélecteurs
  // ============================================================

  selectedNode = $derived.by((): Node | null => {
    if (this.selectedId === null) return null;
    return this.scenario.nodes.find((n) => n.id === this.selectedId) ?? null;
  });

  /**
   * Nœuds visibles dans le cartouche courant.
   */
  visibleNodes = $derived.by((): Node[] => {
    return this.scenario.nodes.filter((n) => n.parentId === this.scenario.currentCartoucheId);
  });

  /**
   * Vue (zoom + pan) du cartouche courant. **Lecture seule** : la
   * création éventuelle d'une vue manquante se fait dans
   * `ensureCurrentViewExists` (appelé à la navigation et au load),
   * pas ici — Svelte 5 interdit les mutations dans un `$derived`.
   */
  currentView = $derived.by((): View => {
    const k = viewKey(this.scenario.currentCartoucheId);
    return this.scenario.viewByCartouche[k] ?? { scale: 1, panX: 0, panY: 0 };
  });

  /**
   * S'assure qu'une vue existe pour le cartouche courant. À appeler
   * AVANT toute mutation potentielle (zoom, pan, recadrer). Évite
   * que les modifications partent dans un objet jetable retourné par
   * le derived ci-dessus.
   */
  private ensureCurrentViewExists(): View {
    const k = viewKey(this.scenario.currentCartoucheId);
    if (!this.scenario.viewByCartouche[k]) {
      this.scenario.viewByCartouche[k] = { scale: 1, panX: 0, panY: 0 };
    }
    return this.scenario.viewByCartouche[k];
  }

  // ============================================================
  // Actions — chargement
  // ============================================================

  /** Remplace le scénario courant. Réinitialise sélection et baseline. */
  loadScenario(scenario: Scenario, path: string | null = null): void {
    this.scenario = scenario;
    this.selectedId = null;
    this.currentPath = path;
    this.baseSerialization = toJson(scenario);
    setLang(scenario.language);
    this.ensureCurrentViewExists();
  }

  /** Charge le scénario d'exemple. */
  loadExample(): void {
    this.loadScenario(structuredClone(EXAMPLE_SCENARIO), null);
  }

  /** Crée un nouveau scénario vide. */
  newScenario(): void {
    this.loadScenario(emptyScenario(), null);
  }

  /**
   * Marque le scénario comme « propre » au chemin donné. À appeler
   * après un succès de sauvegarde.
   */
  markSaved(path: string): void {
    this.currentPath = path;
    this.baseSerialization = toJson(this.scenario);
  }

  // ============================================================
  // Actions — sélection
  // ============================================================

  select(id: NodeId | null): void {
    this.selectedId = id;
  }

  // ============================================================
  // Actions — navigation hiérarchique (cartouches)
  // ============================================================

  /**
   * Entre dans le cartouche donné. Désélectionne pour éviter qu'une
   * sélection du parent ne survive dans une zone où l'élément n'est
   * plus visible (et donc plus éditable depuis l'inspecteur).
   */
  enterCartouche(cartoucheId: NodeId): void {
    this.scenario.currentCartoucheId = cartoucheId;
    this.selectedId = null;
    this.ensureCurrentViewExists();
  }

  /**
   * Remonte d'un niveau. Si on est à la racine ou si le parent est
   * introuvable, retourne à la racine.
   */
  exitCartouche(): void {
    if (this.scenario.currentCartoucheId === null) return;
    const parent = getCartoucheParent(this.scenario, this.scenario.currentCartoucheId);
    this.scenario.currentCartoucheId = parent;
    this.selectedId = null;
    this.ensureCurrentViewExists();
  }

  /**
   * Navigation directe vers un cartouche ou la racine. Utilisé par
   * le fil d'Ariane pour aller à un niveau précis.
   */
  goToCartouche(cartoucheId: NodeId | null): void {
    this.scenario.currentCartoucheId = cartoucheId;
    this.selectedId = null;
    this.ensureCurrentViewExists();
  }

  // ============================================================
  // Actions — renommage (utilisé par le fil d'Ariane)
  // ============================================================

  /** Renomme un cartouche. Ignore si l'id est invalide ou si ce n'est pas un cartouche. */
  renameCartouche(id: NodeId, newTitle: string): void {
    const trimmed = newTitle.trim();
    if (trimmed.length === 0) return;
    const node = this.scenario.nodes.find((n) => n.id === id);
    if (node && node.type === 'cartouche') {
      node.title = trimmed;
    }
  }

  /** Renomme la campagne (titre de la racine du fil d'Ariane). */
  renameCampaign(newTitle: string): void {
    const trimmed = newTitle.trim();
    if (trimmed.length === 0) return;
    this.scenario.campaignTitle = trimmed;
  }

  // ============================================================
  // Actions — manipulation des nœuds
  // ============================================================

  /**
   * Ajoute un nœud du type donné aux coordonnées (x, y) dans le
   * cartouche courant. Sélectionne automatiquement le nouveau nœud.
   */
  addNode(type: NodeType, x: number, y: number): Node {
    const id = nextId(this.scenario);
    const node = createNode(type, {
      id,
      parentId: this.scenario.currentCartoucheId,
      x,
      y,
    });
    this.scenario.nodes.push(node);
    this.selectedId = id;
    return node;
  }

  /**
   * Met à jour les coordonnées d'un nœud. Utilisé pendant le drag.
   * Pas de validation ici — l'UI peut clamper si besoin.
   */
  moveNode(id: NodeId, x: number, y: number): void {
    const node = this.scenario.nodes.find((n) => n.id === id);
    if (node) {
      node.x = x;
      node.y = y;
    }
  }

  // ============================================================
  // Actions — vue (zoom + pan)
  // ============================================================

  /**
   * Zoome en gardant le point d'ancrage écran fixe. Formule :
   *   newPan = anchor - (anchor - oldPan) * newScale / oldScale
   * Garantit que le point monde sous le curseur reste visuellement
   * au même endroit après le zoom.
   */
  setZoomAt(rawScale: number, anchorScreenX: number, anchorScreenY: number): void {
    const view = this.ensureCurrentViewExists();
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, rawScale));
    if (newScale === view.scale) return;
    view.panX = anchorScreenX - ((anchorScreenX - view.panX) * newScale) / view.scale;
    view.panY = anchorScreenY - ((anchorScreenY - view.panY) * newScale) / view.scale;
    view.scale = newScale;
  }

  /** Translate la vue de (dx, dy) en pixels écran. */
  panBy(dx: number, dy: number): void {
    const view = this.ensureCurrentViewExists();
    view.panX += dx;
    view.panY += dy;
  }

  /**
   * Recadre la vue : zoom à 1×, pan tel que le coin haut-gauche du
   * bounding-box des enfants visibles atterrisse à (60, 60) écran. Si
   * aucun enfant, ramène l'origine à (60, 60).
   */
  recadrer(): void {
    const view = this.ensureCurrentViewExists();
    view.scale = 1;
    const children = this.visibleNodes;
    if (children.length === 0) {
      view.panX = RECADRER_MARGIN;
      view.panY = RECADRER_MARGIN;
      return;
    }
    const minX = Math.min(...children.map((c) => c.x));
    const minY = Math.min(...children.map((c) => c.y));
    view.panX = RECADRER_MARGIN - minX;
    view.panY = RECADRER_MARGIN - minY;
  }

  // ============================================================
  // Actions — paramètres (apparence + langue)
  // ============================================================

  setBackgroundImagePath(path: string | null): void {
    this.scenario.appearance.backgroundImagePath = path;
  }

  setBackgroundOpacity(opacity: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(opacity)));
    this.scenario.appearance.backgroundOpacity = clamped;
  }

  /**
   * Change la langue du scénario ET la langue active de l'i18n.
   * Appelle setLang du module i18n pour propager le changement à
   * tous les composants qui utilisent t().
   */
  setScenarioLanguage(lang: 'fr' | 'en'): void {
    this.scenario.language = lang;
    setLang(lang);
  }

  // ============================================================
  // Actions — manipulation des connexions
  // ============================================================

  /**
   * Tente de créer une connexion `from → to`. Renvoie le résultat :
   * - 'created' si la connexion a été ajoutée
   * - 'exists' si elle existait déjà
   * - 'invalid' si la connexion est impossible (même nœud, ids inconnus)
   */
  addConnection(from: NodeId, to: NodeId): 'created' | 'exists' | 'invalid' {
    if (from === to) return 'invalid';
    const ids = new Set(this.scenario.nodes.map((n) => n.id));
    if (!ids.has(from) || !ids.has(to)) return 'invalid';
    const exists = this.scenario.connections.some((c) => c.from === from && c.to === to);
    if (exists) return 'exists';
    this.scenario.connections.push({ from, to });
    return 'created';
  }

  /** Supprime la connexion à l'index donné. */
  deleteConnectionByIndex(index: number): void {
    if (index < 0 || index >= this.scenario.connections.length) return;
    this.scenario.connections.splice(index, 1);
  }

  /**
   * Supprime un nœud (et toute sa descendance s'il s'agit d'un
   * cartouche). Renvoie le nombre total de nœuds supprimés.
   */
  deleteNode(id: NodeId): number {
    const toDelete = new Set<NodeId>([id]);
    let added = true;
    while (added) {
      added = false;
      for (const n of this.scenario.nodes) {
        if (!toDelete.has(n.id) && n.parentId !== null && toDelete.has(n.parentId)) {
          toDelete.add(n.id);
          added = true;
        }
      }
    }

    this.scenario.nodes = this.scenario.nodes.filter((n) => !toDelete.has(n.id));
    this.scenario.connections = this.scenario.connections.filter(
      (c) => !toDelete.has(c.from) && !toDelete.has(c.to),
    );

    if (this.selectedId !== null && toDelete.has(this.selectedId)) {
      this.selectedId = null;
    }

    return toDelete.size;
  }
}

/** Singleton du store, importé partout dans l'app. */
export const store = new ScenarioStore();
