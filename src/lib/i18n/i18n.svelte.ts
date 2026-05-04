/**
 * État de langue + helper `t()` réactif.
 *
 * La langue est mémorisée dans le scénario lui-même (cf. cahier) — on
 * synchronise via `setLang` lors d'un chargement de fichier. Ici on
 * expose juste un singleton réactif.
 *
 * Usage dans un composant Svelte :
 *   import { t } from '$lib/i18n/i18n.svelte';
 *   <button>{t('toolbar.addScene')}</button>
 *
 * Comme `t` lit `i18n.lang` qui est un `$state`, le rendu se met
 * automatiquement à jour quand on change de langue.
 *
 * Substitution : `t('toast.warningSuffix.many', { n: 3 })`
 *   → "· 3 avertissements"
 */

import { dictionaries, FR, type DictKey, type Language } from './dict';

class I18n {
  lang = $state<Language>('fr');
}

export const i18n = new I18n();

/** Change la langue active. À appeler au chargement d'un scénario. */
export function setLang(lang: Language): void {
  i18n.lang = lang;
}

/**
 * Récupère la chaîne traduite pour une clé donnée. Substitue les
 * placeholders `{name}` par les valeurs du second argument.
 *
 * Repli en cascade : langue active → français → clé brute.
 */
export function t(key: DictKey, vars?: Record<string, string | number>): string {
  const langDict = dictionaries[i18n.lang];
  let template = langDict?.[key] ?? FR[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      template = template.replaceAll(`{${name}}`, String(value));
    }
  }
  return template;
}
