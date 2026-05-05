/**
 * Thèmes graphiques (presets de palette) — RPG Music Director.
 *
 * Cinq presets cohérents avec différentes ambiances de JdR :
 * - **Lemniscate** : la charte par défaut, sobre, revue savante.
 * - **Parchemin** : fantasy / médiéval, parchemin et sépia.
 * - **Noir** : enquête noire, papier jauni, encre noire, rouge sang.
 * - **Spectre** : horreur cosmique, ardoise, vert malsain (sombre uniquement).
 * - **Datapad** : SF / cyberpunk, terminal, cyan et magenta (sombre uniquement).
 *
 * Chaque preset varie librement les couleurs **esthétiques** (paper,
 * ink, accent, primary) mais garde des familles cohérentes pour les
 * **couleurs sémantiques** (--highlight ≈ jaune chaud / sélection,
 * --playing ≈ vert / lecture, --warm ≈ rouge-orange / danger,
 * --transverse ≈ violet / lien transverse). Cela permet à l'utilisateur
 * de garder ses repères entre presets.
 */

export type PresetId = 'lemniscate' | 'parchemin' | 'noir' | 'spectre' | 'datapad';
export type ThemeMode = 'light' | 'dark';

/** Toutes les variables CSS qu'un preset doit définir. */
export interface PresetPalette {
  paper: string;
  paperSoft: string;
  paperDeep: string;
  ink: string;
  inkSoft: string;
  accent: string;
  accentSoft: string;
  rule: string;
  ruleSoft: string;
  highlight: string;
  playing: string;
  warm: string;
  transverse: string;
  primary: string;
  nodeScene: string;
  nodeCharacter: string;
  nodeStinger: string;
  nodeCartouche: string;
  shadow: string;
}

export interface PresetDefinition {
  id: PresetId;
  /**
   * Variante claire. Null pour les presets nativement sombres
   * (Spectre, Datapad) — le sélecteur clair/sombre est alors verrouillé.
   */
  light: PresetPalette | null;
  /** Variante sombre. Tous les presets ont une variante sombre. */
  dark: PresetPalette;
}

// ============================================================
// Lemniscate — la charte par défaut (vélin, encre brune, bordeaux)
// ============================================================

const LEMNISCATE: PresetDefinition = {
  id: 'lemniscate',
  light: {
    paper: '#faf6ee',
    paperSoft: '#f3ecdc',
    paperDeep: '#ebe2c9',
    ink: '#1a1815',
    inkSoft: '#4a443a',
    accent: '#8a7b5e',
    accentSoft: '#b5a888',
    rule: '#d8cfbc',
    ruleSoft: '#e7dfc8',
    highlight: '#b08c4a',
    playing: '#6a8a5a',
    warm: '#a85a3a',
    transverse: '#7a6a9a',
    primary: '#7a1f15',
    nodeScene: '#e8d8b8',
    nodeCharacter: '#d8c4d0',
    nodeStinger: '#e8c8a8',
    nodeCartouche: '#c8d4c2',
    shadow: '0 1px 2px rgba(40, 30, 15, 0.06)',
  },
  dark: {
    paper: '#15120d',
    paperSoft: '#1d1812',
    paperDeep: '#2a2218',
    ink: '#f3ead6',
    inkSoft: '#c8bd9e',
    accent: '#c0a87a',
    accentSoft: '#8a7b5e',
    rule: '#3a3024',
    ruleSoft: '#2a2218',
    highlight: '#d4a85a',
    playing: '#8aaa6a',
    warm: '#c87a5a',
    transverse: '#aa9ac0',
    primary: '#d67b6a',
    nodeScene: '#2c3a4e',
    nodeCharacter: '#3e2c44',
    nodeStinger: '#4a3826',
    nodeCartouche: '#283a30',
    shadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
  },
};

// ============================================================
// Parchemin — fantasy / médiéval (parchemin jauni, encre sépia)
// ============================================================

const PARCHEMIN: PresetDefinition = {
  id: 'parchemin',
  light: {
    paper: '#f5e8c8',
    paperSoft: '#ede0bc',
    paperDeep: '#e0cf9e',
    ink: '#3a2818',
    inkSoft: '#6b5638',
    accent: '#8a6f4a',
    accentSoft: '#c0a878',
    rule: '#d8c498',
    ruleSoft: '#e8d8b0',
    highlight: '#b08538',
    playing: '#5a7a4a',
    warm: '#a83a28',
    transverse: '#6a4a8a',
    primary: '#7a2030',
    nodeScene: '#d8c8a0',
    nodeCharacter: '#d4b8b0',
    nodeStinger: '#e0c898',
    nodeCartouche: '#b8c8a0',
    shadow: '0 1px 2px rgba(60, 40, 15, 0.1)',
  },
  dark: {
    paper: '#1d1810',
    paperSoft: '#2a2218',
    paperDeep: '#3a2c1c',
    ink: '#e8d8a8',
    inkSoft: '#b09872',
    accent: '#b89868',
    accentSoft: '#806848',
    rule: '#4a3c20',
    ruleSoft: '#3a2e18',
    highlight: '#d8b048',
    playing: '#88a868',
    warm: '#c8584a',
    transverse: '#9878b8',
    primary: '#a83548',
    nodeScene: '#3c3220',
    nodeCharacter: '#3a2828',
    nodeStinger: '#44321c',
    nodeCartouche: '#2a3220',
    shadow: '0 1px 2px rgba(0, 0, 0, 0.4)',
  },
};

