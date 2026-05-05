/**
 * Moteur audio — RPG Music Director.
 *
 * Pile multi-couches (cf. cahier section "Moteur audio") :
 * - Une **pile** principale dans laquelle on empile les nœuds audio
 *   (scènes, personnages, futurs fonds de cartouche). Seul le sommet
 *   est audible ; les autres restent vivants en sourdine pour pouvoir
 *   reprendre instantanément quand on dépile.
 * - Un **canal Tada** séparé : les stingers se jouent par-dessus la
 *   pile sans la masquer, et ne se relancent pas en boucle.
 *
 * Transitions : `cut` / `fade` (séquentiel) / `crossfade` (simultané),
 * durée 0.5–5 s, configurées par scénario. Voir `transitions` plus bas
 * et la section Settings (jalon 16).
 *
 * Boucles : sample-perfect via AudioBufferSourceNode (loop=true).
 * Coût : RAM = taille décodée du fichier. Acceptable pour des
 * morceaux de quelques minutes ; un hybride avec HTMLAudioElement
 * pour les fichiers très longs sera décidé au jalon 18 si besoin.
 *
 * Le moteur est un singleton (instance `engine` exportée), accessible
 * depuis les composants via `import { engine } from '...'`. Il
 * utilise des `$state` Svelte 5 pour que la pile et le canal Tada
 * soient réactifs (la PlaybackBar se met à jour en direct).
 */

import {
  DEFAULT_TRANSITIONS,
  type AudioNode,
  type CartoucheNode,
  type NodeId,
  type Transitions,
} from '$lib/model/types';

/**
 * Durée par défaut du fade-out global (Tout arrêter doux). Conceptuellement
 * différent d'une transition de couche : c'est un long fondu de tout ce
 * qui joue, pas un échange entre deux couches. Reste fixe au jalon 16.
 */
const FADE_OUT_DEFAULT_SEC = 2.5;

/**
 * État de lecture d'une playlist fleuve (jalon 15).
 * `source` est remplacée à chaque changement de morceau ; le `gain`
 * reste le même tout au long, donc la sourdine de la pile fonctionne
 * uniformément.
 */
export interface PlaylistState {
  paths: string[];
  currentIndex: number;
  /** Temps AudioContext (en secondes) au démarrage du morceau actuel. */
  trackStartedAtAudioTime: number;
}

/**
 * Une couche active dans la pile (ou le canal Tada).
 * `source` et `gain` sont les nœuds Web Audio gérés par le moteur.
 */
export interface AudioLayer {
  /** Identifiant unique d'instance (UUID). Une même node peut avoir plusieurs instances ? non — on déduplique. */
  id: string;
  /** Id du nœud du modèle (pour retrouver le titre). */
  nodeId: NodeId;
  /** Type d'origine, utile pour la PlaybackBar. */
  kind: 'scene' | 'character' | 'cartoucheBg' | 'stinger';
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** Timestamp `performance.now()` au démarrage, pour info / debug. */
  startedAt: number;
  /** Si défini, c'est une playlist fleuve : enchaînement automatique. */
  playlist?: PlaylistState;
}

class AudioEngine {
  /**
   * Pile principale : `stack[stack.length - 1]` est le sommet (audible).
   * Les couches en dessous ont leur gain à 0 mais leur source continue
   * de tourner — c'est ce qui permet la reprise instantanée au pop.
   */
  stack = $state<AudioLayer[]>([]);

  /**
   * Canal Tada : un seul stinger à la fois. Quand un nouveau stinger
   * est joué, le précédent est interrompu.
   */
  stinger = $state<AudioLayer | null>(null);

  /**
   * Options de transition (jalon 16). Mises à jour par le store à
   * chaque chargement de scénario et à chaque modification depuis
   * Settings. Lues à chaque push/pop pour décider du type de fondu
   * (cut / fade / crossfade), de la durée et du comportement de
   * reprise sous-jacente.
   */
  transitions = $state<Transitions>({ ...DEFAULT_TRANSITIONS });

