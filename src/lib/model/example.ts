/**
 * Scénario d'exemple chargé au premier démarrage. Adapté du proto v9 :
 * deux parties + un cartouche de PNJ récurrents, avec quelques nœuds
 * et connexions (locales + transverses) pour montrer la mécanique.
 *
 * Tous les nœuds sont sans fichier audio attaché — l'utilisateur les
 * remplira par drag-and-drop ou par URL YouTube.
 */

import type { Scenario } from './types';

export const EXAMPLE_SCENARIO: Scenario = {
  campaignTitle: 'Les Masques de Nyarlathotep',
  language: 'fr',
  theme: 'light',
  appearance: {
    backgroundImagePath: null, // = fossile par défaut
    backgroundOpacity: 12,
  },
  currentCartoucheId: null,
  viewByCartouche: {
    root: { scale: 1, panX: 0, panY: 0 },
  },
  nodes: [
    // === Cartouches racine ===
    {
      id: 1,
      type: 'cartouche',
      parentId: null,
      x: 80,
      y: 80,
      title: "Partie 1 — L'arrivée",
      notes: 'Première session : la traversée et l\'enquête au Bordeaux.',
      bgLocalFilePath: null,
      bgYtUrl: '',
      bgPlaylistIds: [],
      bgPlaylistMode: 'single',
    },
    {
      id: 2,
      type: 'cartouche',
      parentId: null,
      x: 420,
      y: 80,
      title: 'Partie 2 — Le donjon',
      notes: 'Deuxième session : descente dans les catacombes.',
      bgLocalFilePath: null,
      bgYtUrl: '',
      bgPlaylistIds: [],
      bgPlaylistMode: 'single',
    },
    {
      id: 3,
      type: 'cartouche',
      parentId: null,
      x: 80,
      y: 320,
      title: 'PNJ récurrents',
      notes: 'Thèmes utilisables dans toute la campagne.',
      bgLocalFilePath: null,
      bgYtUrl: '',
      bgPlaylistIds: [],
      bgPlaylistMode: 'single',
    },

    // === Contenu de Partie 1 ===
    {
      id: 4,
      type: 'scene',
      parentId: 1,
      x: 60,
      y: 60,
      title: 'Taverne du Vieux Chai',
      notes: 'Ambiance feutrée, brouhaha tamisé.',
      loop: true,
      localFilePath: null,
      ytUrl: '',
    },
    {
      id: 5,
      type: 'scene',
      parentId: 1,
      x: 320,
      y: 60,
      title: 'Forêt brumeuse',
      notes: '',
      loop: true,
      localFilePath: null,
      ytUrl: '',
    },
    {
      id: 6,
      type: 'stinger',
      parentId: 1,
      x: 600,
      y: 60,
      title: 'Rencontre PNJ',
      notes: 'Apparition surprise.',
      loop: false,
      localFilePath: null,
      ytUrl: '',
    },

    // === Contenu de Partie 2 ===
    {
      id: 7,
      type: 'scene',
      parentId: 2,
      x: 60,
      y: 60,
      title: 'Couloir sombre',
      notes: '',
      loop: true,
      localFilePath: null,
      ytUrl: '',
    },
    {
      id: 8,
      type: 'scene',
      parentId: 2,
      x: 320,
      y: 60,
      title: 'Combat final',
      notes: 'Crescendo orchestral.',
      loop: true,
      localFilePath: null,
      ytUrl: '',
    },

    // === PNJ récurrents ===
    {
      id: 9,
      type: 'character',
      parentId: 3,
      x: 60,
      y: 60,
      title: 'Le Voyageur',
      notes: 'PNJ mystérieux, recroisé à plusieurs sessions.',
      loop: true,
      localFilePath: null,
      ytUrl: '',
    },
    {
      id: 10,
      type: 'character',
      parentId: 3,
      x: 320,
      y: 60,
      title: 'Grand méchant',
      notes: '',
      loop: true,
      localFilePath: null,
      ytUrl: '',
    },
  ],
  connections: [
    // Lien local (dans Partie 1) : Taverne → Forêt
    { from: 4, to: 5 },
    // Lien transverse : Forêt brumeuse (Partie 1) → Le Voyageur (PNJ récurrents)
    { from: 5, to: 9 },
    // Lien transverse : Combat final (Partie 2) → Grand méchant (PNJ récurrents)
    { from: 8, to: 10 },
  ],
};
