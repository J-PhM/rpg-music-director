/**
 * Wrapper Tauri pour ouvrir/sauvegarder les scénarios `.jmd`.
 *
 * Ces fonctions appellent les plugins `@tauri-apps/plugin-dialog` et
 * `@tauri-apps/plugin-fs`. Elles ne fonctionnent **que dans la fenêtre
 * Tauri** — appelées depuis un navigateur classique (vite dev seul),
 * elles lèveront une erreur car les bridges Tauri sont absents.
 *
 * Extension préférée : `.jmd`. À l'ouverture on accepte aussi `.json`
 * pour les scénarios exportés depuis le proto v9.
 */

import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

import { fromJson, toJson, type LoadResult } from '$lib/model/serialize';
import type { Scenario } from '$lib/model/types';

const FILE_FILTERS = [
  { name: 'RPG Music Director', extensions: ['jmd', 'json'] },
  { name: 'Tous les fichiers', extensions: ['*'] },
];

const SAVE_FILTERS = [
  { name: 'RPG Music Director', extensions: ['jmd'] },
];

export interface OpenResult extends LoadResult {
  /** Chemin absolu du fichier ouvert. Utile pour activer "Enregistrer" ensuite. */
  path: string;
}

/**
 * Affiche le dialogue système d'ouverture de fichier, lit le scénario
 * sélectionné, le valide et le renvoie. Si l'utilisateur annule, renvoie
 * `null`.
 */
export async function openScenario(): Promise<OpenResult | null> {
  const selected = await openDialog({
    multiple: false,
    filters: FILE_FILTERS,
    title: 'Ouvrir un scénario',
  });
  if (!selected || typeof selected !== 'string') return null;

  const text = await readTextFile(selected);
  const loaded = fromJson(text);
  return { ...loaded, path: selected };
}

/**
 * Sauvegarde le scénario à un chemin connu (sans dialogue). Utilisé pour
 * "Enregistrer" quand on a déjà un chemin courant, et pour la sauvegarde
 * automatique (jalon 18).
 */
export async function saveScenarioToPath(scenario: Scenario, path: string): Promise<void> {
  const text = toJson(scenario);
  await writeTextFile(path, text);
}

/**
 * Affiche le dialogue système d'enregistrement, sauvegarde le scénario
 * au chemin choisi, et renvoie ce chemin. Si l'utilisateur annule,
 * renvoie `null`.
 */
export async function saveScenarioAs(
  scenario: Scenario,
  defaultName?: string,
): Promise<string | null> {
  const safeDefault = (defaultName ?? scenario.campaignTitle)
    .replace(/[^a-zA-Z0-9_\- ]+/g, '_')
    .trim()
    .slice(0, 60) || 'campagne';

  const selected = await saveDialog({
    filters: SAVE_FILTERS,
    defaultPath: `${safeDefault}.jmd`,
    title: 'Enregistrer le scénario sous',
  });
  if (!selected) return null;

  await saveScenarioToPath(scenario, selected);
  return selected;
}

/**
 * Affiche le dialogue système de sélection d'image. Renvoie le chemin
 * absolu choisi, ou `null` si l'utilisateur annule. Utilisé par la
 * modale Paramètres pour choisir une image de fond personnalisée.
 */
export async function pickImage(): Promise<string | null> {
  const selected = await openDialog({
    multiple: false,
    filters: [
      { name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
    title: 'Choisir une image de fond',
  });
  if (!selected || typeof selected !== 'string') return null;
  return selected;
}

/**
 * Détecte si on tourne dans une fenêtre Tauri (par opposition au preview
 * navigateur seul). Utile pour adapter les boutons : dans le navigateur,
 * on désactive Ouvrir/Enregistrer plutôt que de laisser une erreur sortir.
 */
export function isTauriContext(): boolean {
  if (typeof window === 'undefined') return false;
  // Tauri 2 expose __TAURI_INTERNALS__ (ancien : __TAURI__).
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown };
  return Boolean(w.__TAURI_INTERNALS__ ?? w.__TAURI__);
}