  /**
   * Met à jour les options de transition. Les couches déjà actives
   * gardent leur trajectoire courante : seules les transitions à
   * venir prennent les nouvelles options.
   */
  setTransitions(t: Transitions): void {
    this.transitions = { ...t };
  }

  /** Sommet de la pile (= ce qu'on entend). */
  topLayer = $derived<AudioLayer | null>(
    this.stack.length > 0 ? this.stack[this.stack.length - 1] : null,
  );

  // ============================================================
  // Internals — AudioContext, cache, helpers
  // ============================================================

  private ctx: AudioContext | null = null;
  /** Buffers décodés indexés par chemin local. Évite re-décoder à chaque play. */
  private bufferCache = new Map<string, AudioBuffer>();

  /**
   * Garantit qu'un AudioContext est instancié et prêt. La création est
   * différée à la première interaction utilisateur (sinon les
   * navigateurs le créent en état 'suspended').
   */
  private async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = (window.AudioContext ?? (window as any).webkitAudioContext) as typeof AudioContext;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore — s'il n'y a pas eu de geste utilisateur, on retentera */
      }
    }
    return this.ctx;
  }

  /**
   * Convertit un chemin local absolu en URL chargeable. En contexte
   * Tauri, utilise `convertFileSrc` pour passer par le protocole
   * `asset://`. Hors Tauri, l'utilisateur ne peut pas avoir de chemins
   * absolus → on accepte les URLs http/blob/data telles quelles.
   */
  private async pathToUrl(path: string): Promise<string> {
    // URLs déjà utilisables telles quelles (preview, blob, http…)
    if (/^(https?|blob|data|file|asset):/i.test(path)) return path;
    // Chemin filesystem : Tauri convertFileSrc
    try {
      const { convertFileSrc } = await import('@tauri-apps/api/core');
      return convertFileSrc(path);
    } catch {
      throw new Error(
        'Impossible de charger un fichier local hors de la fenêtre Tauri',
      );
    }
  }

  /**
   * Charge et décode un fichier audio. Met en cache le buffer pour
   * les rejouages futurs (la décodée prend de la RAM mais c'est ce
   * qui permet les boucles sample-perfect).
   */
  private async loadBuffer(path: string): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(path);
    if (cached) return cached;
    const ctx = await this.ensureContext();
    const url = await this.pathToUrl(path);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} sur ${url}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    this.bufferCache.set(path, audioBuffer);
    return audioBuffer;
  }

  /** Crée une source + un gain reliés à la sortie. Source pas encore démarrée. */
  private createLayerNodes(
    ctx: AudioContext,
    buffer: AudioBuffer,
    loop: boolean,
    initialGain: number,
  ): { source: AudioBufferSourceNode; gain: GainNode } {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    const gain = ctx.createGain();
    gain.gain.value = initialGain;
    source.connect(gain);
    gain.connect(ctx.destination);
    return { source, gain };
  }

  /** Tear down propre d'une couche (stop + disconnect). */
  private tearDown(layer: AudioLayer): void {
    try {
      layer.source.stop();
    } catch {
      /* déjà stoppée */
    }
    try {
      layer.source.disconnect();
    } catch {
      /* déjà déconnectée */
    }
    try {
      layer.gain.disconnect();
    } catch {
      /* idem */
    }
  }

  /** Trouve l'index d'une couche dans la pile par son nodeId, ou -1. */
  private indexInStackByNodeId(nodeId: NodeId): number {
    return this.stack.findIndex((l) => l.nodeId === nodeId);
  }

  // ============================================================
  // Actions publiques
  // ============================================================

  /**
   * Cœur commun de pushLayer / pushCartoucheBg. Charge le buffer,
   * déduplique, met en sourdine le sommet précédent, démarre la
   * nouvelle couche en fade-in.
   */
  private async _pushInternal(
    id: NodeId,
    path: string,
    loop: boolean,
    kind: AudioLayer['kind'],
  ): Promise<void> {
    const ctx = await this.ensureContext();
    const buffer = await this.loadBuffer(path);

    // Déduplication : si le nodeId est déjà dans la pile, retire-le.
    const existingIdx = this.indexInStackByNodeId(id);
    if (existingIdx !== -1) {
      const old = this.stack[existingIdx];
      this.tearDown(old);
      this.stack.splice(existingIdx, 1);
    }

    const tr = this.transitions;
    const now = ctx.currentTime;
    const previousTop = this.stack[this.stack.length - 1];

    // Sortie du sommet précédent : cut net ou fade-out vers 0.
    if (previousTop) {
      previousTop.gain.gain.cancelScheduledValues(now);
      previousTop.gain.gain.setValueAtTime(previousTop.gain.gain.value, now);
      if (tr.type === 'cut') {
        previousTop.gain.gain.setValueAtTime(0, now);
      } else {
        previousTop.gain.gain.linearRampToValueAtTime(0, now + tr.durationSec);
      }
    }

    // Démarrage de la nouvelle couche.
    // - cut       : start à `now`, gain plein immédiat.
    // - crossfade : start à `now`, fade-in en parallèle du fade-out.
    // - fade      : start à `now + dur` (séquentiel, après le fade-out),
    //               fade-in juste après. Évite de consommer le buffer
    //               pendant la phase de silence intermédiaire.
    const startAt = tr.type === 'fade' ? now + tr.durationSec : now;
    const initialGain = tr.type === 'cut' ? 1 : 0;
    const { source, gain } = this.createLayerNodes(ctx, buffer, loop, initialGain);
    if (tr.type !== 'cut') {
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(1, startAt + tr.durationSec);
    }
    source.start(startAt);

    const layer: AudioLayer = {
      id: crypto.randomUUID(),
      nodeId: id,
      kind,
      source,
      gain,
      startedAt: performance.now(),
    };
    this.stack.push(layer);
  }

  /**
   * Empile un nœud audio (scène, personnage). Le sommet précédent
   * est mis en sourdine, la nouvelle couche démarre en fade-in.
   * Si le nœud est déjà dans la pile, l'instance précédente est
   * retirée d'abord (= "remonter au sommet").
   */
  async pushLayer(
    node: AudioNode,
    kind: AudioLayer['kind'] = node.type as AudioLayer['kind'],
  ): Promise<void> {
    if (!node.localFilePath) {
      throw new Error(`Aucun fichier local attaché à « ${node.title} »`);
    }
    return this._pushInternal(node.id, node.localFilePath, !!node.loop, kind);
  }

  /**
   * Empile la musique de fond d'un cartouche (jalon 10). Détecte
   * automatiquement le mode :
   * - `bgPlaylistMode === 'sequential'` ET liste non vide → playlist fleuve.
   * - sinon → fichier unique en boucle.
   *
   * Pour la playlist fleuve : si on a une position mémorisée pour
   * ce cartouche (sortie + ré-entrée plus tard), on reprend
   * exactement où on en était (cf. cahier "Tracking de position").
   */
  async pushCartoucheBg(node: CartoucheNode): Promise<void> {
    // Cas playlist fleuve
    if (node.bgPlaylistMode === 'sequential' && node.bgPlaylistIds.length > 0) {
      return this._pushPlaylist(node);
    }
    // Cas fichier unique (rétro-compatible)
    if (!node.bgLocalFilePath) {
      throw new Error(`Aucun fond local attaché à « ${node.title} »`);
    }
    return this._pushInternal(node.id, node.bgLocalFilePath, true, 'cartoucheBg');
  }

  /**
   * Map des positions de reprise par cartoucheId. Quand on quitte
   * une cartouche dont la playlist tournait, on note l'index du
   * morceau et l'offset interne ; à la ré-entrée on reprend ici.
   * Réinitialisé par `stopAll`.
   */
  private playlistResume = new Map<NodeId, { trackIndex: number; offsetInTrack: number }>();

  /**
   * Cœur du push playlist. Crée le gain partagé, lance le morceau
   * de reprise (ou le premier si aucune reprise), branche le
   * onended pour enchaîner.
   */
  private async _pushPlaylist(node: CartoucheNode): Promise<void> {
    const ctx = await this.ensureContext();

    // Calcule l'index et l'offset de reprise.
    const resume = this.playlistResume.get(node.id);
    let startIndex = 0;
    let startOffset = 0;
    if (resume && resume.trackIndex < node.bgPlaylistIds.length) {
      startIndex = resume.trackIndex;
      startOffset = Math.max(0, resume.offsetInTrack);
    }

    // Charge le buffer du morceau de départ.
    const buffer = await this.loadBuffer(node.bgPlaylistIds[startIndex]);
    // Si l'offset dépasse la durée, on repart au début du morceau.
    if (startOffset >= buffer.duration) startOffset = 0;

    // Déduplication / mise en sourdine du sommet (même logique que _pushInternal).
    const existingIdx = this.indexInStackByNodeId(node.id);
    if (existingIdx !== -1) {
      const old = this.stack[existingIdx];
      this.tearDown(old);
      this.stack.splice(existingIdx, 1);
    }

    const tr = this.transitions;
    const now = ctx.currentTime;
    const previousTop = this.stack[this.stack.length - 1];

    if (previousTop) {
      previousTop.gain.gain.cancelScheduledValues(now);
      previousTop.gain.gain.setValueAtTime(previousTop.gain.gain.value, now);
      if (tr.type === 'cut') {
        previousTop.gain.gain.setValueAtTime(0, now);
      } else {
        previousTop.gain.gain.linearRampToValueAtTime(0, now + tr.durationSec);
      }
    }

    // Démarrage : 'fade' attend la fin du fade-out, sinon démarre à `now`.
    const startAt = tr.type === 'fade' ? now + tr.durationSec : now;

    // Gain partagé : préservé pendant toute la vie de la playlist
    // (la pile manipule ce gain pour mettre en sourdine ; les
    // changements de morceau ne le détruisent pas).
    const gain = ctx.createGain();
    gain.gain.value = tr.type === 'cut' ? 1 : 0;
    gain.connect(ctx.destination);
    if (tr.type !== 'cut') {
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(1, startAt + tr.durationSec);
    }

    // Première source. Loop=false individuellement : c'est l'engine
    // qui ré-enchaîne sur le suivant à la fin (ou repart au début
    // de la playlist si on est au dernier).
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = false;
    source.connect(gain);

    const layerId = crypto.randomUUID();
    const layer: AudioLayer = {
      id: layerId,
      nodeId: node.id,
      kind: 'cartoucheBg',
      source,
      gain,
      startedAt: performance.now(),
      playlist: {
        paths: [...node.bgPlaylistIds],
        currentIndex: startIndex,
        // Recule virtuellement le départ pour que
        // ctx.currentTime - trackStartedAtAudioTime = startOffset une
        // fois la lecture lancée.
        trackStartedAtAudioTime: startAt - startOffset,
      },
    };
    source.onended = () => this._onPlaylistTrackEnded(layerId);
    source.start(startAt, startOffset);
    this.stack.push(layer);
  }

  /**
   * Avance une playlist au morceau suivant (ou retour au début si
   * on était au dernier — la playlist boucle entière, cf. cahier).
   */
  private async _onPlaylistTrackEnded(layerId: string): Promise<void> {
    // Re-cherche le layer : il a pu être pop entre temps.
    const layer = this.stack.find((l) => l.id === layerId);
    if (!layer || !layer.playlist || !this.ctx) return;

    const ctx = this.ctx;
    const playlist = layer.playlist;
    const nextIndex = (playlist.currentIndex + 1) % playlist.paths.length;
    let buffer: AudioBuffer;
    // Index réellement chargé : nextIndex sur le chemin nominal,
    // ou un index de fallback si le morceau suivant est introuvable.
    let actualIndex = nextIndex;
    try {
      buffer = await this.loadBuffer(playlist.paths[nextIndex]);
    } catch {
      // Morceau introuvable : on tente le suivant pour ne pas bloquer.
      // Garde-fou : si aucun morceau ne charge, on stoppe (1 tour de
      // boucle max).
      let attempts = 0;
      let candidate = nextIndex;
      let candidateBuffer: AudioBuffer | null = null;
      while (attempts < playlist.paths.length) {
        candidate = (candidate + 1) % playlist.paths.length;
        attempts++;
        try {
          candidateBuffer = await this.loadBuffer(playlist.paths[candidate]);
          break;
        } catch {
          /* try next */
        }
      }
      if (!candidateBuffer) {
        // Toute la playlist est cassée — on coupe la couche proprement.
        this.tearDown(layer);
        const idx = this.stack.findIndex((l) => l.id === layerId);
        if (idx !== -1) this.stack.splice(idx, 1);
        return;
      }
      buffer = candidateBuffer;
      actualIndex = candidate;
    }

    // Déconnecte l'ancienne source (déjà finie de toute façon).
    try {
      layer.source.disconnect();
    } catch {
      /* ignore */
    }

    // Crée la nouvelle source connectée au même gain (préserve le
    // niveau et les fondus).
    const newSource = ctx.createBufferSource();
    newSource.buffer = buffer;
    newSource.loop = false;
    newSource.connect(layer.gain);
    newSource.onended = () => this._onPlaylistTrackEnded(layerId);
    layer.source = newSource;
    playlist.currentIndex = actualIndex;
    playlist.trackStartedAtAudioTime = ctx.currentTime;
    newSource.start(ctx.currentTime);
  }

  /**
   * Retire une couche par nodeId (la couche se voit appliquer un
   * fade-out puis tear-down). Si elle était au sommet, la couche en
   * dessous se voit appliquer un fade-in pour redevenir audible.
   *
   * No-op si le nœud n'est pas dans la pile.
   */
  popLayerByNodeId(nodeId: NodeId): void {
    const idx = this.indexInStackByNodeId(nodeId);
    if (idx === -1) return;
    if (!this.ctx) return;
    const ctx = this.ctx;
    const wasTop = idx === this.stack.length - 1;
    const layer = this.stack[idx];

    // Sauvegarde de la position pour reprise (jalon 15) — uniquement
    // pour les playlists. Pour les morceaux uniques, on retombe au
    // début à la ré-entrée (comportement précédent inchangé).
    if (layer.playlist) {
      const offset = ctx.currentTime - layer.playlist.trackStartedAtAudioTime;
      this.playlistResume.set(layer.nodeId, {
        trackIndex: layer.playlist.currentIndex,
        // Clamp à 0 : si le pop arrive avant que la lecture ait
        // démarré (cas 'fade' où startAt > now), l'offset serait
        // négatif. On reprend depuis le début dans ce cas.
        offsetInTrack: Math.max(0, offset),
      });
    }

    const tr = this.transitions;
    const now = ctx.currentTime;

    // Sortie du layer pop : cut net ou fade-out vers 0.
    layer.gain.gain.cancelScheduledValues(now);
    layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
    if (tr.type === 'cut') {
      layer.gain.gain.setValueAtTime(0, now);
    } else {
      layer.gain.gain.linearRampToValueAtTime(0, now + tr.durationSec);
    }

    // Tear-down après le fondu (50 ms en cut, sinon durée + 50 ms).
    const teardownDelay = tr.type === 'cut' ? 50 : tr.durationSec * 1000 + 50;
    setTimeout(() => this.tearDown(layer), teardownDelay);
    this.stack.splice(idx, 1);

    // Si on a retiré le sommet, ramener le sous-jacent (sauf si
    // resumeUnderlying est désactivé — alors la couche du dessous
    // reste muette, le pop se traduit par un silence net).
    if (wasTop && tr.resumeUnderlying) {
      const newTop = this.stack[this.stack.length - 1];
      if (newTop) {
        newTop.gain.gain.cancelScheduledValues(now);
        newTop.gain.gain.setValueAtTime(newTop.gain.gain.value, now);
        if (tr.type === 'cut') {
          newTop.gain.gain.setValueAtTime(1, now);
        } else if (tr.type === 'fade') {
          // Séquentiel : reste à 0 pendant le fade-out, fade-in après.
          newTop.gain.gain.setValueAtTime(0, now + tr.durationSec);
          newTop.gain.gain.linearRampToValueAtTime(1, now + 2 * tr.durationSec);
        } else {
          // Crossfade : simultané au fade-out du layer pop.
          newTop.gain.gain.linearRampToValueAtTime(1, now + tr.durationSec);
        }
      }
    }
  }

  /**
   * Joue un stinger sur le canal dédié. Coupe le précédent stinger
   * s'il y en a un, ne touche pas à la pile principale.
   * Le stinger ne boucle jamais (cf. cahier — "Court, ne boucle pas").
   */
  async playStinger(node: AudioNode): Promise<void> {
    if (!node.localFilePath) {
      throw new Error(`Aucun fichier local attaché à « ${node.title} »`);
    }
    const ctx = await this.ensureContext();
    const buffer = await this.loadBuffer(node.localFilePath);

    // Stoppe le stinger précédent.
    if (this.stinger) {
      this.tearDown(this.stinger);
      this.stinger = null;
    }

    const { source, gain } = this.createLayerNodes(ctx, buffer, false, 1);
    source.start(ctx.currentTime);

    const layer: AudioLayer = {
      id: crypto.randomUUID(),
      nodeId: node.id,
      kind: 'stinger',
      source,
      gain,
      startedAt: performance.now(),
    };
    this.stinger = layer;

    // Auto-clear quand le stinger termine.
    source.onended = () => {
      if (this.stinger?.id === layer.id) {
        this.tearDown(layer);
        this.stinger = null;
      }
    };
  }

  /**
   * Arrête immédiatement tout : pile + stinger. Pas de fondu.
   * Utilisé par le bouton "Tout arrêter" et en interne après fadeOut.
   * Réinitialise aussi les positions de reprise des playlists —
   * "Tout arrêter" remet vraiment à zéro.
   */
  stopAll(): void {
    for (const layer of this.stack) {
      this.tearDown(layer);
    }
    this.stack = [];
    if (this.stinger) {
      this.tearDown(this.stinger);
      this.stinger = null;
    }
    this.playlistResume.clear();
  }

  /**
   * Diminue progressivement le volume de tous les canaux puis arrête.
   * Utile en partie pour faire silence sans coupure brutale.
   */
  fadeOut(durationSec: number = FADE_OUT_DEFAULT_SEC): void {
    if (!this.ctx) {
      this.stopAll();
      return;
    }
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const target = now + durationSec;
    for (const layer of this.stack) {
      layer.gain.gain.cancelScheduledValues(now);
      layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
      layer.gain.gain.linearRampToValueAtTime(0, target);
    }
    if (this.stinger) {
      this.stinger.gain.gain.cancelScheduledValues(now);
      this.stinger.gain.gain.setValueAtTime(this.stinger.gain.gain.value, now);
      this.stinger.gain.gain.linearRampToValueAtTime(0, target);
    }
    setTimeout(() => this.stopAll(), durationSec * 1000 + 100);
  }
}

/** Singleton du moteur audio. */
export const engine = new AudioEngine();
