/**
 * Dictionnaires de chaînes — RPG Music Director.
 *
 * Le français est la langue de référence. L'anglais sera ajouté au
 * jalon 13. Toute clé manquante dans une langue cible retombe sur la
 * valeur française, puis sur la clé brute si même le FR est absent.
 *
 * Convention de clés : `domaine.action` ou `domaine.zone.element`.
 *   - `toolbar.*`     boutons de la barre d'outils
 *   - `inspector.*`   labels et champs du panneau d'inspection
 *   - `node.*`        libellés et descriptions des types de nœuds
 *   - `toast.*`       messages flottants
 *   - `confirm.*`     boîtes de dialogue de confirmation
 *   - `state.*`       indicateurs d'état (modifié, etc.)
 *   - `empty.*`       textes d'état vide
 */

export type Language = 'fr' | 'en';

const fr = {
  // === Toolbar ===
  'toolbar.appName': 'RPG Music Director',
  'toolbar.new': 'Nouveau',
  'toolbar.open': 'Ouvrir',
  'toolbar.save': 'Enregistrer',
  'toolbar.saveAs': 'Enregistrer sous',
  'toolbar.example': 'Exemple',
  'toolbar.addScene': '+ Scène',
  'toolbar.addCharacter': '+ Personnage',
  'toolbar.addStinger': '+ Tada',
  'toolbar.addCartouche': '+ Cartouche',
  'toolbar.delete': 'Supprimer',
  'toolbar.recadrer': 'Recadrer',
  'toolbar.settings': 'Paramètres',
  'toolbar.tooltip.tauriOnly': 'Disponible uniquement dans la fenêtre Tauri',

  // === Paramètres (modale) ===
  'settings.title': 'Paramètres du scénario',
  'settings.close': 'Fermer',
  'settings.section.appearance': 'Apparence',
  'settings.section.language': 'Langue',
  'settings.bg.label': 'Image de fond',
  'settings.bg.default': 'Image par défaut',
  'settings.bg.custom': 'Choisir une image…',
  'settings.bg.none': 'Aucune image',
  'settings.bg.current.default': 'Fossile (par défaut)',
  'settings.bg.current.none': 'Aucune image',
  'settings.bg.opacity': 'Opacité',
  'settings.bg.opacityValue': '{n} %',
  'settings.bg.hint':
    'L’image apparaît derrière le canvas. Une opacité basse (10–15 %) est recommandée pour ne pas distraire pendant l’édition.',
  'settings.lang.label': 'Langue d’affichage',
  'settings.lang.fr': 'Français',
  'settings.lang.en': 'English',
  'settings.lang.hint':
    'La langue est mémorisée dans le scénario. Au chargement d’un fichier partagé, la langue d’affichage suit celle du scénario.',
  'settings.toast.bgChanged': 'Fond mis à jour',
  'settings.toast.bgRemoved': 'Fond retiré',
  'settings.toast.bgReset': 'Fond par défaut',

  // === Indicateurs d'état ===
  'state.modified': 'Modifié',
  'state.modifiedTooltip': 'Modifications non sauvegardées',

  // === Types de nœuds ===
  'node.type.scene': 'Scène',
  'node.type.character': 'Personnage',
  'node.type.stinger': 'Tada',
  'node.type.cartouche': 'Cartouche',

  'node.hint.scene': 'Une ambiance de fond, généralement en boucle.',
  'node.hint.character': 'Un thème lié à un PNJ ou PJ, joué en superposition.',
  'node.hint.stinger':
    'Une virgule sonore brève pour souligner un moment : révélation, victoire, coup de théâtre.',
  'node.hint.cartouche': 'Un conteneur qui regroupe d’autres nœuds. Double-clique pour entrer.',

  'node.default.scene': 'Nouvelle scène',
  'node.default.character': 'Nouveau personnage',
  'node.default.stinger': 'Nouveau tada',
  'node.default.cartouche': 'Nouveau cartouche',

  // Sous-titres affichés sur les nœuds (état du fichier audio)
  'node.audio.local': 'fichier local',
  'node.audio.youtube': 'YouTube',
  'node.audio.none': 'pas de morceau',
  'node.audio.loop': 'boucle',
  'node.audio.once': 'une fois',

  // === Inspecteur ===
  'inspector.heading': 'Inspecteur',
  'inspector.fields.title': 'Titre',
  'inspector.fields.notes': 'Notes du MJ',
  'inspector.fields.notesPlaceholder': 'Quand déclencher, intentions narratives…',
  'inspector.fields.ytUrl': 'URL YouTube — optionnel si fichier local',
  'inspector.fields.loop': 'Lecture en boucle',
  'inspector.fields.bgYtUrl': 'URL YouTube de fond',
  'inspector.fields.bgPlaylistMode': 'Mode du fond',
  'inspector.fields.bgPlaylistMode.single': 'Morceau unique',
  'inspector.fields.bgPlaylistMode.sequential': 'Playlist séquentielle',
  'inspector.actions.test': 'Tester',
  'inspector.actions.stop': 'Stop',
  'inspector.actions.detach': 'Détacher',
  'inspector.actions.enterCartouche': 'Entrer dans le cartouche',
  'inspector.fileHint': 'Tu peux glisser un fichier audio directement sur ce nœud.',
  'inspector.fileHintCartouche':
    'Tu peux glisser un fichier audio sur ce cartouche pour en faire la musique de fond.',
  'inspector.fileStatus.local': 'Fichier local',
  'inspector.fileStatus.bgLocal': 'Fond actif',
  'inspector.fileStatus.toReglue': 'Fichier à re-glisser',
  'inspector.bgHint':
    'Démarre en boucle quand on entre dans ce cartouche. Mise en sourdine quand une scène joue par-dessus, reprend automatiquement quand la scène s’arrête.',
  'inspector.contentCount.zero': '(vide)',
  'inspector.contentCount.one': '1 élément',
  'inspector.contentCount.many': '{n} éléments',

  // === État vide de l'inspecteur ===
  'empty.inspector': 'Sélectionne un nœud pour l’éditer.',
  'empty.canvas':
    'Aucun nœud pour l’instant. Ajoute une scène, un personnage, un tada ou un cartouche depuis la barre d’outils ci-dessus.',

  // === Toasts ===
  'toast.newScenario': 'Nouveau scénario',
  'toast.exampleLoaded': 'Exemple rechargé',
  'toast.opened': 'Ouvert',
  'toast.openedMigrated': 'Ouvert · format migré',
  'toast.saved': 'Enregistré',
  'toast.warningSuffix.one': '· 1 avertissement',
  'toast.warningSuffix.many': '· {n} avertissements',
  'toast.error': 'Erreur : {msg}',
  'toast.nodeAdded': 'Nœud ajouté',
  'toast.nodeDeleted': 'Supprimé',
  'toast.nodesDeleted': '{n} éléments supprimés',
  'toast.nothingSelected': 'Aucun nœud sélectionné',
  'toast.connectionCreated': 'Connexion créée',
  'toast.connectionTransverse': 'Connexion transverse créée',
  'toast.connectionDeleted': 'Connexion supprimée',
  'toast.connectionExists': 'Cette connexion existe déjà',
  'toast.connectionInvalid': 'Connexion impossible',

  // === Confirmations ===
  'confirm.discardChanges': 'Modifications non sauvegardées. Continuer ?',
  'confirm.deleteCartoucheWithChildren':
    'Supprimer le cartouche « {title} » et ses {n} élément(s) ?',
} as const;

export type DictKey = keyof typeof fr;

/**
 * Dictionnaires par langue. La structure est `Partial<typeof fr>` pour
 * autoriser les langues partielles (avec repli sur FR pour les clés
 * manquantes).
 */
export const dictionaries: Record<Language, Partial<Record<DictKey, string>>> = {
  fr,
  en: {
    // À remplir au jalon 13.
  },
};

/** Référence FR exportée pour le repli. */
export const FR = fr;
