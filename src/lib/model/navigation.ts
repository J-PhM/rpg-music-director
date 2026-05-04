/**
 * Helpers purs pour la navigation hiérarchique dans un scénario.
 *
 * Un scénario est un arbre de nœuds dont la racine est virtuelle
 * (parentId === null) et porte le titre de campagne. Ces helpers ne
 * modifient rien — ils sont utilisés par le store et les composants
 * pour construire le fil d'Ariane, les marqueurs transverses, etc.
 */

import type { NodeId, Scenario } from './types';

export interface BreadcrumbItem {
  /** id du cartouche, ou `null` pour la racine (titre de la campagne). */
  id: NodeId | null;
  title: string;
}

/**
 * Construit le fil d'Ariane de la racine jusqu'à `cartoucheId`.
 * Le premier élément est toujours la racine (titre de campagne) ;
 * le dernier est le cartouche courant.
 *
 * Exemples :
 *   getBreadcrumb(s, null)
 *     → [{id: null, title: "Les Masques de Nyarlathotep"}]
 *   getBreadcrumb(s, partie1Id)
 *     → [{id: null, title: "Les Masques…"}, {id: 1, title: "Partie 1"}]
 */
export function getBreadcrumb(
  scenario: Scenario,
  cartoucheId: NodeId | null,
): BreadcrumbItem[] {
  const root: BreadcrumbItem = { id: null, title: scenario.campaignTitle };
  if (cartoucheId === null) return [root];

  const chain: BreadcrumbItem[] = [];
  let current = scenario.nodes.find((n) => n.id === cartoucheId);
  // Garde-fou : limite la profondeur pour éviter une boucle infinie
  // si parentId pointe vers un descendant (scénario corrompu).
  let safety = 1000;
  while (current && safety-- > 0) {
    chain.unshift({ id: current.id, title: current.title });
    if (current.parentId === null) break;
    const parent = scenario.nodes.find((n) => n.id === current!.parentId);
    if (!parent) break;
    current = parent;
  }
  return [root, ...chain];
}

/**
 * Renvoie le chemin complet d'un nœud sous forme de chaîne
 * "Cartouche A / Cartouche B / Nom du nœud". Utilisé par les
 * marqueurs transverses pour indiquer où va une connexion.
 */
export function getNodeFullPath(scenario: Scenario, nodeId: NodeId): string {
  const node = scenario.nodes.find((n) => n.id === nodeId);
  if (!node) return '';
  const chain: string[] = [node.title];
  let current = node;
  let safety = 1000;
  while (current.parentId !== null && safety-- > 0) {
    const parent = scenario.nodes.find((n) => n.id === current.parentId);
    if (!parent) break;
    chain.unshift(parent.title);
    current = parent;
  }
  return chain.join(' / ');
}

/**
 * Renvoie le parentId d'une cartouche (utile pour « remonter d'un
 * niveau »). Renvoie null si le cartouche est à la racine ou
 * introuvable.
 */
export function getCartoucheParent(
  scenario: Scenario,
  cartoucheId: NodeId,
): NodeId | null {
  const node = scenario.nodes.find((n) => n.id === cartoucheId);
  return node?.parentId ?? null;
}
