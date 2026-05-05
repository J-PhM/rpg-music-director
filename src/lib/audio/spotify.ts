/**
 * Intégration Spotify — jalon 19.
 *
 * Auth : OAuth Authorization Code Flow with PKCE (pas de client_secret
 * requis côté client). Le `client_id` est stocké en localStorage par
 * utilisateur ; chacun peut enregistrer sa propre app Spotify ou utiliser
 * un client_id partagé. La capture du redirect se fait via
 * `tauri-plugin-oauth` (mini HTTP server local sur 127.0.0.1:1421).
 *
 * Lecture : Web Playback SDK officiel (https://sdk.scdn.co/spotify-player.js).
 * Limitations identiques à YouTube — `setVolume(0–1)` au lieu d'un GainNode
 * Web Audio, donc fades simulés. Boucle imparfaite via re-`play()` au
 * `track_end`. Compte Spotify **Premium obligatoire** (limite Spotify).
 *
 * Le module ne touche pas à la pile audio — c'est le moteur qui gère.
 */

// ============================================================
// Constantes
// ============================================================

/** Port fixe du redirect OAuth. À enregistrer côté dashboard Spotify. */
export const SPOTIFY_REDIRECT_PORT = 1421;
export const SPOTIFY_REDIRECT_URI = `http://127.0.0.1:${SPOTIFY_REDIRECT_PORT}/callback`;

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const ME_URL = 'https://api.spotify.com/v1/me';
const PLAY_URL = 'https://api.spotify.com/v1/me/player/play';
const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

/** Scopes minimaux pour la lecture via Web Playback SDK. */
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
].join(' ');

const STORAGE_TOKEN_KEY = 'rpgmd:spotify:auth';
const STORAGE_CLIENT_ID_KEY = 'rpgmd:spotify:client_id';

// ============================================================
// Types
// ============================================================

export interface SpotifyAuth {
  accessToken: string;
  refreshToken: string;
  /** Timestamp ms epoch d'expiration. */
  expiresAt: number;
  /** Email de l'utilisateur connecté (récupéré après login pour affichage). */
  userEmail?: string;
}

export interface SpotifyPlayer {
  player: SpotifySdkPlayer;
  deviceId: string;
}

/** Surface minimale du SDK utilisée par le moteur — évite la dépendance `@types/spotify-web-playback-sdk`. */
interface SpotifySdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  setVolume(volume: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  addListener(event: string, cb: (data: unknown) => void): boolean;
  removeListener(event: string, cb?: (data: unknown) => void): boolean;
}

interface SpotifySdkNamespace {
  Player: new (opts: {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }) => SpotifySdkPlayer;
}

function spotifyGlobal(): SpotifySdkNamespace | undefined {
  return (window as unknown as { Spotify?: SpotifySdkNamespace }).Spotify;
}

// ============================================================
// Stockage du client_id
// ============================================================

export function getStoredClientId(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(STORAGE_CLIENT_ID_KEY) ?? '';
}

export function setStoredClientId(clientId: string): void {
  if (typeof localStorage === 'undefined') return;
  if (clientId) {
    localStorage.setItem(STORAGE_CLIENT_ID_KEY, clientId);
  } else {
    localStorage.removeItem(STORAGE_CLIENT_ID_KEY);
  }
}

// ============================================================
// Stockage du token
// ============================================================

export function getStoredAuth(): SpotifyAuth | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SpotifyAuth>;
    if (typeof parsed?.accessToken !== 'string' || typeof parsed?.refreshToken !== 'string') {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0,
      userEmail: typeof parsed.userEmail === 'string' ? parsed.userEmail : undefined,
    };
  } catch {
    return null;
  }
}

function saveAuth(auth: SpotifyAuth): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_TOKEN_KEY, JSON.stringify(auth));
}

export function clearStoredAuth(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_TOKEN_KEY);
}

// ============================================================
// PKCE
// ============================================================

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function challengeFromVerifier(verifier: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
  return base64UrlEncode(new Uint8Array(buf));
}

// ============================================================
// Login / Logout / Refresh
// ============================================================

/**
 * Ouvre la page d'auth Spotify dans le navigateur du user, attend le
 * redirect, échange le code contre un token. Retourne l'auth complète.
 *
 * Lève si : client_id manquant, l'utilisateur ferme la fenêtre sans
 * accepter, l'échange de code échoue.
 */
