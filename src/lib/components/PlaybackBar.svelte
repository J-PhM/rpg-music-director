<script lang="ts">
  /**
   * Barre de lecture en bas de l'app (jalon 9).
   *
   * Trois colonnes lisent l'état du moteur audio en direct :
   * - **En cours** : titre du sommet de la pile (ce qu'on entend).
   * - **Tada** : stinger en cours s'il y en a un.
   * - **Pile** : compteur de couches (informatif).
   *
   * Deux boutons :
   * - **Tout arrêter** : pile + tada immédiatement coupés.
   * - **Fade out** : fondu général sur 2,5 s puis stop.
   *
   * Le panneau de réordonnancement de la pile (drag-and-drop pour
   * changer l'ordre, bouton Retirer par couche) viendra dans un
   * sous-jalon ultérieur — il faut une UI dédiée plus consistante.
   */

  import { engine } from '$lib/audio/engine.svelte';
  import { t } from '$lib/i18n/i18n.svelte';
  import { store } from '$lib/store/scenarioStore.svelte';

  interface Props {
    onToast: (msg: string) => void;
  }
  let { onToast }: Props = $props();

  function nodeTitle(nodeId: number): string {
    const n = store.scenario.nodes.find((x) => x.id === nodeId);
    return n?.title ?? '?';
  }

  const layersLabel = $derived.by((): string => {
    const n = engine.stack.length;
    if (n === 0) return t('playback.layers.zero');
    if (n === 1) return t('playback.layers.one');
    return t('playback.layers.many', { n });
  });

  function handleStopAll(): void {
    engine.stopAll();
    onToast(t('toast.audioStopped'));
  }

  function handleFadeOut(): void {
    engine.fadeOut();
    onToast(t('toast.audioFadingOut'));
  }
</script>

<footer class="playback-bar">
  <div class="np">
    <div class="label">{t('playback.now')}</div>
    <div class="title" class:silent={!engine.topLayer}>
      {engine.topLayer ? nodeTitle(engine.topLayer.nodeId) : t('playback.silent')}
    </div>
  </div>

  <div class="np">
    <div class="label">{t('playback.tada')}</div>
    <div class="title" class:silent={!engine.stinger}>
      {engine.stinger ? nodeTitle(engine.stinger.nodeId) : t('playback.empty')}
    </div>
  </div>

  <div class="np">
    <div class="label">{t('playback.stack')}</div>
    <div class="title" class:silent={engine.stack.length === 0}>{layersLabel}</div>
  </div>

  <button class="btn danger" type="button" onclick={handleStopAll}>
    {t('playback.stopAll')}
  </button>
  <button class="btn" type="button" onclick={handleFadeOut}>
    {t('playback.fadeOut')}
  </button>
</footer>

<style>
  .playback-bar {
    background: var(--paper-soft);
    border-top: 1px solid var(--rule);
    padding: 14px 24px;
    display: flex;
    align-items: center;
    gap: 24px;
    flex-shrink: 0;
    min-height: 70px;
  }

  .np {
    flex: 1;
    min-width: 0;
  }

  .label {
    font-family: var(--font-mono);
    color: var(--accent);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    margin-bottom: 4px;
  }

  .title {
    font-family: var(--font-text);
    color: var(--ink);
    font-weight: 500;
    font-style: italic;
    margin-top: 3px;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title.silent {
    color: var(--ink-soft);
    opacity: 0.7;
  }
</style>