// ============================================================
// Encre noire — enquête noire, dossiers d'investigation
// ============================================================

const NOIR: PresetDefinition = {
  id: 'noir',
  light: {
    paper: '#ece4d0',
    paperSoft: '#e0d8c0',
    paperDeep: '#d0c8b0',
    ink: '#0d0d0d',
    inkSoft: '#3a3a3a',
    accent: '#5a5040',
    accentSoft: '#8a8070',
    rule: '#b8a888',
    ruleSoft: '#c8b898',
    highlight: '#b8843a',
    playing: '#5a7a4a',
    warm: '#a01818',
    transverse: '#2a3a6a',
    primary: '#a01818',
    nodeScene: '#d0c4a8',
    nodeCharacter: '#c8b8b0',
    nodeStinger: '#d8c498',
    nodeCartouche: '#b0c0b0',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.15)',
  },
  dark: {
    paper: '#1a1612',
    paperSoft: '#221c16',
    paperDeep: '#2c241c',
    ink: '#d8d0b8',
    inkSoft: '#a89878',
    accent: '#a89878',
    accentSoft: '#7a6a4a',
    rule: '#4a4030',
    ruleSoft: '#382e20',
    highlight: '#d89048',
    playing: '#88a868',
    warm: '#c84838',
    transverse: '#4a6890',
    primary: '#c83838',
    nodeScene: '#382e1c',
    nodeCharacter: '#38241c',
    nodeStinger: '#3c2818',
    nodeCartouche: '#283020',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
  },
};

// ============================================================
// Spectre — horreur cosmique, gothique (sombre uniquement)
// ============================================================

const SPECTRE: PresetDefinition = {
  id: 'spectre',
  light: null,
  dark: {
    paper: '#1a1d22',
    paperSoft: '#22262b',
    paperDeep: '#2c3036',
    ink: '#e0d8c8',
    inkSoft: '#a89c88',
    accent: '#98a890',
    accentSoft: '#6a7a68',
    rule: '#3a4046',
    ruleSoft: '#2c3036',
    highlight: '#98a850',
    playing: '#689868',
    warm: '#c84838',
    transverse: '#8a7898',
    primary: '#7a2828',
    nodeScene: '#2a3038',
    nodeCharacter: '#322834',
    nodeStinger: '#3a2828',
    nodeCartouche: '#2a3230',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.6)',
  },
};

// ============================================================
// Datapad — SF / cyberpunk, terminal (sombre uniquement)
// ============================================================

const DATAPAD: PresetDefinition = {
  id: 'datapad',
  light: null,
  dark: {
    paper: '#0a0e14',
    paperSoft: '#121822',
    paperDeep: '#1a2230',
    ink: '#a8d0e8',
    inkSoft: '#6890b0',
    accent: '#4a8aa8',
    accentSoft: '#2c5a78',
    rule: '#1a3850',
    ruleSoft: '#122838',
    highlight: '#d8c050',
    playing: '#50d8a8',
    warm: '#d84850',
    transverse: '#a868d8',
    primary: '#d040a0',
    nodeScene: '#1a2838',
    nodeCharacter: '#2c1838',
    nodeStinger: '#2c2818',
    nodeCartouche: '#182a28',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.7)',
  },
};

// ============================================================
// Registre + helpers
// ============================================================

export const PRESETS: Record<PresetId, PresetDefinition> = {
  lemniscate: LEMNISCATE,
  parchemin: PARCHEMIN,
  noir: NOIR,
  spectre: SPECTRE,
  datapad: DATAPAD,
};

export const PRESET_IDS: PresetId[] = ['lemniscate', 'parchemin', 'noir', 'spectre', 'datapad'];

/**
 * Renvoie la palette à appliquer pour (preset, mode). Si le preset
 * ne supporte pas la variante demandée (ex. spectre demande light),
 * on retombe sur la variante sombre.
 */
export function resolvePalette(preset: PresetId, mode: ThemeMode): PresetPalette {
  const def = PRESETS[preset];
  if (mode === 'light' && def.light) return def.light;
  return def.dark;
}

/** True si le preset propose une variante claire ET une variante sombre. */
export function presetHasBothModes(preset: PresetId): boolean {
  return PRESETS[preset].light !== null;
}
