/**
 * Factories de création de nœuds avec valeurs par défaut conformes au cahier.
 *
 * L'attribution des `id` est faite par le caller via `nextId(scenario)` —
 * elle n'est pas la responsabilité de ces factories pour rester pures et
 * facilement testables.
 */

import {
  DEFAULT_APPEARANCE,
  DEFAULT_THEME,
  DEFAULT_TRANSITIONS,
  type CartoucheNode,
  type CharacterNode,
  type Node,
  type NodeId,
  type SceneNode,
  type Scenario,
  type StingerNode,
} from './types';

interface NodePosition {
  parentId: NodeId | null;
  x: number;
  y: number;
}

interface NodeCreation extends NodePosition {
  id: NodeId;
}

export function createScene(p: NodeCreation): SceneNode {
  return {
    id: p.id,
    type: 'scene',
    parentId: p.parentId,
    x: p.x,
    y: p.y,
    title: 'Nouvelle scène',
    notes: '',
    loop: true,
    localFilePath: null,
    ytUrl: '',
    spotifyUrl: '',
  };
}

export function createCharacter(p: NodeCreation): CharacterNode {
  return {
    id: p.id,
    type: 'character',
    parentId: p.parentId,
    x: p.x,
    y: p.y,
    title: 'Nouveau personnage',
    notes: '',
    loop: true,
    localFilePath: null,
    ytUrl: '',
    spotifyUrl: '',
  };
}

export function createStinger(p: NodeCreation): StingerNode {
  return {
    id: p.id,
    type: 'stinger',
    parentId: p.parentId,
    x: p.x,
    y: p.y,
    title: 'Nouveau tada',
    notes: '',
    loop: false,
    localFilePath: null,
    ytUrl: '',
    spotifyUrl: '',
  };
}

export function createCartouche(p: NodeCreation): CartoucheNode {
  return {
    id: p.id,
    type: 'cartouche',
    parentId: p.parentId,
    x: p.x,
    y: p.y,
    title: 'Nouveau cartouche',
    notes: '',
    bgLocalFilePath: null,
    bgYtUrl: '',
    bgSpotifyUrl: '',
    bgPlaylistIds: [],
    bgPlaylistMode: 'single',
  };
}

/** Renvoie le prochain id libre pour un scénario donné (max + 1, ou 1 si vide). */
export function nextId(scenario: Scenario): NodeId {
  let max = 0;
  for (const n of scenario.nodes) {
    if (n.id > max) max = n.id;
  }
  return max + 1;
}

/** Crée un scénario vierge (racine vide, vue par défaut). */
export function emptyScenario(campaignTitle = 'Nouvelle campagne'): Scenario {
  return {
    campaignTitle,
    language: 'fr',
    theme: { ...DEFAULT_THEME },
    appearance: { ...DEFAULT_APPEARANCE },
    transitions: { ...DEFAULT_TRANSITIONS },
    nodes: [],
    connections: [],
    viewByCartouche: { root: { scale: 1, panX: 0, panY: 0 } },
    currentCartoucheId: null,
  };
}

/** Construit un nœud du type donné. Helper d'aiguillage utilisé par l'UI. */
export function createNode(
  type: Node['type'],
  position: NodeCreation,
): Node {
  switch (type) {
    case 'scene':
      return createScene(position);
    case 'character':
      return createCharacter(position);
    case 'stinger':
      return createStinger(position);
    case 'cartouche':
      return createCartouche(position);
  }
}
