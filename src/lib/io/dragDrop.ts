/**
 * Drag-and-drop de fichiers audio depuis l'explorateur système.
 *
 * Utilise l'API native Tauri (`getCurrentWebview().onDragDropEvent`)
 * qui fournit les **chemins absolus** des fichiers déposés. C'est
 * indispensable pour notre modèle qui stocke les chemins (pas le
 * contenu) — l'API HTML5 standard ne donne accès qu'à des objets
 * `File` sans chemin pour des raisons de sécurité.
 *
 * En preview navigateur, l'abonnement échoue silencieusement (le
 * dynamic import de `@tauri-apps/api/webview` lève une erreur
 * gérée). Le drag-drop est donc une fonctionnalité Tauri-only.
 */

/** Extensions audio reconnues, détection insensible à la casse. */
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|wma|webm)$/i;

/** Vrai si le chemin pointe vers un fichier audio reconnu (par extension). */
export function isAudioFile(path: string): boolean {
  return AUDIO_EXT_RE.test(path);
}

/**
 * Dérive un titre lisible depuis un chemin de fichier : nom sans
 * extension, tronqué à `maxLen`. Utilisé pour nommer les nœuds créés
 * par drag-drop sur le canvas vide.
 */
export function titleFromPath(path: string, maxLen = 30): string {
  const parts = path.split(/[\\/]/);
  const filename = parts[parts.length - 1] ?? path;
  const noExt = filename.replace(/\.[^.]+$/, '');
  const trimmed = noExt.trim();
  if (trimmed.length === 0) return 'Sans titre';
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen).trim() : trimmed;
}

// ============================================================
// Abonnement à l'événement Tauri natif de drag-drop
// ============================================================

export type DropEvent =
  | { type: 'enter'; paths: string[]; position: { x: number; y: number } }
  | { type: 'over'; position: { x: number; y: number } }
  | { type: 'drop'; paths: string[]; position: { x: number; y: number } }
  | { type: 'leave' };

export type DropCallback = (event: DropEvent) => void;
export type Unsubscribe = () => void;

/**
 * S'abonne à l'événement de drag-drop natif de Tauri. Renvoie une
 * fonction de désabonnement à appeler au démontage du composant.
 *
 * En preview navigateur (pas de runtime Tauri), renvoie une fonction
 * de désabonnement no-op et n'écoute rien.
 */
export async function subscribeToTauriDrop(callback: DropCallback): Promise<Unsubscribe> {
  try {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview');
    const webview = getCurrentWebview();
    // L'API renvoie une promesse d'unlisten ; on caste pour utiliser
    // la version concrète des types Tauri.
    const unlisten = await webview.onDragDropEvent((event) => {
      callback(event.payload as DropEvent);
    });
    return unlisten;
  } catch {
    // Hors Tauri (preview navigateur) — pas d'écoute, désabo no-op.
    return () => {};
  }
}
