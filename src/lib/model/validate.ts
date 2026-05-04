/**
 * Validation structurelle d'un scénario chargé depuis JSON.
 *
 * Distingue deux niveaux :
 * - Erreurs bloquantes : structure invalide, types incorrects → throw.
 * - Avertissements souples : références orphelines, fichiers à re-glisser,
 *   incohérences récupérables → renvoyés dans `warnings`.
 *
 * L'UI affiche les avertissements sous forme de toasts au chargement.
 */

import type { Connection, Node, NodeId, Scenario } from './types';

export class ScenarioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioValidationError';
  }
}

const VALID_NODE_TYPES = new Set(['scene', 'character', 'stinger', 'cartouche']);
const VALID_LANGS = new Set(['fr', 'en']);
const VALID_THEMES = new Set(['light', 'dark']);
const VALID_BG_MODES = new Set(['single', 'sequential']);

export interface ValidationResult {
  warnings: string[];
}

/**
 * Valide un objet candidat à être un Scenario. Lance une exception si la
 * structure est cassée ; renvoie une liste d'avertissements pour les
 * problèmes récupérables.
 *
 * Doit être appelé sur un objet qui a DÉJÀ subi la migration depuis le
 * format legacy (cf. serialize.ts).
 */
export function validateScenario(s: unknown): ValidationResult {
  const warnings: string[] = [];

  if (!s || typeof s !== 'object') {
    throw new ScenarioValidationError('Le scénario doit être un objet JSON.');
  }
  const scenario = s as Record<string, unknown>;

  // Champs obligatoires
  if (typeof scenario.campaignTitle !== 'string') {
    throw new ScenarioValidationError('campaignTitle manquant ou invalide.');
  }
  if (!Array.isArray(scenario.nodes)) {
    throw new ScenarioValidationError('nodes doit être un tableau.');
  }
  if (!Array.isArray(scenario.connections)) {
    throw new ScenarioValidationError('connections doit être un tableau.');
  }
  if (typeof scenario.viewByCartouche !== 'object' || scenario.viewByCartouche === null) {
    throw new ScenarioValidationError('viewByCartouche doit être un objet.');
  }
  if (
    scenario.currentCartoucheId !== null &&
    typeof scenario.currentCartoucheId !== 'number'
  ) {
    throw new ScenarioValidationError('currentCartoucheId doit être un entier ou null.');
  }
  if (typeof scenario.language !== 'string' || !VALID_LANGS.has(scenario.language)) {
    warnings.push(`Langue invalide ou manquante (${scenario.language}), repli sur 'fr'.`);
    scenario.language = 'fr';
  }
  if (typeof scenario.theme !== 'string' || !VALID_THEMES.has(scenario.theme)) {
    warnings.push(`Thème invalide ou manquant (${scenario.theme}), repli sur 'light'.`);
    scenario.theme = 'light';
  }

  // Validation des nœuds
  const ids = new Set<NodeId>();
  for (let i = 0; i < scenario.nodes.length; i++) {
    const n = scenario.nodes[i] as Record<string, unknown>;
    if (typeof n.id !== 'number') {
      throw new ScenarioValidationError(`Nœud #${i} : id manquant ou non numérique.`);
    }
    if (ids.has(n.id as NodeId)) {
      throw new ScenarioValidationError(`Nœud #${i} : id ${n.id} en doublon.`);
    }
    ids.add(n.id as NodeId);
    if (typeof n.type !== 'string' || !VALID_NODE_TYPES.has(n.type)) {
      throw new ScenarioValidationError(`Nœud ${n.id} : type '${n.type}' invalide.`);
    }
    if (n.parentId !== null && typeof n.parentId !== 'number') {
      throw new ScenarioValidationError(`Nœud ${n.id} : parentId doit être un entier ou null.`);
    }
    if (typeof n.x !== 'number' || typeof n.y !== 'number') {
      throw new ScenarioValidationError(`Nœud ${n.id} : x/y doivent être numériques.`);
    }
    if (typeof n.title !== 'string') {
      warnings.push(`Nœud ${n.id} : titre manquant, valeur vide forcée.`);
      n.title = '';
    }
    if (n.type === 'cartouche') {
      if (n.bgPlaylistMode !== undefined && !VALID_BG_MODES.has(n.bgPlaylistMode as string)) {
        warnings.push(`Cartouche ${n.id} : bgPlaylistMode invalide, repli sur 'single'.`);
        n.bgPlaylistMode = 'single';
      }
    }
  }

  // Vérification des références parentId → existence et type cartouche
  for (const n of scenario.nodes as Node[]) {
    if (n.parentId === null) continue;
    if (!ids.has(n.parentId)) {
      throw new ScenarioValidationError(
        `Nœud ${n.id} : parentId ${n.parentId} ne correspond à aucun nœud.`,
      );
    }
    const parent = (scenario.nodes as Node[]).find((p) => p.id === n.parentId);
    if (!parent || parent.type !== 'cartouche') {
      throw new ScenarioValidationError(
        `Nœud ${n.id} : parentId ${n.parentId} n'est pas un cartouche.`,
      );
    }
  }

  // Validation des connexions (souple : on ignore les orphelines avec un warning)
  const validConnections: Connection[] = [];
  for (let i = 0; i < scenario.connections.length; i++) {
    const c = scenario.connections[i] as Record<string, unknown>;
    if (typeof c.from !== 'number' || typeof c.to !== 'number') {
      warnings.push(`Connexion #${i} : from/to non numériques, ignorée.`);
      continue;
    }
    if (!ids.has(c.from as NodeId) || !ids.has(c.to as NodeId)) {
      warnings.push(`Connexion ${c.from}→${c.to} : extrémité orpheline, ignorée.`);
      continue;
    }
    validConnections.push({ from: c.from as NodeId, to: c.to as NodeId });
  }
  scenario.connections = validConnections;

  // currentCartoucheId doit pointer vers un cartouche existant (ou null = racine)
  if (scenario.currentCartoucheId !== null && !ids.has(scenario.currentCartoucheId as NodeId)) {
    warnings.push(
      `currentCartoucheId ${scenario.currentCartoucheId} ne correspond à aucun nœud, repli sur racine.`,
    );
    scenario.currentCartoucheId = null;
  }

  return { warnings };
}
