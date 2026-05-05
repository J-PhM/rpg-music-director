/**
 * Modèle de données — RPG Music Director
 *
 * Types TypeScript purs, sans dépendance UI ni Tauri. Tout passe par ce
 * module pour la définition des nœuds, connexions et scénarios.
 *
 * Notes de cohérence avec le cahier des charges :
 * - L'identifiant interne d'un Tada reste 'stinger' (cohérence avec le
 *   proto + libellé internationalisable côté UI).
 * - Les coordonnées (x, y) sont relatives au parent (cartouche), pas
 *   absolues. La racine = parentId === null.
 * - Le champ `loop` est obligatoire pour les nœuds audio mais sa
 *   valeur par défaut est imposée par le type :
 *   true pour scène/personnage, false pour tada.
 */

// ============================================================
// Identifiants et types discriminants
// ============================================================

export type NodeId = number;

export type NodeType = 'scene' | 'character' | 'stinger' | 'cartouche';

export type AudioNodeType = 'scene' | 'character' | 'stinger';

// ============================================================
// Nœuds
// ============================================================

interface BaseNode {
  id: NodeId;
  parentId: NodeId | null;
  x: number;
  y: number;
  title: string;
  notes: string;
}

interface AudioNodeBase extends BaseNode {
  loop: boolean;
  /** Chemin absolu vers un fichier local. Null tant qu'aucun fichier n'est rattaché. */
  localFilePath: string | null;
  /** URL YouTube alternative. Chaîne vide si pas d'URL. */
  ytUrl: string;
}

export interface SceneNode extends AudioNodeBase {
  type: 'scene';
}

export interface CharacterNode extends AudioNodeBase {
  type: 'character';
}

export interface StingerNode extends AudioNodeBase {
  type: 'stinger';
}

export type BgPlaylistMode = 'single' | 'sequential';

export interface CartoucheNode extends BaseNode {
  type: 'cartouche';
  /** Musique de fond du cartouche : chemin absolu vers un fichier local. */
  bgLocalFilePath: string | null;
  /** Musique de fond du cartouche : URL YouTube alternative. */
  bgYtUrl: string;
  /**
   * Playlist séquentielle pour la musique de fond. Liste de chemins absolus
   * et/ou d'URLs YouTube. Ignorée si `bgPlaylistMode === 'single'`.
   */
  bgPlaylistIds: string[];
  bgPlaylistMode: BgPlaylistMode;
}

export type Node = SceneNode | CharacterNode | StingerNode | CartoucheNode;
export type AudioNode = SceneNode | CharacterNode | StingerNode;

export function isAudioNode(node: Node): node is AudioNode {
  return node.type !== 'cartouche';
}

export function isCartouche(node: Node): node is CartoucheNode {
  return node.type === 'cartouche';
}

// ============================================================
// Connexions
// ============================================================

export interface Connection {
  from: NodeId;
  to: NodeId;
}

// ============================================================
// Vue (zoom/pan) par cartouche
// ============================================================

export interface View {
  scale: number;
  panX: number;
  panY: number;
}

/** Clé utilisée dans `viewByCartouche` : 'root' pour la racine, sinon String(id). */
export type ViewKey = string;

export function viewKey(cartoucheId: NodeId | null): ViewKey {
  return cartoucheId === null ? 'root' : String(cartoucheId);
}

// ============================================================
// Scénario complet
// ============================================================

export type Language = 'fr' | 'en';

/**
 * Configuration de thème graphique d'un scénario (jalon 14).
 * Au jalon 1 c'était simplement `'light' | 'dark'`. Désormais
 * structurée en `{ preset, mode }` pour supporter plusieurs presets
 * de palette (Lemniscate, Parchemin, Noir, Spectre, Datapad).
 *
 * Le clair/sombre est une variation INTERNE à chaque preset.
 * Certains presets (Spectre, Datapad) sont nativement sombres et
 * n'ont pas de variante claire — `mode='light'` est alors restauré
 * en `dark` au moment de l'application.
 */
export type PresetId = 'lemniscate' | 'parchemin' | 'noir' | 'spectre' | 'datapad';
export type ThemeMode = 'light' | 'dark';
export interface Theme {
  preset: PresetId;
  mode: ThemeMode;
}

/** Thème par défaut pour les nouveaux scénarios. */
export const DEFAULT_THEME: Theme = { preset: 'lemniscate', mode: 'light' };

/**
 * Préférences d'apparence stockées par scénario. Permet à un MJ
 * d'avoir une texture de fond différente par campagne (parchemin
 * pour D&D, ciel étoilé pour Star Wars, etc.).
 *
 * Conventions :
 * - `backgroundImagePath === null` → utiliser l'image bundlée par défaut (fossile).
 * - `backgroundImagePath === ''`   → ne pas afficher d'image (fond uni vélin).
 * - `backgroundImagePath === '/...'` → chemin absolu vers une image personnalisée.
 * - `backgroundOpacity` est en pourcentage 0–100 (12 = subtil, 40 = présent).
 */
export interface Appearance {
  backgroundImagePath: string | null;
  backgroundOpacity: number;
}

export const DEFAULT_APPEARANCE: Appearance = {
  backgroundImagePath: null, // = image bundlée par défaut
  backgroundOpacity: 12,
};

/**
 * Options de transition audio (jalon 16). S'appliquent à tous les
 * push/pop de la pile principale et du fond de cartouche.
 *
 * Sémantique :
 * - `crossfade` : ancien fade-out + nouveau fade-in **simultanés**,
 *   sur `durationSec`. C'est le défaut, équivalent au comportement
 *   livré au jalon 9.
 * - `fade` : ancien fade-out **puis** nouveau fade-in séquentiels.
 *   Total = `2 × durationSec`. Crée un léger gap de silence.
 * - `cut` : pas de rampe, ancien à 0 immédiat, nouveau à 1 immédiat.
 *
 * `resumeUnderlying` (au pop) : si vrai, la couche en dessous est
 * ramenée à plein volume quand on retire le sommet ; si faux, elle
 * reste muette (le pop est alors un fade-out sec sans relais).
 */
export type TransitionType = 'fade' | 'cut' | 'crossfade';

export interface Transitions {
  type: TransitionType;
  /** Durée du fondu en secondes. Bornée 0.5–5.0 par l'UI. Ignorée si type === 'cut'. */
  durationSec: number;
  resumeUnderlying: boolean;
}

export const DEFAULT_TRANSITIONS: Transitions = {
  type: 'crossfade',
  durationSec: 2,
  resumeUnderlying: true,
};

export interface Scenario {
  campaignTitle: string;
  language: Language;
  theme: Theme;
  appearance: Appearance;
  transitions: Transitions;
  nodes: Node[];
  connections: Connection[];
  viewByCartouche: Record<ViewKey, View>;
  currentCartoucheId: NodeId | null;
}

/** Format de fichier `.jmd` actuel. Incrémenter à chaque changement breaking. */
export const SCENARIO_FILE_VERSION = 1 as const;

export interface ScenarioFile {
  version: typeof SCENARIO_FILE_VERSION;
  campaignTitle: string;
  language: Language;
  theme: Theme;
  appearance: Appearance;
  transitions: Transitions;
  nodes: Node[];
  connections: Connection[];
  viewByCartouche: Record<ViewKey, View>;
  currentCartoucheId: NodeId | null;
}
