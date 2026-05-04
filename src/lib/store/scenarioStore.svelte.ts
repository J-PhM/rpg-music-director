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
import { toJson } from '$lib/model/serialize';
import type { Node, NodeId, NodeType, Scenario } from '$lib/model/types';
import { setLang } from '$lib/i18n/i18n.svelte';
import { createNode } from '$lib/model/defaults';

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
   * Nœuds visibles dans le cartouche courant. Pour jalon 3, on n'a pas
   * encore la navigation hiérarchique — on affiche les nœuds racine
   * (parentId === null). Au jalon 5 on filtrera par
   * `currentCartoucheId`.
   */
  visibleNodes = $derived.by((): Node[] => {
    return this.scenario.nodes.filter((n) => n.parentId === this.scenario.currentCartoucheId);
  });

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
