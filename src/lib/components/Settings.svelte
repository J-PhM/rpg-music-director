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
  import { history } from '$lib/history/history.svelte';
  import type { Language, TransitionType } from '$lib/model/types';
  import { PRESET_IDS, presetHasBothModes, resolvePalette, type PresetId, type ThemeMode } from '$lib/themes/presets';
  import {
    clearStoredAuth as clearSpotifyAuth,
    getStoredAuth as getSpotifyAuth,
    getStoredClientId as getSpotifyClientId,
    loginSpotify,
    setStoredClientId as setSpotifyClientId,
    type SpotifyAuth,
  } from '$lib/audio/spotify';

  /** Ordre d'affichage des modes de transition (du plus courant au plus rare). */
  const TRANSITION_TYPES: TransitionType[] = ['crossfade', 'fade', 'cut'];

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
      history.snapshot('Image de fond');
      store.setBackgroundImagePath(path);
      onToast(t('settings.toast.bgChanged'));
    } catch (e) {
      onToast(t('toast.error', { msg: e instanceof Error ? e.message : String(e) }));
    }
  }

  function handleResetImage(): void {
    history.snapshot('Fond par défaut');
    store.setBackgroundImagePath(null);
    onToast(t('settings.toast.bgReset'));
  }

  function handleRemoveImage(): void {
    history.snapshot('Aucun fond');
    store.setBackgroundImagePath('');
    onToast(t('settings.toast.bgRemoved'));
  }

  function handleOpacityInput(e: Event): void {
    // Coalescing : tous les ticks consécutifs du slider sont fondus
    // en une seule entrée d'historique (le snapshot original = état
    // AVANT le drag, qui sera restauré par Ctrl+Z).
    history.snapshot('Opacité du fond', 'opacity-slider', 1500);
    const v = Number((e.target as HTMLInputElement).value);
    store.setBackgroundOpacity(v);
  }

  function handleLanguageChange(e: Event): void {
    const v = (e.target as HTMLSelectElement).value as Language;
    store.setScenarioLanguage(v);
  }

  function handlePresetChange(preset: PresetId): void {
    history.snapshot('Thème');
    // Si le preset choisi est nativement sombre et qu'on était en clair,
    // on bascule en sombre (la fonction store.setTheme + applyPreset
    // gèrent déjà le repli en interne, mais on force ici pour que la
    // donnée du scénario reflète l'effectif).
    const wantedMode = presetHasBothModes(preset) ? store.scenario.theme.mode : 'dark';
    store.setTheme(preset, wantedMode);
  }

  function handleModeChange(mode: ThemeMode): void {
    history.snapshot('Variante de thème');
    store.setTheme(store.scenario.theme.preset, mode);
  }

  // === Handlers section Transitions (jalon 16) ===
  function handleTransitionTypeChange(type: TransitionType): void {
    history.snapshot('Type de transition');
    store.setTransitionType(type);
  }

  function handleDurationInput(e: Event): void {
    // Coalescing : tous les ticks consécutifs du slider sont fondus
    // en une seule entrée d'historique (pattern identique à l'opacité).
    history.snapshot('Durée du fondu', 'transition-duration', 1500);
    const v = Number((e.target as HTMLInputElement).value);
    store.setTransitionDuration(v);
  }

  function handleResumeChange(e: Event): void {
    history.snapshot('Reprise sous-jacente');
    const checked = (e.target as HTMLInputElement).checked;
    store.setResumeUnderlying(checked);
  }

  /** Affichage : "2" pour entier, "2.5" sinon. Évite "2.0 s" disgracieux. */
  const durationDisplay = $derived.by((): string => {
    const v = store.scenario.transitions.durationSec;
    return Number.isInteger(v) ? v.toString() : v.toFixed(1);
  });

  // === Spotify (jalon 19) ===
  // L'auth est stockée en localStorage (clés `rpgmd:spotify:*`). On
  // recharge à chaque ouverture de la modale pour refléter les changes
  // depuis une autre fenêtre / un précédent login.
  let spotifyClientId = $state(getSpotifyClientId());
  let spotifyAuth = $state<SpotifyAuth | null>(getSpotifyAuth());
  let spotifyConnecting = $state(false);
  $effect(() => {
    if (open) {
      spotifyClientId = getSpotifyClientId();
      spotifyAuth = getSpotifyAuth();
    }
  });

  function handleSpotifyClientIdInput(e: Event): void {
    const v = (e.target as HTMLInputElement).value.trim();
    spotifyClientId = v;
    setSpotifyClientId(v);
  }

  async function handleSpotifyConnect(): Promise<void> {
    if (!isTauriContext()) {
      onToast(t('toolbar.tooltip.tauriOnly'));
      return;
    }
    if (!spotifyClientId) {
      onToast(t('settings.spotify.toast.noClientId'));
      return;
    }
    spotifyConnecting = true;
    try {
      const auth = await loginSpotify(spotifyClientId);
      spotifyAuth = auth;
      onToast(t('settings.spotify.toast.connected'));
    } catch (e) {
      onToast(t('toast.error', { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      spotifyConnecting = false;
    }
  }

  function handleSpotifyDisconnect(): void {
    clearSpotifyAuth();
    spotifyAuth = null;
    onToast(t('settings.spotify.toast.disconnected'));
  }

  /** True si le preset courant supporte clair + sombre. */
  const bothModes = $derived(presetHasBothModes(store.scenario.theme.preset));

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
        <h3 class="kicker section-title">{t('settings.section.theme')}</h3>

        <span class="label">{t('settings.theme.preset')}</span>
        <div class="preset-grid" role="radiogroup">
          {#each PRESET_IDS as pid (pid)}
            {@const isActive = store.scenario.theme.preset === pid}
            {@const lightP = resolvePalette(pid, 'light')}
            {@const darkP = resolvePalette(pid, 'dark')}
            {@const previewP = presetHasBothModes(pid) && store.scenario.theme.mode === 'light'
              ? lightP
              : darkP}
            <button
              class="preset-card"
              class:active={isActive}
              type="button"
              role="radio"
              aria-checked={isActive}
              onclick={() => handlePresetChange(pid)}
              title={t(`theme.${pid}.tagline` as const)}
            >
              <span
                class="preset-swatch"
                style:background={previewP.paper}
                style:border-color={previewP.rule}
              >
                <span class="dot" style:background={previewP.primary}></span>
                <span class="dot" style:background={previewP.highlight}></span>
                <span class="dot" style:background={previewP.playing}></span>
              </span>
              <span class="preset-label">{t(`theme.${pid}.label` as const)}</span>
              <span class="preset-tagline">{t(`theme.${pid}.tagline` as const)}</span>
            </button>
          {/each}
        </div>

        <span class="label">{t('settings.theme.mode')}</span>
        <div class="mode-buttons" role="radiogroup">
          <button
            class="btn"
            type="button"
            role="radio"
            aria-checked={store.scenario.theme.mode === 'light'}
            class:primary={store.scenario.theme.mode === 'light'}
            onclick={() => handleModeChange('light')}
            disabled={!bothModes}
          >☀ {t('settings.theme.mode.light')}</button>
          <button
            class="btn"
            type="button"
            role="radio"
            aria-checked={store.scenario.theme.mode === 'dark'}
            class:primary={store.scenario.theme.mode === 'dark'}
            onclick={() => handleModeChange('dark')}
          >☾ {t('settings.theme.mode.dark')}</button>
        </div>
        {#if !bothModes}
          <p class="hint dark-only-hint">{t('settings.theme.modeDarkOnly')}</p>
        {/if}
        <p class="hint">{t('settings.theme.hint')}</p>
      </section>

      <section class="section">
        <h3 class="kicker section-title">{t('settings.section.transitions')}</h3>

        <span class="label">{t('settings.transition.type.label')}</span>
        <div class="transition-type-grid" role="radiogroup">
          {#each TRANSITION_TYPES as ttype (ttype)}
            {@const isActive = store.scenario.transitions.type === ttype}
            <button
              class="transition-type-card"
              class:active={isActive}
              type="button"
              role="radio"
              aria-checked={isActive}
              onclick={() => handleTransitionTypeChange(ttype)}
            >
              <span class="transition-type-label">{t(`settings.transition.type.${ttype}` as const)}</span>
              <span class="transition-type-tagline">{t(`settings.transition.type.${ttype}.tagline` as const)}</span>
            </button>
          {/each}
        </div>

        <label class="label" for="transition-duration">
          {t('settings.transition.duration.label')}
          <span class="duration-value">
            {t('settings.transition.duration.value', { n: durationDisplay })}
          </span>
        </label>
        <input
          id="transition-duration"
          class="duration-slider"
          type="range"
          min="0.5"
          max="5"
          step="0.1"
          value={store.scenario.transitions.durationSec}
          oninput={handleDurationInput}
          disabled={store.scenario.transitions.type === 'cut'}
        />
        {#if store.scenario.transitions.type === 'cut'}
          <p class="hint dark-only-hint">{t('settings.transition.duration.disabled')}</p>
        {/if}

        <label class="resume-toggle">
          <input
            type="checkbox"
            checked={store.scenario.transitions.resumeUnderlying}
            onchange={handleResumeChange}
          />
          <span>{t('settings.transition.resume.label')}</span>
        </label>
        <p class="hint">{t('settings.transition.resume.hint')}</p>
        <p class="hint">{t('settings.transition.hint')}</p>
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

      <section class="section">
        <h3 class="kicker section-title">{t('settings.section.spotify')}</h3>

        <label class="label" for="spotify-client-id">{t('settings.spotify.clientId')}</label>
        <input
          id="spotify-client-id"
          class="field"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder={t('settings.spotify.clientIdPlaceholder')}
          value={spotifyClientId}
          oninput={handleSpotifyClientIdInput}
        />
        <p class="hint">{t('settings.spotify.clientIdHint')}</p>

        <div class="spotify-status">
          {#if spotifyAuth}
            <span class="spotify-connected">
              ●&nbsp;{t('settings.spotify.connected', { email: spotifyAuth.userEmail ?? '?' })}
            </span>
          {:else}
            <span class="spotify-disconnected">{t('settings.spotify.disconnected')}</span>
          {/if}
        </div>
        <div class="spotify-actions">
          {#if spotifyAuth}
            <button
              class="btn"
              type="button"
              onclick={handleSpotifyDisconnect}
            >{t('settings.spotify.disconnect')}</button>
          {:else}
            <button
              class="btn primary"
              type="button"
              disabled={!inTauri || !spotifyClientId || spotifyConnecting}
              onclick={handleSpotifyConnect}
              title={inTauri ? '' : t('toolbar.tooltip.tauriOnly')}
            >
              {spotifyConnecting ? t('settings.spotify.connecting') : t('settings.spotify.connect')}
            </button>
          {/if}
        </div>
        <p class="hint">{t('settings.spotify.hint')}</p>
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
  .dark-only-hint {
    margin-top: 6px;
    font-size: 11px;
  }

  /* Sélecteur de preset (jalon 14) */
  .preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
    margin-bottom: 16px;
  }
  .preset-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 10px 12px;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 2px;
    cursor: pointer;
    text-align: left;
    transition: border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease);
    font-family: inherit;
  }
  .preset-card:hover {
    border-color: var(--accent);
    background: var(--paper-deep);
  }
  .preset-card.active {
    border-color: var(--primary);
    border-width: 2px;
    padding: 9px 11px; /* compense le bord épaissi */
  }
  .preset-swatch {
    width: 100%;
    height: 28px;
    border-radius: 2px;
    border: 1px solid;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    padding: 0 6px;
  }
  .preset-swatch .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .preset-label {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 14px;
    color: var(--ink);
  }
  .preset-tagline {
    font-family: var(--font-mono);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: var(--accent);
  }

  .mode-buttons {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }
  .mode-buttons .btn {
    flex: 1;
  }

  /* Section Transitions (jalon 16) */
  .transition-type-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    margin-bottom: 16px;
  }
  .transition-type-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 10px 12px;
    background: var(--paper);
    border: 1px solid var(--rule);
    border-radius: 2px;
    cursor: pointer;
    text-align: left;
    transition: border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease);
    font-family: inherit;
  }
  .transition-type-card:hover {
    border-color: var(--accent);
    background: var(--paper-deep);
  }
  .transition-type-card.active {
    border-color: var(--primary);
    border-width: 2px;
    padding: 9px 11px; /* compense le bord épaissi */
  }
  .transition-type-label {
    font-family: var(--font-display);
    font-style: italic;
    font-size: 14px;
    color: var(--ink);
  }
  .transition-type-tagline {
    font-family: var(--font-mono);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: var(--accent);
    line-height: 1.5;
  }

  .duration-slider {
    width: 100%;
    accent-color: var(--primary);
    margin: 6px 0 8px;
  }
  .duration-slider:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .duration-value {
    font-family: var(--font-mono);
    color: var(--accent);
    margin-left: 8px;
  }

  .resume-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 14px 0 0;
    cursor: pointer;
    text-transform: none;
    letter-spacing: 0;
    font-family: var(--font-text);
    font-size: 13px;
    font-style: italic;
    color: var(--ink);
  }
  .resume-toggle input[type='checkbox'] {
    cursor: pointer;
    accent-color: var(--primary);
    margin: 0;
  }

  /* Section Spotify (jalon 19) */
  .spotify-status {
    margin-top: 14px;
    margin-bottom: 8px;
    font-size: 12px;
    font-style: italic;
  }
  .spotify-connected {
    font-family: var(--font-mono);
    color: var(--playing);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 10px;
    font-style: normal;
  }
  .spotify-disconnected {
    color: var(--ink-soft);
  }
  .spotify-actions {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
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