export async function loginSpotify(clientId: string): Promise<SpotifyAuth> {
  if (!clientId) throw new Error('Client ID Spotify manquant');

  const { start, cancel, onUrl } = await import('@fabianlars/tauri-plugin-oauth');
  const { openUrl } = await import('@tauri-apps/plugin-opener');

  // 1) Démarre le serveur local sur le port enregistré côté Spotify.
  const port = await start({ ports: [SPOTIFY_REDIRECT_PORT] });
  if (port !== SPOTIFY_REDIRECT_PORT) {
    await cancel(port);
    throw new Error(
      `Port ${SPOTIFY_REDIRECT_PORT} indisponible — ferme l'app qui l'utilise et réessaie.`,
    );
  }

  try {
    // 2) Génère verifier + challenge PKCE.
    const verifier = randomVerifier();
    const challenge = await challengeFromVerifier(verifier);

    // 3) Construit l'URL d'auth Spotify et l'ouvre dans le navigateur.
    const authUrl = new URL(AUTH_URL);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', SPOTIFY_REDIRECT_URI);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', challenge);
    await openUrl(authUrl.toString());

    // 4) Attend le redirect (timeout 5 min).
    const code = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Délai de connexion Spotify dépassé'));
      }, 5 * 60 * 1000);
      onUrl((url: string) => {
        clearTimeout(timeout);
        try {
          const parsed = new URL(url);
          const c = parsed.searchParams.get('code');
          const err = parsed.searchParams.get('error');
          if (err) {
            reject(new Error(`Spotify a refusé : ${err}`));
            return;
          }
          if (!c) {
            reject(new Error('Callback OAuth sans code'));
            return;
          }
          resolve(c);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    });

    // 5) Échange code → token.
    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('redirect_uri', SPOTIFY_REDIRECT_URI);
    params.set('client_id', clientId);
    params.set('code_verifier', verifier);

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Échec de l'échange OAuth (${res.status}) ${errText}`);
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const auth: SpotifyAuth = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    // 6) Récupère l'email du user pour l'afficher.
    try {
      const meRes = await fetch(ME_URL, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      if (meRes.ok) {
        const me = (await meRes.json()) as { email?: string };
        if (typeof me.email === 'string') auth.userEmail = me.email;
      }
    } catch {
      /* ignore — l'email est cosmétique */
    }

    saveAuth(auth);
    return auth;
  } finally {
    await cancel(port).catch(() => {});
  }
}

/** Rafraîchit l'access_token via le refresh_token stocké. */
export async function refreshSpotifyToken(clientId: string): Promise<SpotifyAuth> {
  const current = getStoredAuth();
  if (!current) throw new Error('Pas de session Spotify à rafraîchir');

  const params = new URLSearchParams();
  params.set('grant_type', 'refresh_token');
  params.set('refresh_token', current.refreshToken);
  params.set('client_id', clientId);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    // Refresh refusé : la session est invalide, on purge.
    clearStoredAuth();
    throw new Error(`Échec du refresh Spotify (${res.status})`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const auth: SpotifyAuth = {
    accessToken: data.access_token,
    // Spotify peut renvoyer un nouveau refresh_token ou réutiliser l'ancien.
    refreshToken: data.refresh_token ?? current.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    userEmail: current.userEmail,
  };
  saveAuth(auth);
  return auth;
}

/**
 * Retourne un access_token valide. Rafraîchit automatiquement s'il
 * expire dans moins d'une minute. Lève si pas de session.
 */
export async function getValidAccessToken(clientId: string): Promise<string> {
  const current = getStoredAuth();
  if (!current) throw new Error('Non connecté à Spotify');
  // Marge de 60 s pour éviter les courses au moment du play.
  if (Date.now() + 60_000 < current.expiresAt) {
    return current.accessToken;
  }
  const refreshed = await refreshSpotifyToken(clientId);
  return refreshed.accessToken;
}

// ============================================================
// Parsing d'URL → trackId / URI
// ============================================================

/**
 * Reconnaît `spotify:track:ID`, `https://open.spotify.com/track/ID`,
 * `https://open.spotify.com/intl-fr/track/ID?si=…`. Renvoie le trackId
 * ou `null` si non reconnu.
 */
const SPOTIFY_TRACK_RE =
  /(?:spotify:track:|open\.spotify\.com\/(?:[a-z-]+\/)?track\/)([a-zA-Z0-9]+)/;

export function parseSpotifyTrackId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(SPOTIFY_TRACK_RE);
  return m ? m[1] : null;
}

/** Construit l'URI Spotify (`spotify:track:ID`) à partir d'un trackId. */
export function trackUriFromId(id: string): string {
  return `spotify:track:${id}`;
}

// ============================================================
// SDK Web Playback
// ============================================================

let sdkLoadPromise: Promise<void> | null = null;

/**
 * Injecte le script Web Playback SDK (s'il ne l'est pas déjà) et résout
 * quand `window.Spotify` est disponible. Idempotent.
 */
export function loadSpotifySdk(): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise;
  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    if (spotifyGlobal()?.Player) {
      resolve();
      return;
    }
    // Le SDK appelle `window.onSpotifyWebPlaybackSDKReady` quand il est prêt.
    type WindowWithCb = typeof window & {
      onSpotifyWebPlaybackSDKReady?: () => void;
    };
    const w = window as WindowWithCb;
    const previous = w.onSpotifyWebPlaybackSDKReady;
    w.onSpotifyWebPlaybackSDKReady = () => {
      try {
        previous?.();
      } catch {
        /* ignore */
      }
      resolve();
    };
    // Insère le script si pas encore présent.
    if (!document.querySelector(`script[src="${SDK_URL}"]`)) {
      const s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.onerror = () => reject(new Error('Impossible de charger le SDK Spotify'));
      document.head.appendChild(s);
    }
  });
  return sdkLoadPromise;
}

