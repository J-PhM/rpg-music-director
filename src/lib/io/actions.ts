/**
 * Actions fichier de haut niveau — Nouveau / Ouvrir / Enregistrer /
 * Enregistrer sous + sauvegarde auto.
 *
 * Factorisées pour être appelables depuis la Toolbar (boutons) et
 * depuis `+page.svelte` (raccourcis clavier Ctrl+N / O / S, close
 * handler Tauri). Toutes les fonctions :
 *  - tolèrent l'absence de Tauri (toast d'avertissement, no-op),
 *  - utilisent `window.confirm` pour les warnings de discard
 *    (le webview Tauri supporte cette API),
 *  - émettent un toast via la callback fournie.
 */

import { t } from '$lib/i18n/i18n.svelte';
import { store } from '$lib/store/scenarioStore.svelte';
import {
  isTauriContext,
  openScenario,
  saveScenarioAs,
  saveScenarioToPath,
} from './scenarioFile';

type Toast = (msg: string) => void;

/**
 * Crée un nouveau scénario vide. Demande confirmation si des
 * modifications non sauvegardées sont en cours.
 */
export function appNew(toast: Toast): void {
  if (store.modified && !window.confirm(t('confirm.discardChanges'))) return;
  store.newScenario();
  toast(t('toast.newScenario'));
}

/**
 * Charge le scénario d'exemple. Confirmation idem `appNew`.
 */
export function appLoadExample(toast: Toast): void {
  if (store.modified && !window.confirm(t('confirm.discardChanges'))) return;
  store.loadExample();
  toast(t('toast.exampleLoaded'));
}

/** Ouvre un scénario via le dialog Tauri. */
export async function appOpen(toast: Toast): Promise<void> {
  if (!isTauriContext()) {
    toast(t('toolbar.tooltip.tauriOnly'));
    return;
  }
  if (store.modified && !window.confirm(t('confirm.discardChanges'))) return;
  try {
    const result = await openScenario();
    if (!result) return;
    store.loadScenario(result.scenario, result.path);

    const warnSuffix = result.warnings.length
      ? result.warnings.length === 1
        ? ' ' + t('toast.warningSuffix.one')
        : ' ' + t('toast.warningSuffix.many', { n: result.warnings.length })
      : '';
    toast((result.migrated ? t('toast.openedMigrated') : t('toast.opened')) + warnSuffix);

    if (result.warnings.length) {
      for (const w of result.warnings) console.warn('[scenario]', w);
    }
  } catch (e) {
    toast(t('toast.error', { msg: e instanceof Error ? e.message : String(e) }));
  }
}

/**
 * Enregistre le scénario au chemin courant, ou ouvre Save As si
 * aucun chemin n'est connu. Renvoie `true` si la sauvegarde a abouti.
 */
export async function appSave(toast: Toast): Promise<boolean> {
  if (!isTauriContext()) {
    toast(t('toolbar.tooltip.tauriOnly'));
    return false;
  }
  if (!store.currentPath) {
    return appSaveAs(toast);
  }
  try {
    await saveScenarioToPath(store.scenario, store.currentPath);
    store.markSaved(store.currentPath);
    toast(t('toast.saved'));
    return true;
  } catch (e) {
    toast(t('toast.error', { msg: e instanceof Error ? e.message : String(e) }));
    return false;
  }
}

/** Ouvre le dialog Save As et enregistre. */
export async function appSaveAs(toast: Toast): Promise<boolean> {
  if (!isTauriContext()) {
    toast(t('toolbar.tooltip.tauriOnly'));
    return false;
  }
  try {
    const path = await saveScenarioAs(store.scenario);
    if (!path) return false;
    store.markSaved(path);
    toast(t('toast.saved'));
    return true;
  } catch (e) {
    toast(t('toast.error', { msg: e instanceof Error ? e.message : String(e) }));
    return false;
  }
}

/**
 * Sauvegarde silencieuse pour le débounce automatique. Ne fait rien
 * si pas de chemin courant (le user n'a jamais fait Save As) ou si
 * pas modifié. Échec → warn console + toast léger ; le `● MODIFIÉ`
 * reste affiché tant que ce n'est pas réussi.
 */
export async function appAutoSave(toast: Toast): Promise<void> {
  if (!isTauriContext()) return;
  if (!store.currentPath || !store.modified) return;
  try {
    await saveScenarioToPath(store.scenario, store.currentPath);
    store.markSaved(store.currentPath);
    toast(t('toast.autoSaved'));
  } catch (e) {
    console.warn('[autosave]', e);
    toast(t('toast.autoSaveFailed'));
  }
}
