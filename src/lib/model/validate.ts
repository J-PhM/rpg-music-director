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

import {
  DEFAULT_APPEARANCE,
  DEFAULT_THEME,
  DEFAULT_TRANSITIONS,
  type Connection,
  type Node,
  type NodeId,
  type PresetId,
  type Scenario,
  type TransitionType,
} from './types';

export class ScenarioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioValidationError';
  }
}

const VALID_NODE_TYPES = new Set(['scene', 'character', 'stinger', 'cartouche']);
const VALID_LANGS = new Set(['fr', 'en']);
const VALID_THEME_MODES = new Set(['light', 'dark']);
const VALID_PRESET_IDS = new Set<PresetId>([
  'lemniscate',
  'parchemin',
  'noir',
  'spectre',
  'datapad',
]);
const VALID_BG_MODES = new Set(['single', 'sequential']);
const VALID_TRANSITION_TYPES = new Set<TransitionType>(['fade', 'cut', 'crossfade']);
const TRANSITION_DUR_MIN = 0.5;
const TRANSITION_DUR_MAX = 5;

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
  // Migration thème : ancien format était une string 'light'|'dark'.
  // Nouveau format : { preset: PresetId, mode: 'light'|'dark' }.
  if (typeof scenario.theme === 'string') {
    const oldMode = scenario.theme;
    if (VALID_THEME_MODES.has(oldMode)) {
      scenario.theme = { preset: 'lemniscate', mode: oldMode };
      warnings.push(`Thème ancien format (${oldMode}) migré vers Lemniscate ${oldMode}.`);
    } else {
      scenario.theme = { ...DEFAULT_THEME };
      warnings.push(`Thème invalide (${oldMode}), repli sur défaut.`);
    }
  } else if (!scenario.theme || typeof scenario.theme !== 'object') {
    scenario.theme = { ...DEFAULT_THEME };
  } else {
    const t = scenario.theme as Record<string, unknown>;
    if (typeof t.preset !== 'string' || !VALID_PRESET_IDS.has(t.preset as PresetId)) {
      warnings.push(`Preset de thème invalide (${t.preset}), repli sur 'lemniscate'.`);
      t.preset = 'lemniscate';
    }
    if (typeof t.mode !== 'string' || !VALID_THEME_MODES.has(t.mode)) {
      warnings.push(`Mode de thème invalide (${t.mode}), repli sur 'light'.`);
      t.mode = 'light';
    }
  }

  // appearance : ajouté à la v1 mais peut manquer (fichiers anciens
  // de la même version qui ont été créés avant ce champ). Repli soft.
  if (!scenario.appearance || typeof scenario.appearance !== 'object') {
    scenario.appearance = { ...DEFAULT_APPEARANCE };
  } else {
    const a = scenario.appearance as Record<string, unknown>;
    if (typeof a.backgroundImagePath !== 'string' && a.backgroundImagePath !== null) {
      a.backgroundImagePath = DEFAULT_APPEARANCE.backgroundImagePath;
    }
    if (typeof a.backgroundOpacity !== 'number' || a.backgroundOpacity < 0 || a.backgroundOpacity > 100) {
      a.backgroundOpacity = DEFAULT_APPEARANCE.backgroundOpacity;
    }
  }

  // transitions : ajouté au jalon 16. Migration soft pour les anciens
  // scénarios qui n'ont pas ce champ, ou champ partiellement valide.
  if (!scenario.transitions || typeof scenario.transitions !== 'object') {
    scenario.transitions = { ...DEFAULT_TRANSITIONS };
  } else {
    const tr = scenario.transitions as Record<string, unknown>;
    if (typeof tr.type !== 'string' || !VALID_TRANSITION_TYPES.has(tr.type as TransitionType)) {
      warnings.push(`Type de transition invalide (${tr.type}), repli sur '${DEFAULT_TRANSITIONS.type}'.`);
      tr.type = DEFAULT_TRANSITIONS.type;
    }
    if (
      typeof tr.durationSec !== 'number' ||
      tr.durationSec < TRANSITION_DUR_MIN ||
      tr.durationSec > TRANSITION_DUR_MAX
    ) {
      tr.durationSec = DEFAULT_TRANSITIONS.durationSec;
    }
    if (typeof tr.resumeUnderlying !== 'boolean') {
      tr.resumeUnderlying = DEFAULT_TRANSITIONS.resumeUnderlying;
    }
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
      // Champ Spotify ajouté au jalon 19 — repli sur '' si absent.
      if (typeof n.bgSpotifyUrl !== 'string') {
        n.bgSpotifyUrl = '';
      }
    } else {
      // Champ Spotify sur les nœuds audio (jalon 19) — repli sur ''.
      if (typeof n.spotifyUrl !== 'string') {
        n.spotifyUrl = '';
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
