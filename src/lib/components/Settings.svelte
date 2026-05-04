<script lang="ts">
  /**
   * Modale Paramètres du scénario.
   *
   * Sections présentes au jalon 4.5 :
   * - Apparence : image de fond (par défaut / personnalisée / aucune)
   *   et opacité de l'image.
   * - Langue : sélecteur FR / EN. Le dictionnaire EN sera rempli au
   *   jalon 13 — pour l'instant choisir EN garde l'affichage en
   *   français (repli sur dict FR).
   *
   * Sections à venir : transitions audio (jalon 16), thème
   * clair/sombre (jalon 14, qui pourra remonter ici), raccourcis
   * clavier (jalon 18).
   */

  import { isTauriContext, pickImage } from '$lib/io/scenarioFile';
  import { i18n, t } from '$lib/i18n/i18n.svelte';
  import { store } from '$lib/store/scenarioStore.svelte';
  import type { Language } from '$lib/model/types';

  interface Props {
    open: boolean;
    onClose: () => void;
    onToast: (msg: string) => void;
  }
  let { open, onClose, onToast }: Props = $props();

  let inTauri = $state(false);
  $effect(() => {
    inTauri = isTauriContext();
  });

  function handleKeydown(e: KeyboardEvent): void {
    if (open && e.key === 'Escape') onClose();
  }

  function handleBackdropPointerDown(e: PointerEvent): void {
    if (e.target === e.currentTarget) onClose();
  }

  async function handlePickImage(): Promise<void> {
    try {
      const path = await pickImage();
      if (!path) return;
      store.setBackgroundImagePath(path);
      onToast(t('settings.toast.bgChanged'));
    } catch (e) {
      onToast(t('toast.error', { msg: e instanceof Error ? e.message : String(e) }));
    }
  }

  function handleResetImage(): void {
    store.setBackgroundImagePath(null);
    onToast(t('settings.toast.bgReset'));
  }

  function handleRemoveImage(): void {
    store.setBackgroundImagePath('');
    onToast(t('settings.toast.bgRemoved'));
  }

  function handleOpacityInput(e: Event): void {
    const v = Number((e.target as HTMLInputElement).value);
    store.setBackgroundOpacity(v);
  }

  function handleLanguageChange(e: Event): void {
    const v = (e.target as HTMLSelectElement).value as Language;
    store.setScenarioLanguage(v);
  }

  /** Libellé affiché pour l'image courante. */
  const imageLabel = $derived.by((): string => {
    const p = store.scenario.appearance.backgroundImagePath;
    if (p === null) return t('settings.bg.current.default');
    if (p === '') return t('settings.bg.current.none');
    const parts = p.split(/[\\/]/);
    return parts[parts.length - 1] || p;
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    class="backdrop"
    onpointerdown={handleBackdropPointerDown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
  >
    <div class="modal">
      <header class="modal-header">
        <h2 id="settings-title" class="display title">{t('settings.title')}</h2>
        <button
          class="close-btn"
          type="button"
          onclick={onClose}
          aria-label={t('settings.close')}
        >×</button>
      </header>

      <section class="section">
        <h3 class="kicker section-title">{t('settings.section.appearance')}</h3>

        <span class="label" id="bg-image-label">{t('settings.bg.label')}</span>
        <div class="image-row" role="group" aria-labelledby="bg-image-label">
          <span class="image-current">{imageLabel}</span>
          <div class="image-buttons">
            <button class="btn" type="button" onclick={handleResetImage}>
              {t('settings.bg.default')}
            </button>
            <button
              class="btn"
              type="button"
              onclick={handlePickImage}
              disabled={!inTauri}
              title={inTauri ? '' : t('toolbar.tooltip.tauriOnly')}
            >
              {t('settings.bg.custom')}
            </button>
            <button class="btn ghost" type="button" onclick={handleRemoveImage}>
              {t('settings.bg.none')}
            </button>
          </div>
        </div>

        <label class="label" for="bg-opacity">
          {t('settings.bg.opacity')}
          <span class="opacity-value">
            {t('settings.bg.opacityValue', { n: store.scenario.appearance.backgroundOpacity })}
          </span>
        </label>
        <input
          id="bg-opacity"
          class="opacity-slider"
          type="range"
          min="0"
          max="100"
          step="1"
          value={store.scenario.appearance.backgroundOpacity}
          oninput={handleOpacityInput}
        />
        <p class="hint">{t('settings.bg.hint')}</p>
      </section>

      <section class="section">
        <h3 class="kicker section-title">{t('settings.section.language')}</h3>
        <label class="label" for="lang-select">{t('settings.lang.label')}</label>
        <select
          id="lang-select"
          class="field"
          value={i18n.lang}
          onchange={handleLanguageChange}
        >
          <option value="fr">{t('settings.lang.fr')}</option>
          <option value="en">{t('settings.lang.en')}</option>
        </select>
        <p class="hint">{t('settings.lang.hint')}</p>
      </section>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(20, 16, 10, 0.45);
    display: grid;
    place-items: center;
    z-index: 200;
    animation: backdrop-in var(--t-mid) var(--ease) both;
    padding: 32px;
  }

  .modal {
    background: var(--paper-soft);
    border: 1px solid var(--rule);
    border-radius: 4px;
    box-shadow: 0 8px 32px rgba(20, 16, 10, 0.25);
    width: 100%;
    max-width: 540px;
    max-height: 90vh;
    overflow-y: auto;
    animation: modal-in var(--t-slow) var(--ease) both;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 24px 12px;
    border-bottom: 1px solid var(--rule);
  }

  .title {
    font-size: 22px;
    margin: 0;
  }

  .close-btn {
    background: transparent;
    border: none;
    font-size: 28px;
    line-height: 1;
    color: var(--ink-soft);
    cursor: pointer;
    padding: 0 4px;
    transition: color var(--t-fast) var(--ease);
  }
  .close-btn:hover {
    color: var(--primary);
  }

  .section {
    padding: 20px 24px;
    border-bottom: 1px solid var(--rule-soft);
  }
  .section:last-child {
    border-bottom: none;
  }

  .section-title {
    margin-bottom: 12px;
  }

  .image-row {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
  }

  .image-current {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-soft);
    background: var(--paper);
    border: 1px solid var(--rule-soft);
    padding: 8px 12px;
    border-radius: 2px;
    word-break: break-all;
  }

  .image-buttons {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .opacity-slider {
    width: 100%;
    accent-color: var(--primary);
    margin: 6px 0 8px;
  }

  .opacity-value {
    font-family: var(--font-mono);
    color: var(--accent);
    margin-left: 8px;
  }

  .hint {
    margin-top: 10px;
    font-size: 12px;
    color: var(--ink-soft);
    font-style: italic;
    line-height: 1.5;
  }

  @keyframes backdrop-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes modal-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
