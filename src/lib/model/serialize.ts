/**
 * Sérialisation et désérialisation d'un scénario au format `.jmd` (JSON).
 *
 * Le format actuel est versionné (`version: 1`). À chaque changement
 * breaking on incrémente et on ajoute une fonction de migration ici.
 *
 * Migration legacy (proto v9 HTML) :
 *   - Pas de champ `version` → traité comme format proto.
 *   - `localFile` (Blob URL volatile) + `localFileName` → on perd le
 *     fichier (Blob non rechargeable depuis fichier) et on signale
 *     dans les warnings que le MJ devra re-glisser ses fichiers.
 *   - Pas de `language`/`theme` → défauts.
 *   - Pas de `bgPlaylistIds`/`bgPlaylistMode` → playlist vide, mode 'single'.
 */

import { SCENARIO_FILE_VERSION, type Scenario, type ScenarioFile } from './types';
import { validateScenario, type ValidationResult } from './validate';

// ============================================================
// Sérialisation (Scenario → string JSON)
// ============================================================

/**
 * Convertit un scénario en chaîne JSON formatée (indentation 2 espaces).
 * Le résultat est immédiatement écrivable dans un fichier `.jmd`.
 */
export function toJson(scenario: Scenario): string {
  const file: ScenarioFile = {
    version: SCENARIO_FILE_VERSION,
    campaignTitle: scenario.campaignTitle,
    language: scenario.language,
    theme: scenario.theme,
    nodes: scenario.nodes,
    connections: scenario.connections,
    viewByCartouche: scenario.viewByCartouche,
    currentCartoucheId: scenario.currentCartoucheId,
  };
  return JSON.stringify(file, null, 2);
}

// ============================================================
// Désérialisation (string JSON → Scenario)
// ============================================================

export interface LoadResult {
  scenario: Scenario;
  warnings: string[];
  /** True si une migration depuis un format antérieur a été effectuée. */
  migrated: boolean;
}

/**
 * Parse une chaîne JSON et reconstruit un Scenario validé.
 *
 * Lève une `ScenarioValidationError` si le JSON est syntaxiquement valide
 * mais ne décrit pas un scénario reconnaissable. Lève une `SyntaxError`
 * si le JSON est mal formé.
 */
export function fromJson(jsonText: string): LoadResult {
  const raw = JSON.parse(jsonText) as Record<string, unknown>;

  let migrated = false;
  let migratedRaw: Record<string, unknown> = raw;

  if (typeof raw.version !== 'number') {
    // Pas de champ version → format legacy du proto v9 HTML.
    migratedRaw = migrateFromProtoV9(raw);
    migrated = true;
  } else if (raw.version === SCENARIO_FILE_VERSION) {
    // Format courant, rien à migrer.
    migratedRaw = raw;
  } else {
    throw new Error(
      `Version de scénario non reconnue : ${raw.version} ` +
        `(attendu : ${SCENARIO_FILE_VERSION}).`,
    );
  }

  const validation: ValidationResult = validateScenario(migratedRaw);

  // Une fois validé, on peut caster en toute confiance.
  const scenario: Scenario = {
    campaignTitle: migratedRaw.campaignTitle as string,
    language: migratedRaw.language as Scenario['language'],
    theme: migratedRaw.theme as Scenario['theme'],
    nodes: migratedRaw.nodes as Scenario['nodes'],
    connections: migratedRaw.connections as Scenario['connections'],
    viewByCartouche: migratedRaw.viewByCartouche as Scenario['viewByCartouche'],
    currentCartoucheId: migratedRaw.currentCartoucheId as Scenario['currentCartoucheId'],
  };

  return {
    scenario,
    warnings: validation.warnings,
    migrated,
  };
}

// ============================================================
// Migration depuis le format proto v9 HTML
// ============================================================

/**
 * Convertit un objet au format proto v9 vers la forme attendue par
 * `validateScenario`. N'effectue PAS la validation finale — c'est le
 * pipeline `fromJson` qui s'en charge ensuite.
 */
function migrateFromProtoV9(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    version: SCENARIO_FILE_VERSION,
    campaignTitle: typeof raw.campaignTitle === 'string' ? raw.campaignTitle : 'Campagne',
    language: 'fr',
    theme: 'light',
    currentCartoucheId: raw.currentCartoucheId !== undefined ? raw.currentCartoucheId : null,
    viewByCartouche:
      raw.viewByCartouche && typeof raw.viewByCartouche === 'object'
        ? raw.viewByCartouche
        : { root: { scale: 1, panX: 0, panY: 0 } },
    connections: Array.isArray(raw.connections) ? raw.connections : [],
  };

  // Migration des nœuds : Blob URL → null, ajout des champs manquants.
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  out.nodes = rawNodes.map((n) => {
    const node = n as Record<string, unknown>;
    const migrated: Record<string, unknown> = {
      id: node.id,
      type: node.type,
      parentId: node.parentId === undefined ? null : node.parentId,
      x: node.x,
      y: node.y,
      title: typeof node.title === 'string' ? node.title : '',
      notes: typeof node.notes === 'string' ? node.notes : '',
    };
    if (node.type === 'cartouche') {
      migrated.bgLocalFilePath = null; // Blob URL non récupérable.
      migrated.bgYtUrl = typeof node.bgYtUrl === 'string' ? node.bgYtUrl : '';
      migrated.bgPlaylistIds = Array.isArray(node.bgPlaylistIds) ? node.bgPlaylistIds : [];
      migrated.bgPlaylistMode = node.bgPlaylistMode === 'sequential' ? 'sequential' : 'single';
    } else {
      migrated.loop = typeof node.loop === 'boolean' ? node.loop : node.type !== 'stinger';
      migrated.localFilePath = null; // Blob URL non récupérable.
      migrated.ytUrl = typeof node.ytUrl === 'string' ? node.ytUrl : '';
    }
    return migrated;
  });

  return out;
}
