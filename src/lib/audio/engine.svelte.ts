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
 * Transitions : un fondu linéaire de 1 s pour les push/pop. Les
 * options par scénario (fade / cut / crossfade, durée) sont prévues
 * pour le jalon 16.
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

import type { AudioNode, NodeId } from '$lib/model/types';

/** Durée par défaut des fondus push/pop (en secondes). Configurable jalon 16. */
const DEFAULT_FADE = 1.0;
/** Durée par défaut du fade-out global (Tout arrêter doux). */
const FADE_OUT_DEFAULT_SEC = 2.5;

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
   * Empile un nœud audio (scène, personnage, ou futur cartoucheBg).
   * Si le nœud est déjà dans la pile, l'instance précédente est
   * retirée d'abord (= "remonter au sommet").
   *
   * Le sommet précédent est mis en sourdine (fade vers 0) ; la
   * nouvelle couche démarre à 0 et fade vers 1.
   */
  async pushLayer(node: AudioNode, kind: AudioLayer['kind'] = node.type as AudioLayer['kind']): Promise<void> {
    if (!node.localFilePath) {
      throw new Error(`Aucun fichier local attaché à « ${node.title} »`);
    }
    const ctx = await this.ensureContext();
    const buffer = await this.loadBuffer(node.localFilePath);

    // Déduplication : si le nœud est déjà dans la pile, retire l'ancienne instance.
    const existingIdx = this.indexInStackByNodeId(node.id);
    if (existingIdx !== -1) {
      const old = this.stack[existingIdx];
      this.tearDown(old);
      this.stack.splice(existingIdx, 1);
    }

    // Met le sommet courant en sourdine (s'il y en a un).
    const previousTop = this.stack[this.stack.length - 1];
    if (previousTop) {
      const now = ctx.currentTime;
      previousTop.gain.gain.cancelScheduledValues(now);
      previousTop.gain.gain.setValueAtTime(previousTop.gain.gain.value, now);
      previousTop.gain.gain.linearRampToValueAtTime(0, now + DEFAULT_FADE);
    }

    // Démarre la nouvelle couche en fade-in.
    const { source, gain } = this.createLayerNodes(ctx, buffer, !!node.loop, 0);
    const now = ctx.currentTime;
    gain.gain.linearRampToValueAtTime(1, now + DEFAULT_FADE);
    source.start(now);

    const layer: AudioLayer = {
      id: crypto.randomUUID(),
      nodeId: node.id,
      kind,
      source,
      gain,
      startedAt: performance.now(),
    };
    this.stack.push(layer);
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

    const now = ctx.currentTime;
    layer.gain.gain.cancelScheduledValues(now);
    layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
    layer.gain.gain.linearRampToValueAtTime(0, now + DEFAULT_FADE * 0.6);

    // Tear-down après le fondu.
    setTimeout(() => this.tearDown(layer), DEFAULT_FADE * 600 + 50);
    this.stack.splice(idx, 1);

    // Si on a retiré le sommet, le nouveau sommet se réveille.
    if (wasTop) {
      const newTop = this.stack[this.stack.length - 1];
      if (newTop) {
        newTop.gain.gain.cancelScheduledValues(now);
        newTop.gain.gain.setValueAtTime(newTop.gain.gain.value, now);
        newTop.gain.gain.linearRampToValueAtTime(1, now + DEFAULT_FADE * 0.6);
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
