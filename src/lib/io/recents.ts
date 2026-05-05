/**
 * Liste des scénarios récemment ouverts ou enregistrés (jalon 18).
 *
 * Stockée dans `localStorage` plutôt que dans un fichier — c'est
 * une préférence d'environnement local, pas une donnée de scénario,
 * et ça évite d'élargir les capabilities Tauri pour un truc de 5
 * chaînes. Persistant entre lancements de l'app.
 *
 * `loadRecents()` filtre les valeurs invalides, donc même un
 * `localStorage` corrompu ne crashe pas l'UI.
 */

const STORAGE_KEY = 'rpgmd:recents';
const MAX_RECENTS = 5;

/** Lit la liste actuelle (vide si jamais initialisée ou corrompue). */
export function loadRecents(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === 'string').slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

/**
 * Pousse un chemin en tête de la liste, déduplique (le path déjà
 * présent remonte), tronque à `MAX_RECENTS`. No-op silencieux si
 * `localStorage` est indisponible (rare en Tauri).
 */
export function pushRecent(path: string): void {
  if (typeof localStorage === 'undefined') return;
  if (!path) return;
  const existing = loadRecents();
  const next = [path, ...existing.filter((p) => p !== path)].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota exceeded ou autre — ignorer, pas critique */
  }
}

/** Vide la liste. */
export function clearRecents(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Retire un chemin spécifique (utile si le user a supprimé/déplacé
 * le fichier et veut le purger de la liste).
 */
export function removeRecent(path: string): void {
  if (typeof localStorage === 'undefined') return;
  const existing = loadRecents();
  const next = existing.filter((p) => p !== path);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
