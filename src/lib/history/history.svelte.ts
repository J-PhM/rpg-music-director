/**
 * Historique d'annulation / rétablissement (jalon 12).
 *
 * Approche : **snapshot-based**. Avant chaque action utilisateur
 * historisée, on sérialise la portion "données" du scénario et on
 * empile sur la pile undo. Annuler = restaurer le snapshot, en
 * empilant l'état courant sur la pile redo.
 *
 * **Périmètre des snapshots** : on ne sauvegarde que la partie
 * "données" du scénario (titre, nœuds, connexions, apparence) — pas
 * la navigation (currentCartoucheId, viewByCartouche), ni la langue,
 * ni le mode. Cf. cahier "Actions non historisées : navigation entre
 * cartouches, changements de zoom/pan, bascule mode, toggle thème
 * ou langue".
 *
 * **Coalescing** : pour les actions à granularité fine (slider
 * d'opacité, frappe rapide dans un champ texte), on utilise une clé
 * et un délai. Si deux snapshots consécutifs ont la même clé et que
 * l'écart temporel est < `coalesceMs`, le second est absorbé par le
 * premier (le snapshot original — l'état AVANT la première
 * modification — reste celui qu'on restaurera).
 *
 * **Limite** : 50 snapshots dans la pile undo (cf. cahier).
 */

import type { Appearance, Connection, Node } from '$lib/model/types';
import { store } from '$lib/store/scenarioStore.svelte';

const MAX_HISTORY = 50;

/** Sous-ensemble du scénario qui est versionné par l'historique. */
interface DataSnapshot {
  campaignTitle: string;
  nodes: Node[];
  connections: Connection[];
  appearance: Appearance;
}

interface SnapshotEntry {
  /** Sérialisation JSON de la partie données. */
  json: string;
  /** Description courte (pour debug ou UI future "menu Undo : <descr>"). */
  description: string;
  /** Clé optionnelle pour le coalescing temporel. */
  coalesceKey?: string;
  /** Date de création (ms). Mis à jour à chaque coalesce. */
  timestamp: number;
}

function takeDataSnapshot(): string {
  // Sérialisation JSON ciblée — plus rapide et plus petit qu'un toJson
  // global qui inclut viewByCartouche, language, theme, etc.
  return JSON.stringify({
    campaignTitle: store.scenario.campaignTitle,
    nodes: store.scenario.nodes,
    connections: store.scenario.connections,
    appearance: store.scenario.appearance,
  } satisfies DataSnapshot);
}

function restoreDataSnapshot(json: string): void {
  const data = JSON.parse(json) as DataSnapshot;
  store.scenario.campaignTitle = data.campaignTitle;
  store.scenario.nodes = data.nodes;
  store.scenario.connections = data.connections;
  store.scenario.appearance = data.appearance;
  // Si la sélection pointait vers un nœud qui n'existe plus, désélectionne.
  if (
    store.selectedId !== null &&
    !data.nodes.some((n) => n.id === store.selectedId)
  ) {
    store.selectedId = null;
  }
}

class HistoryManager {
  undoStack = $state<SnapshotEntry[]>([]);
  redoStack = $state<SnapshotEntry[]>([]);

  canUndo = $derived(this.undoStack.length > 0);
  canRedo = $derived(this.redoStack.length > 0);

  /**
   * Pousse un snapshot de l'état COURANT (avant la mutation à venir)
   * sur la pile undo. À appeler **avant** toute modification du
   * scénario qu'on veut pouvoir annuler.
   *
   * @param description - Texte court (FR), utile pour debug.
   * @param coalesceKey - Si fourni, et si la dernière entrée undo a la
   *   même clé et est < coalesceMs ms, on n'empile pas (l'ancienne
   *   reste, son timestamp est rafraîchi). Permet de fondre les
   *   actions atomiques rapides (slider, frappe) en un seul undo.
   * @param coalesceMs - Fenêtre temporelle pour le coalescing. Défaut
   *   500 ms (cf. cahier "une pause de 500 ms valide l'action").
   */
  snapshot(description: string, coalesceKey?: string, coalesceMs = 500): void {
    const now = Date.now();
    if (coalesceKey && this.undoStack.length > 0) {
      const last = this.undoStack[this.undoStack.length - 1];
      if (last.coalesceKey === coalesceKey && now - last.timestamp < coalesceMs) {
        // Coalesce : on garde l'ancien snapshot (= l'état ORIGINAL
        // avant la salve d'éditions), on rafraîchit juste son timestamp.
        last.timestamp = now;
        // On ne vide PAS la redo stack ici — l'utilisateur n'a pas
        // commencé une nouvelle "branche" d'historique, il continue
        // une édition en cours.
        return;
      }
    }

    this.undoStack.push({
      json: takeDataSnapshot(),
      description,
      coalesceKey,
      timestamp: now,
    });
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    // Toute nouvelle action invalide la pile redo.
    this.redoStack = [];
  }

  /**
   * Annule la dernière action historisée. L'état courant est sauvé
   * sur la pile redo pour permettre Ctrl+Y.
   */
  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    // Sauve l'état courant pour redo
    this.redoStack.push({
      json: takeDataSnapshot(),
      description: entry.description,
      coalesceKey: undefined,
      timestamp: Date.now(),
    });
    restoreDataSnapshot(entry.json);
    return true;
  }

  /**
   * Refait la dernière action annulée. Symétrique de undo.
   */
  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push({
      json: takeDataSnapshot(),
      description: entry.description,
      coalesceKey: undefined,
      timestamp: Date.now(),
    });
    restoreDataSnapshot(entry.json);
    return true;
  }

  /** Vide les deux piles. À appeler à chaque chargement de scénario. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Renvoie une sérialisation JSON de l'état courant des données.
   * Utile pour les actions à boundary (drag, session d'édition de
   * champ texte) : on capture l'état AVANT, on le passe à
   * `pushExplicit` à la fin si une vraie modification a eu lieu.
   */
  currentSnapshot(): string {
    return takeDataSnapshot();
  }

  /**
   * Pousse un snapshot pré-sérialisé sur la pile undo. Pendant un
   * drag de plusieurs secondes par exemple, on appelle
   * `currentSnapshot()` au début, on garde le résultat en local, on
   * appelle `pushExplicit(snapshot, ...)` à la fin uniquement si
   * quelque chose a vraiment changé. Évite de polluer l'historique
   * avec des "déplacements de zéro".
   */
  pushExplicit(json: string, description: string): void {
    // Si l'état n'a pas changé entre le snapshot et maintenant,
    // l'undo serait un no-op visible : on évite.
    if (json === takeDataSnapshot()) return;
    this.undoStack.push({
      json,
      description,
      coalesceKey: undefined,
      timestamp: Date.now(),
    });
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }
}

/** Singleton de l'historique d'annulation. */
export const history = new HistoryManager();
