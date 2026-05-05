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
import { isCartouche, viewKey, type Node, type NodeId, type NodeType, type Scenario, type TransitionType, type View } from '$lib/model/types';
import { setLang } from '$lib/i18n/i18n.svelte';
import { createNode } from '$lib/model/defaults';
import { engine } from '$lib/audio/engine.svelte';
import { history } from '$lib/history/history.svelte';
import { applyPreset } from '$lib/themes/applyPreset';
import type { PresetId, ThemeMode } from '$lib/themes/presets';

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
   * Timestamp de la dernière sauvegarde réussie (ms epoch). Utilisé
   * par la toolbar pour afficher "✓ Enregistré" pendant 1.5 s.
   * Réinitialisé à `null` au load (la baseline est par définition propre).
   */
  lastSavedAt = $state<number | null>(null);

  /**
   * Mode courant de l'application. État éphémère (pas dans le scénario) :
   * - 'edit' : préparation, édition libre, ports visibles, drag actif.
   * - 'play' : pendant la partie, interface dépouillée, clic = trigger audio.
   */
  mode = $state<'edit' | 'play'>('edit');

  /**
   * Mode gomme actif. État modal disponible UNIQUEMENT en mode 'edit'.
   * Quand actif : curseur crosshair, le clic supprime au lieu de
   * sélectionner. Désactivé automatiquement quand on bascule en 'play'.
   */
  eraserMode = $state<boolean>(false);

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
    // Avant de tout remplacer, on stoppe l'audio pour éviter qu'un fond
    // d'un scénario précédent ne survive au chargement du nouveau.
    engine.stopAll();
    this.scenario = scenario;
    this.selectedId = null;
    this.currentPath = path;
    this.baseSerialization = toJson(scenario);
    this.lastSavedAt = null;
    setLang(scenario.language);
    // Applique le thème graphique du scénario (jalon 14).
    applyPreset(scenario.theme.preset, scenario.theme.mode);
    // Applique les options de transition du scénario (jalon 16).
    engine.setTransitions(scenario.transitions);
    this.ensureCurrentViewExists();
    // L'historique d'annulation est purement en mémoire : un load
    // efface l'historique de la session précédente (cf. cahier).
    history.clear();
    // Restaure le bg du cartouche courant (si on a chargé un scénario
    // dont currentCartoucheId pointe sur un cartouche avec bg).
    this.syncCartoucheBg([], this.cartouchePath());
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
   * après un succès de sauvegarde. Met aussi à jour `lastSavedAt`
   * pour permettre l'affichage du flash "✓ Enregistré" en toolbar.
   */
  markSaved(path: string): void {
    this.currentPath = path;
    this.baseSerialization = toJson(this.scenario);
    this.lastSavedAt = Date.now();
  }

  // ============================================================
  // Actions — mode (préparation / jeu)
  // ============================================================

  /**
   * Bascule entre 'edit' et 'play'. Désélectionne pour propreté.
   * Désactive aussi la gomme : la gomme n'a pas de sens en mode Jeu.
   */
  toggleMode(): void {
    this.mode = this.mode === 'edit' ? 'play' : 'edit';
    this.selectedId = null;
    if (this.mode === 'play') {
      this.eraserMode = false;
    }
  }

  /**
   * Bascule le mode gomme (uniquement disponible en mode 'edit').
   * Désélectionne pour éviter la confusion avec l'inspecteur.
   */
  toggleEraser(): void {
    if (this.mode !== 'edit') return;
    this.eraserMode = !this.eraserMode;
    this.selectedId = null;
  }

  /** Sortie explicite du mode gomme (par Échap, par exemple). */
  exitEraser(): void {
    this.eraserMode = false;
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
    const oldPath = this.cartouchePath();
    this.scenario.currentCartoucheId = cartoucheId;
    this.selectedId = null;
    this.ensureCurrentViewExists();
    this.syncCartoucheBg(oldPath, this.cartouchePath());
  }

  /**
   * Remonte d'un niveau. Si on est à la racine ou si le parent est
   * introuvable, retourne à la racine.
   */
  exitCartouche(): void {
    if (this.scenario.currentCartoucheId === null) return;
    const oldPath = this.cartouchePath();
    const parent = getCartoucheParent(this.scenario, this.scenario.currentCartoucheId);
    this.scenario.currentCartoucheId = parent;
    this.selectedId = null;
    this.ensureCurrentViewExists();
    this.syncCartoucheBg(oldPath, this.cartouchePath());
  }

  /**
   * Navigation directe vers un cartouche ou la racine. Utilisé par
   * le fil d'Ariane pour aller à un niveau précis.
   */
  goToCartouche(cartoucheId: NodeId | null): void {
    const oldPath = this.cartouchePath();
    this.scenario.currentCartoucheId = cartoucheId;
    this.selectedId = null;
    this.ensureCurrentViewExists();
    this.syncCartoucheBg(oldPath, this.cartouchePath());
  }

  // ============================================================
  // Helpers — chemin de cartouches + synchronisation des fonds (jalon 10)
  // ============================================================

  /**
   * Liste des cartouches dans le chemin de la racine au cartouche
   * courant. La racine elle-même (parentId === null) n'apparaît pas
   * (elle n'a pas de bg). Sert au sync des bg sur la pile audio.
   */
  private cartouchePath(): NodeId[] {
    const path: NodeId[] = [];
    let cur: Node | undefined = this.scenario.nodes.find(
      (n) => n.id === this.scenario.currentCartoucheId,
    );
    let safety = 1000;
    while (cur && safety-- > 0) {
      path.unshift(cur.id);
      if (cur.parentId === null) break;
      cur = this.scenario.nodes.find((n) => n.id === cur!.parentId);
    }
    return path;
  }

  /**
   * Synchronise les fonds de cartouche dans la pile audio en fonction
   * du changement de chemin. Pour chaque cartouche du nouveau chemin
   * qui n'était pas dans l'ancien, on push son bg ; pour chaque
   * cartouche de l'ancien chemin absent du nouveau, on pop son bg.
   *
   * Un fond est considéré comme « disponible » si :
   *  - mode 'single' avec `bgLocalFilePath` défini, ou
   *  - mode 'sequential' avec une playlist non vide.
   *
   * Tolère le cas où un cartouche n'a pas de bg (rien à faire).
   * Échoue silencieusement si l'autoplay policy bloque le premier push
   * (avant la première interaction utilisateur).
   */
  private syncCartoucheBg(oldPath: NodeId[], newPath: NodeId[]): void {
    const newSet = new Set(newPath);
    const oldSet = new Set(oldPath);

    const hasBg = (n: Node): boolean => {
      if (!isCartouche(n)) return false;
      if (n.bgPlaylistMode === 'sequential' && n.bgPlaylistIds.length > 0) return true;
      return !!n.bgLocalFilePath;
    };

    // Retire d'abord les bg des cartouches qu'on quitte (deepest first).
    for (let i = oldPath.length - 1; i >= 0; i--) {
      const id = oldPath[i];
      if (newSet.has(id)) continue;
      const cartouche = this.scenario.nodes.find((n) => n.id === id);
      if (cartouche && hasBg(cartouche)) {
        engine.popLayerByNodeId(id);
      }
    }

    // Empile les bg des cartouches qu'on rejoint (shallowest first).
    for (const id of newPath) {
      if (oldSet.has(id)) continue;
      const cartouche = this.scenario.nodes.find((n) => n.id === id);
      if (cartouche && isCartouche(cartouche) && hasBg(cartouche)) {
        engine.pushCartoucheBg(cartouche).catch(() => {
          // Échec silencieux : autoplay policy ou fichier introuvable.
          // Le toast d'erreur reste optionnel ici pour ne pas perturber
          // la navigation. L'utilisateur peut tester via Inspecteur.
        });
      }
    }
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
   * Crée une scène avec un fichier audio déjà attaché. Le titre est
   * dérivé du nom du fichier. Utilisé par le drag-drop sur canvas
   * vide pour transformer un MP3 lâché en nœud directement utilisable.
   */
  createSceneFromFile(path: string, title: string, x: number, y: number): Node {
    const node = this.addNode('scene', x, y);
    if (node.type === 'scene') {
      node.title = title;
      node.localFilePath = path;
      node.ytUrl = '';
    }
    return node;
  }

  /**
   * Attache un fichier audio à un nœud audio existant (scène / personnage
   * / tada). Écrase le précédent fichier ou URL YouTube. Renvoie true
   * si l'attachement a réussi, false si la cible n'est pas un nœud audio.
   */
  attachAudioFile(nodeId: NodeId, path: string): boolean {
    const node = this.scenario.nodes.find((n) => n.id === nodeId);
    if (!node) return false;
    if (node.type === 'cartouche') return false;
    node.localFilePath = path;
    node.ytUrl = '';
    return true;
  }

  /**
   * Attache un fichier audio à une cartouche en tant que musique de
   * fond. Écrase le précédent fond. Renvoie true si OK, false si la
   * cible n'est pas une cartouche.
   */
  attachCartoucheBg(cartoucheId: NodeId, path: string): boolean {
    const node = this.scenario.nodes.find((n) => n.id === cartoucheId);
    if (!node || node.type !== 'cartouche') return false;
    node.bgLocalFilePath = path;
    node.bgYtUrl = '';
    return true;
  }

  // ============================================================
  // Actions — playlist fleuve (jalon 15)
  // ============================================================

  /** Bascule entre 'single' et 'sequential' pour le bg d'un cartouche. */
  setBgPlaylistMode(cartoucheId: NodeId, mode: 'single' | 'sequential'): void {
    const node = this.scenario.nodes.find((n) => n.id === cartoucheId);
    if (!node || node.type !== 'cartouche') return;
    node.bgPlaylistMode = mode;
  }

  /** Ajoute un (ou plusieurs) morceau à la playlist d'un cartouche. */
  addBgPlaylistTracks(cartoucheId: NodeId, paths: string[]): void {
    const node = this.scenario.nodes.find((n) => n.id === cartoucheId);
    if (!node || node.type !== 'cartouche') return;
    node.bgPlaylistIds = [...node.bgPlaylistIds, ...paths];
  }

  /** Retire le morceau à l'index donné de la playlist. */
  removeBgPlaylistTrack(cartoucheId: NodeId, index: number): void {
    const node = this.scenario.nodes.find((n) => n.id === cartoucheId);
    if (!node || node.type !== 'cartouche') return;
    if (index < 0 || index >= node.bgPlaylistIds.length) return;
    node.bgPlaylistIds = node.bgPlaylistIds.filter((_, i) => i !== index);
  }

  /**
   * Déplace le morceau à `from` vers la position `to`. Utilisé par
   * les boutons up/down de l'inspecteur.
   */
  reorderBgPlaylistTrack(cartoucheId: NodeId, from: number, to: number): void {
    const node = this.scenario.nodes.find((n) => n.id === cartoucheId);
    if (!node || node.type !== 'cartouche') return;
    const list = node.bgPlaylistIds;
    if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    node.bgPlaylistIds = next;
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

  /**
   * Change le thème graphique du scénario (preset + mode) et applique
   * immédiatement les nouvelles variables CSS au document.
   * Cf. cahier "thèmes graphiques (jalon 14 étendu)" — un toggle
   * clair/sombre est désormais une variation INTERNE à chaque preset.
   */
  setTheme(preset: PresetId, mode: ThemeMode): void {
    this.scenario.theme = { preset, mode };
    applyPreset(preset, mode);
  }

  // ============================================================
  // Actions — options de transition (jalon 16)
  // ============================================================

  /**
   * Change le type de transition (cut / fade / crossfade) et synchronise
   * le moteur audio. Les couches déjà actives ne sont pas affectées :
   * seules les transitions à venir adoptent la nouvelle option.
   */
  setTransitionType(type: TransitionType): void {
    this.scenario.transitions.type = type;
    engine.setTransitions(this.scenario.transitions);
  }

  /** Change la durée du fondu en secondes (clampée 0.5–5.0). */
  setTransitionDuration(sec: number): void {
    const clamped = Math.max(0.5, Math.min(5, sec));
    this.scenario.transitions.durationSec = clamped;
    engine.setTransitions(this.scenario.transitions);
  }

  /** Active ou désactive la reprise sous-jacente au pop. */
  setResumeUnderlying(resume: boolean): void {
    this.scenario.transitions.resumeUnderlying = resume;
    engine.setTransitions(this.scenario.transitions);
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

    // Stoppe l'audio des nœuds supprimés (no-op s'ils n'étaient pas
    // dans la pile). Couvre à la fois les couches normales et les
    // fonds de cartouche.
    for (const id of toDelete) {
      engine.popLayerByNodeId(id);
    }

    return toDelete.size;
  }
}

/** Singleton du store, importé partout dans l'app. */
export const store = new ScenarioStore();
