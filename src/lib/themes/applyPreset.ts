/**
 * Application d'un preset au document : écrit chaque variable de
 * palette en CSS variable sur :root via `setProperty`.
 *
 * Avantages d'aller via JS plutôt que via des classes CSS dédiées
 * par preset :
 * - Les presets sont des données pures (presets.ts), pas de CSS
 *   spécifique à maintenir en parallèle.
 * - Un preset peut être ajouté ou modifié sans toucher au CSS.
 * - Migration future facile (ex. permettre à l'utilisateur de
 *   créer un preset custom).
 *
 * Le défaut au premier paint (avant que le JS ait tourné) est la
 * variante claire de Lemniscate, définie en dur dans lemniscate.css.
 * Dès que `applyPreset` est appelé, ces valeurs sont surchargées par
 * setProperty, ce qui prend le pas sur les règles CSS statiques.
 */

import { presetHasBothModes, resolvePalette, type PresetId, type ThemeMode } from './presets';

/** Mapping des clés de palette vers les noms de variables CSS. */
const VAR_MAP: Record<keyof import('./presets').PresetPalette, string> = {
  paper: '--paper',
  paperSoft: '--paper-soft',
  paperDeep: '--paper-deep',
  ink: '--ink',
  inkSoft: '--ink-soft',
  accent: '--accent',
  accentSoft: '--accent-soft',
  rule: '--rule',
  ruleSoft: '--rule-soft',
  highlight: '--highlight',
  playing: '--playing',
  warm: '--warm',
  transverse: '--transverse',
  primary: '--primary',
  nodeScene: '--node-scene',
  nodeCharacter: '--node-character',
  nodeStinger: '--node-stinger',
  nodeCartouche: '--node-cartouche',
  shadow: '--shadow',
};

/**
 * Applique un preset et un mode au document. Pas d'effet en SSR
 * (vérifie l'existence de `document`).
 *
 * Met aussi à jour les attributs `data-theme-preset` et
 * `data-theme-mode` sur `<html>` pour permettre des règles CSS
 * conditionnelles (ex. mix-blend-mode différent en sombre).
 */
export function applyPreset(preset: PresetId, mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const palette = resolvePalette(preset, mode);
  const root = document.documentElement;
  for (const [key, varName] of Object.entries(VAR_MAP)) {
    root.style.setProperty(varName, palette[key as keyof typeof palette]);
  }
  root.setAttribute('data-theme-preset', preset);
  // Le mode effectif peut différer du demandé : si le preset n'a
  // pas de variante claire (spectre, datapad), le mode est forcé
  // à 'dark' même si on a demandé 'light'.
  const effectiveMode: ThemeMode = mode === 'light' && presetHasBothModes(preset) ? 'light' : 'dark';
  root.setAttribute('data-theme-mode', effectiveMode);
}
