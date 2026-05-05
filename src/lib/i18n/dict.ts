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
  'toolbar.modePlay': '▶ Mode Jeu',
  'toolbar.modeEdit': 'Mode Préparation',
  'toolbar.eraser': '🧽 Gomme',
  'toolbar.undo': '↶ Annuler',
  'toolbar.redo': '↷ Rétablir',
  'toolbar.tooltip.tauriOnly': 'Disponible uniquement dans la fenêtre Tauri',
  'toolbar.tooltip.eraserNotInPlay': 'La gomme n’est pas disponible en mode Jeu',
  'toolbar.tooltip.undo': 'Annuler (Ctrl+Z)',
  'toolbar.tooltip.redo': 'Rétablir (Ctrl+Y)',
  'toast.undone': 'Annulé',
  'toast.redone': 'Rétabli',
  'toast.cantUndo': 'Rien à annuler',
  'toast.cantRedo': 'Rien à rétablir',

  // === Mode gomme (jalon 11) ===
  'eraser.banner': 'Mode Gomme — clic pour effacer · Échap pour sortir',
  'toast.eraserOn': 'Mode Gomme activé',
  'toast.eraserOff': 'Mode Gomme désactivé',
  'toast.connectionErased': 'Connexion effacée',
  'toast.nodeErased': 'Effacé',
  'toast.nodesErased': '{n} éléments effacés',
  'confirm.eraseCartoucheWithChildren':
    'Effacer le cartouche « {title} » et ses {n} élément(s) ?',

  // === Badge de mode ===
  'mode.edit': 'Préparation',
  'mode.play': 'Jeu',
  'mode.tooltip.noEditInPlay': 'Édition désactivée en mode Jeu',

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
  'toast.fileAttached': 'Fichier attaché : {name}',
  'toast.bgAttached': 'Fond du cartouche : {name}',
  'toast.sceneCreatedFromFile': 'Scène créée : {name}',
  'toast.scenesCreated': '{n} scènes créées',
  'toast.notAudioFile': 'Format audio non reconnu : {name}',
  'toast.noAudioFiles': 'Aucun fichier audio dans le glissé',
  'toast.triggerPlaceholder': '▶ {title} (audio à venir au jalon 9)',
  'toast.triggerNoFile': '⚠ Aucun morceau attaché à « {title} »',
  'toast.triggerYoutubeNotYet':
    '⚠ « {title} » n’a qu’une URL YouTube — la lecture YouTube viendra au jalon 17. Glisse un fichier local en attendant.',
  'toast.audioError': 'Erreur audio : {msg}',
  'toast.audioPushed': '▶ {title}',
  'toast.audioStinger': '✨ {title}',
  'toast.audioStopped': 'Tout arrêté',
  'toast.audioFadingOut': 'Fade out…',

  // === Barre de lecture (jalon 9) ===
  'playback.now': 'En cours',
  'playback.tada': 'Tada',
  'playback.stack': 'Pile',
  'playback.silent': '— silence —',
  'playback.empty': '—',
  'playback.layers.zero': '— vide —',
  'playback.layers.one': '1 couche',
  'playback.layers.many': '{n} couches',
  'playback.stopAll': 'Tout arrêter',
  'playback.fadeOut': 'Fade out',

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
 *
 * Choix éditoriaux pour l'anglais :
 * - Cartouche → Group (plus clair qu'un anglicisme « cartouche »)
 * - Tada → Sting (terme technique anglais standard du musical sting)
 * - Mode Jeu → Performance mode (« Play » prête à confusion avec
 *   « play music »)
 * - On garde « MJ » → « GM » (Game Master, universel en JdR EN)
 */
const en: Partial<Record<DictKey, string>> = {
  // === Toolbar ===
  'toolbar.appName': 'RPG Music Director',
  'toolbar.new': 'New',
  'toolbar.open': 'Open',
  'toolbar.save': 'Save',
  'toolbar.saveAs': 'Save as',
  'toolbar.example': 'Example',
  'toolbar.addScene': '+ Scene',
  'toolbar.addCharacter': '+ Character',
  'toolbar.addStinger': '+ Sting',
  'toolbar.addCartouche': '+ Group',
  'toolbar.delete': 'Delete',
  'toolbar.recadrer': 'Recenter',
  'toolbar.settings': 'Settings',
  'toolbar.modePlay': '▶ Performance mode',
  'toolbar.modeEdit': 'Edit mode',
  'toolbar.eraser': '🧽 Eraser',
  'toolbar.undo': '↶ Undo',
  'toolbar.redo': '↷ Redo',
  'toolbar.tooltip.tauriOnly': 'Available only in the Tauri window',
  'toolbar.tooltip.eraserNotInPlay': 'Eraser is not available in performance mode',
  'toolbar.tooltip.undo': 'Undo (Ctrl+Z)',
  'toolbar.tooltip.redo': 'Redo (Ctrl+Y)',
  'toast.undone': 'Undone',
  'toast.redone': 'Redone',
  'toast.cantUndo': 'Nothing to undo',
  'toast.cantRedo': 'Nothing to redo',

  // === Eraser mode ===
  'eraser.banner': 'Eraser mode — click to erase · Esc to exit',
  'toast.eraserOn': 'Eraser mode on',
  'toast.eraserOff': 'Eraser mode off',
  'toast.connectionErased': 'Connection erased',
  'toast.nodeErased': 'Erased',
  'toast.nodesErased': '{n} items erased',
  'confirm.eraseCartoucheWithChildren':
    'Erase group "{title}" and its {n} item(s)?',

  // === Mode badge ===
  'mode.edit': 'Edit',
  'mode.play': 'Performance',
  'mode.tooltip.noEditInPlay': 'Editing is disabled in performance mode',

  // === Settings (modal) ===
  'settings.title': 'Scenario settings',
  'settings.close': 'Close',
  'settings.section.appearance': 'Appearance',
  'settings.section.language': 'Language',
  'settings.bg.label': 'Background image',
  'settings.bg.default': 'Default image',
  'settings.bg.custom': 'Choose an image…',
  'settings.bg.none': 'No image',
  'settings.bg.current.default': 'Fossil (default)',
  'settings.bg.current.none': 'No image',
  'settings.bg.opacity': 'Opacity',
  'settings.bg.opacityValue': '{n}%',
  'settings.bg.hint':
    'The image appears behind the canvas. A low opacity (10–15%) is recommended to avoid distracting you while editing.',
  'settings.lang.label': 'Display language',
  'settings.lang.fr': 'Français',
  'settings.lang.en': 'English',
  'settings.lang.hint':
    'The language is saved with the scenario. When loading a shared file, the display language follows the scenario.',
  'settings.toast.bgChanged': 'Background updated',
  'settings.toast.bgRemoved': 'Background removed',
  'settings.toast.bgReset': 'Default background restored',

  // === State indicators ===
  'state.modified': 'Modified',
  'state.modifiedTooltip': 'Unsaved changes',

  // === Node types ===
  'node.type.scene': 'Scene',
  'node.type.character': 'Character',
  'node.type.stinger': 'Sting',
  'node.type.cartouche': 'Group',

  'node.hint.scene': 'A background ambience, usually looping.',
  'node.hint.character':
    'A theme tied to a PC or NPC, played on top of the current ambience.',
  'node.hint.stinger':
    'A short musical sting to underline a moment: revelation, victory, plot twist.',
  'node.hint.cartouche': 'A container that groups other nodes. Double-click to enter.',

  'node.default.scene': 'New scene',
  'node.default.character': 'New character',
  'node.default.stinger': 'New sting',
  'node.default.cartouche': 'New group',

  // Subtitles shown on the nodes (audio file state)
  'node.audio.local': 'local file',
  'node.audio.youtube': 'YouTube',
  'node.audio.none': 'no audio',
  'node.audio.loop': 'loop',
  'node.audio.once': 'once',

  // === Inspector ===
  'inspector.heading': 'Inspector',
  'inspector.fields.title': 'Title',
  'inspector.fields.notes': 'GM notes',
  'inspector.fields.notesPlaceholder': 'When to trigger, narrative intent…',
  'inspector.fields.ytUrl': 'YouTube URL — optional if a local file is attached',
  'inspector.fields.loop': 'Loop playback',
  'inspector.fields.bgYtUrl': 'Background YouTube URL',
  'inspector.fields.bgPlaylistMode': 'Background mode',
  'inspector.fields.bgPlaylistMode.single': 'Single track',
  'inspector.fields.bgPlaylistMode.sequential': 'Sequential playlist',
  'inspector.actions.test': 'Test',
  'inspector.actions.stop': 'Stop',
  'inspector.actions.detach': 'Detach',
  'inspector.actions.enterCartouche': 'Enter group',
  'inspector.fileHint': 'You can drag an audio file directly onto this node.',
  'inspector.fileHintCartouche':
    'You can drag an audio file onto this group to make it the background music.',
  'inspector.fileStatus.local': 'Local file',
  'inspector.fileStatus.bgLocal': 'Background active',
  'inspector.fileStatus.toReglue': 'File needs to be re-dragged',
  'inspector.bgHint':
    'Plays in a loop when entering this group. Muted when a scene plays on top, resumes automatically when the scene stops.',
  'inspector.contentCount.zero': '(empty)',
  'inspector.contentCount.one': '1 item',
  'inspector.contentCount.many': '{n} items',

  // === Empty states ===
  'empty.inspector': 'Select a node to edit it.',
  'empty.canvas':
    'No nodes yet. Add a scene, a character, a sting or a group from the toolbar above.',

  // === Toasts ===
  'toast.newScenario': 'New scenario',
  'toast.exampleLoaded': 'Example reloaded',
  'toast.opened': 'Opened',
  'toast.openedMigrated': 'Opened · format migrated',
  'toast.saved': 'Saved',
  'toast.warningSuffix.one': '· 1 warning',
  'toast.warningSuffix.many': '· {n} warnings',
  'toast.error': 'Error: {msg}',
  'toast.nodeAdded': 'Node added',
  'toast.nodeDeleted': 'Deleted',
  'toast.nodesDeleted': '{n} items deleted',
  'toast.nothingSelected': 'No node selected',
  'toast.connectionCreated': 'Connection created',
  'toast.connectionTransverse': 'Transverse connection created',
  'toast.connectionDeleted': 'Connection deleted',
  'toast.connectionExists': 'This connection already exists',
  'toast.connectionInvalid': 'Cannot create connection',
  'toast.fileAttached': 'File attached: {name}',
  'toast.bgAttached': 'Group background: {name}',
  'toast.sceneCreatedFromFile': 'Scene created: {name}',
  'toast.scenesCreated': '{n} scenes created',
  'toast.notAudioFile': 'Unsupported audio format: {name}',
  'toast.noAudioFiles': 'No audio file in the drop',
  'toast.triggerPlaceholder': '▶ {title} (audio coming in milestone 9)',
  'toast.triggerNoFile': '⚠ No audio attached to "{title}"',
  'toast.triggerYoutubeNotYet':
    '⚠ "{title}" only has a YouTube URL — YouTube playback comes in milestone 17. Drag a local file in the meantime.',
  'toast.audioError': 'Audio error: {msg}',
  'toast.audioPushed': '▶ {title}',
  'toast.audioStinger': '✨ {title}',
  'toast.audioStopped': 'Stopped all',
  'toast.audioFadingOut': 'Fading out…',

  // === Playback bar ===
  'playback.now': 'Now playing',
  'playback.tada': 'Sting',
  'playback.stack': 'Stack',
  'playback.silent': '— silence —',
  'playback.empty': '—',
  'playback.layers.zero': '— empty —',
  'playback.layers.one': '1 layer',
  'playback.layers.many': '{n} layers',
  'playback.stopAll': 'Stop all',
  'playback.fadeOut': 'Fade out',

  // === Confirmations ===
  'confirm.discardChanges': 'Unsaved changes. Continue?',
  'confirm.deleteCartoucheWithChildren':
    'Delete group "{title}" and its {n} item(s)?',
};

export const dictionaries: Record<Language, Partial<Record<DictKey, string>>> = {
  fr,
  en,
};

/** Référence FR exportée pour le repli. */
export const FR = fr;
