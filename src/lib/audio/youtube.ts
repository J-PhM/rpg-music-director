/**
 * Helpers IFrame API YouTube — jalon 17.
 *
 * L'IFrame API ne donne PAS accès au flux audio brut, seulement à
 * `setVolume(0–100)`. Conséquences :
 * - Pas de sourdine via gainNode → on appelle `setVolume(0)`.
 * - Pas de fades sample-perfect → on simule via `setInterval` (60 fps).
 * - Pas de boucle sample-perfect → on relance la vidéo sur l'event
 *   `ENDED`, ce qui crée un gap de 200–500 ms (limite acceptée par
 *   le cahier).
 *
 * Le script `https://www.youtube.com/iframe_api` est inclus dans
 * `app.html`. Il appelle `window.onYouTubeIframeAPIReady` une fois
 * `window.YT` disponible. `loadYouTubeApi()` enrobe ce callback en
 * Promise (idempotent — sûr d'appeler plusieurs fois).
 */

// ============================================================
// Types minimaux (évite la dépendance @types/youtube)
// ============================================================

export interface YTPlayer {
  loadVideoById(videoId: string): void;
  cueVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  setVolume(volume: number): void;
  getVolume(): number;
  destroy(): void;
  getIframe?(): HTMLIFrameElement;
}

interface YTNamespace {
  Player: new (elementIdOrEl: string | HTMLElement, opts: YTPlayerOptions) => YTPlayer;
  PlayerState: {
    UNSTARTED: -1;
    ENDED: 0;
    PLAYING: 1;
    PAUSED: 2;
    BUFFERING: 3;
    CUED: 5;
  };
}

interface YTPlayerOptions {
  height?: string | number;
  width?: string | number;
  videoId?: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { data: number; target: YTPlayer }) => void;
    onError?: (e: { data: number; target: YTPlayer }) => void;
  };
}

// L'API expose `window.YT` et `window.onYouTubeIframeAPIReady`. On
// caste à la demande dans une fonction utilitaire pour rester typé.
function ytGlobal(): YTNamespace | undefined {
  return (window as unknown as { YT?: YTNamespace }).YT;
}

// ============================================================
// Chargement de l'API
// ============================================================

/** ID de l'élément hôte des iframes (cf. app.html). */
export const YT_HOST_ID = 'yt-players-host';

let apiReadyPromise: Promise<void> | null = null;

/**
 * Attend que `window.YT.Player` soit disponible. Idempotent : la
 * première Promise est mémorisée et renvoyée à chaque appel ultérieur.
 *
 * Si le script `iframe_api` n'a pas été inclus dans la page, la
 * Promise ne résoudra jamais — on s'en remet au timeout de l'appelant.
 */
export function loadYouTubeApi(): Promise<void> {
  if (apiReadyPromise) return apiReadyPromise;
  apiReadyPromise = new Promise<void>((resolve) => {
    if (ytGlobal()?.Player) {
      resolve();
      return;
    }
    type WindowWithCb = typeof window & {
      onYouTubeIframeAPIReady?: () => void;
    };
    const w = window as WindowWithCb;
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try {
        previous?.();
      } catch {
        /* ignore */
      }
      resolve();
    };
  });
  return apiReadyPromise;
}

// ============================================================
// Parsing d'URL → videoId
// ============================================================

/** Reconnaît watch?v=…, youtu.be/…, embed/… avec un id de 11 caractères. */
const YT_ID_RE =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/;

/**
 * Extrait l'identifiant 11-chars d'une URL YouTube. Renvoie `null`
 * si l'URL n'est pas reconnaissable (mauvais domaine, pas d'id…).
 */
export function parseYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(YT_ID_RE);
  return m ? m[1] : null;
}

// ============================================================
// Création / destruction de player
// ============================================================

export interface CreatePlayerOptions {
  /** Callback déclenché à chaque fin de lecture (utile pour la boucle). */
  onEnded?: () => void;
  /** Callback déclenché en cas d'erreur (vidéo introuvable, embed bloqué…). */
  onError?: (code: number) => void;
}

/**
 * Crée et monte un YT.Player sur un nouveau div inséré dans
 * `#yt-players-host`. Résout avec le player une fois `onReady` reçu.
 * La vidéo n'est PAS démarrée automatiquement — il faut appeler
 * `player.playVideo()`. Cela permet d'orchestrer fades / volume
 * initial avant l'audition.
 */
export async function createPlayer(
  videoId: string,
  opts: CreatePlayerOptions = {},
): Promise<YTPlayer> {
  await loadYouTubeApi();
  const YT = ytGlobal();
  if (!YT) throw new Error('IFrame API YouTube indisponible');
  const host = document.getElementById(YT_HOST_ID);
  if (!host) throw new Error(`Hôte iframe YouTube introuvable (#${YT_HOST_ID})`);

  // L'API remplace le div par un iframe portant le même id.
  const elementId = `yt-${crypto.randomUUID()}`;
  const div = document.createElement('div');
  div.id = elementId;
  host.appendChild(div);

  return new Promise<YTPlayer>((resolve, reject) => {
    let resolved = false;
    const player: YTPlayer = new YT.Player(elementId, {
      height: '0',
      width: '0',
      videoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
      },
      events: {
        onReady: () => {
          resolved = true;
          resolve(player);
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) opts.onEnded?.();
        },
        onError: (e) => {
          // Erreurs YouTube : 2 = bad params, 5 = HTML5, 100 = video
          // not found, 101/150 = embed not allowed.
          opts.onError?.(e.data);
          if (!resolved) {
            resolved = true;
            reject(new Error(`Erreur YouTube ${e.data}`));
          }
        },
      },
    });
  });
}

/**
 * Détruit proprement un YT.Player et retire son iframe du DOM.
 * Tolère les double-destroys.
 */
export function destroyPlayer(player: YTPlayer): void {
  try {
    player.stopVideo();
  } catch {
    /* déjà stoppée */
  }
  try {
    player.destroy();
  } catch {
    /* déjà détruite */
  }
}

// ============================================================
// Animation de volume (simulation des fades Web Audio)
// ============================================================

export interface VolumeRamp {
  /** Stoppe l'animation en cours. La valeur reste où elle est. */
  cancel(): void;
}

/**
 * Anime linéairement le volume d'un player de `from` à `to` sur
 * `durMs` millisecondes (~60 fps). Si `durMs === 0`, applique
 * immédiatement la valeur cible.
 *
 * Un ramp sur un player détruit échoue silencieusement (try/catch).
 */
export function rampVolume(
  player: YTPlayer,
  from: number,
  to: number,
  durMs: number,
): VolumeRamp {
  const fromClamped = Math.max(0, Math.min(100, from));
  const toClamped = Math.max(0, Math.min(100, to));
  if (durMs <= 0) {
    try {
      player.setVolume(toClamped);
    } catch {
      /* ignore */
    }
    return { cancel: () => {} };
  }

  // Position initiale immédiate.
  try {
    player.setVolume(fromClamped);
  } catch {
    /* ignore */
  }

  const start = performance.now();
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const tick = (): void => {
    const elapsed = performance.now() - start;
    if (elapsed >= durMs) {
      try {
        player.setVolume(toClamped);
      } catch {
        /* ignore */
      }
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      return;
    }
    const t = elapsed / durMs;
    const v = fromClamped + (toClamped - fromClamped) * t;
    try {
      player.setVolume(v);
    } catch {
      /* ignore */
    }
  };

  intervalId = setInterval(tick, 1000 / 60);

  return {
    cancel: () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