/**
 * Crée et connecte un Player Web Playback SDK. Résout avec le player
 * **et** son `deviceId` une fois l'event `ready` reçu.
 *
 * `getToken` est rappelé par le SDK quand il a besoin d'un token frais.
 * On le branche sur `getValidAccessToken(clientId)` qui rafraîchit si
 * nécessaire.
 */
export async function createSpotifyPlayer(
  clientId: string,
  options: { name?: string; onTrackEnded?: () => void } = {},
): Promise<SpotifyPlayer> {
  await loadSpotifySdk();
  const Spotify = spotifyGlobal();
  if (!Spotify) throw new Error('SDK Spotify indisponible');

  return new Promise<SpotifyPlayer>((resolve, reject) => {
    const player = new Spotify.Player({
      name: options.name ?? 'RPG Music Director',
      getOAuthToken: (cb) => {
        getValidAccessToken(clientId)
          .then((token) => cb(token))
          .catch((e) => {
            console.warn('[spotify] getOAuthToken failed', e);
          });
      },
      volume: 1,
    });

    let resolved = false;

    player.addListener('ready', (data) => {
      const deviceId = (data as { device_id?: string })?.device_id;
      if (!deviceId) {
        if (!resolved) reject(new Error('Spotify ready sans device_id'));
        return;
      }
      resolved = true;
      resolve({ player, deviceId });
    });

    player.addListener('initialization_error', (e) => {
      if (!resolved) reject(new Error(`Spotify init error: ${stringifyErr(e)}`));
    });
    player.addListener('authentication_error', (e) => {
      if (!resolved) reject(new Error(`Spotify auth error: ${stringifyErr(e)}`));
    });
    player.addListener('account_error', (e) => {
      if (!resolved) reject(new Error(`Spotify account error (Premium ?) : ${stringifyErr(e)}`));
    });
    player.addListener('playback_error', (e) => {
      console.warn('[spotify] playback_error', e);
    });

    if (options.onTrackEnded) {
      player.addListener('player_state_changed', (state) => {
        const s = state as
          | {
              paused?: boolean;
              position?: number;
              track_window?: { current_track?: { id?: string } };
            }
          | null;
        // Heuristique : `paused === true` + `position === 0` indique souvent
        // une fin de piste sur le SDK. Cf. doc Spotify.
        if (s?.paused && s.position === 0) {
          options.onTrackEnded?.();
        }
      });
    }

    player.connect().catch((e) => {
      if (!resolved) reject(e);
    });
  });
}

function stringifyErr(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return String(e);
}

/**
 * Démarre la lecture d'un track sur le device donné. Le SDK doit avoir
 * émis `ready` au préalable et le user doit être Premium.
 */
export async function playSpotifyTrack(
  accessToken: string,
  deviceId: string,
  trackUri: string,
): Promise<void> {
  const url = `${PLAY_URL}?device_id=${encodeURIComponent(deviceId)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uris: [trackUri] }),
  });
  // 204 No Content = succès. 202 = device en transfert (acceptable).
  // 403 = compte non Premium ou restriction. 404 = device inconnu.
  if (res.status === 403) {
    throw new Error('Spotify a refusé la lecture (compte Premium requis ?)');
  }
  if (res.status === 404) {
    throw new Error('Device Spotify introuvable — reconnecte-toi');
  }
  if (!res.ok && res.status !== 202) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Erreur Spotify ${res.status} ${errText}`);
  }
}

/** Détruit un player et libère la connexion SDK. */
export function destroySpotifyPlayer(player: SpotifyPlayer): void {
  try {
    player.player.disconnect();
  } catch {
    /* déjà déconnecté */
  }
}

// ============================================================
// Animation de volume (simulation des fades Web Audio)
// ============================================================

export interface SpotifyVolumeRamp {
  cancel(): void;
}

/**
 * Anime linéairement le volume d'un player de `from` à `to` (échelle
 * 0–1 du SDK Spotify) sur `durMs` millisecondes. Si `durMs ≤ 0`,
 * applique immédiatement la valeur cible.
 */
export function rampSpotifyVolume(
  player: SpotifySdkPlayer,
  from: number,
  to: number,
  durMs: number,
): SpotifyVolumeRamp {
  const fromClamped = Math.max(0, Math.min(1, from));
  const toClamped = Math.max(0, Math.min(1, to));
  if (durMs <= 0) {
    player.setVolume(toClamped).catch(() => {});
    return { cancel: () => {} };
  }

  player.setVolume(fromClamped).catch(() => {});
  const start = performance.now();
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const tick = (): void => {
    const elapsed = performance.now() - start;
    if (elapsed >= durMs) {
      player.setVolume(toClamped).catch(() => {});
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      return;
    }
    const t = elapsed / durMs;
    const v = fromClamped + (toClamped - fromClamped) * t;
    player.setVolume(v).catch(() => {});
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
