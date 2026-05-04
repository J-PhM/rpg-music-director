<script lang="ts">
  // Jalon 2 — UI transitionnelle. Sera remplacée au jalon 3 par
  // l'app proprement dite (toolbar complet, fil d'Ariane, canvas, inspecteur).
  // Pour l'instant : toolbar minimale + résumé du scénario chargé +
  // boutons Nouveau / Ouvrir / Enregistrer / Enregistrer sous.

  import { onMount } from 'svelte';

  import { emptyScenario } from '$lib/model/defaults';
  import { EXAMPLE_SCENARIO } from '$lib/model/example';
  import { toJson } from '$lib/model/serialize';
  import type { Scenario } from '$lib/model/types';
  import {
    isTauriContext,
    openScenario,
    saveScenarioAs,
    saveScenarioToPath,
  } from '$lib/io/scenarioFile';

  const APP_VERSION = '0.1.0';

  // ============================================================
  // État réactif
  // ============================================================

  let scenario = $state<Scenario>(structuredClone(EXAMPLE_SCENARIO));
  let currentPath = $state<string | null>(null);
  let baseSerialization = $state<string>(toJson(EXAMPLE_SCENARIO));
  let toastMsg = $state<string>('');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let inTauri = $state<boolean>(false);

  onMount(() => {
    inTauri = isTauriContext();
  });

  // ============================================================
  // Dérivés
  // ============================================================

  const modified = $derived(toJson(scenario) !== baseSerialization);

  const counts = $derived.by(() => {
    let scenes = 0;
    let characters = 0;
    let stingers = 0;
    let cartouches = 0;
    for (const n of scenario.nodes) {
      if (n.type === 'scene') scenes++;
      else if (n.type === 'character') characters++;
      else if (n.type === 'stinger') stingers++;
      else cartouches++;
    }
    return {
      scenes,
      characters,
      stingers,
      cartouches,
      total: scenario.nodes.length,
      connections: scenario.connections.length,
    };
  });

  // ============================================================
  // Actions
  // ============================================================

  function showToast(msg: string): void {
    toastMsg = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMsg = '';
    }, 1800);
  }

  function handleNew(): void {
    if (modified && !confirm('Modifications non sauvegardées. Continuer ?')) return;
    scenario = emptyScenario();
    currentPath = null;
    baseSerialization = toJson(scenario);
    showToast('Nouveau scénario');
  }

  async function handleOpen(): Promise<void> {
    try {
      const result = await openScenario();
      if (!result) return; // utilisateur annule
      scenario = result.scenario;
      currentPath = result.path;
      baseSerialization = toJson(scenario);

      const warnSuffix = result.warnings.length
        ? ` · ${result.warnings.length} avertissement${result.warnings.length > 1 ? 's' : ''}`
        : '';
      const migSuffix = result.migrated ? ' · format migré' : '';
      showToast(`Ouvert${migSuffix}${warnSuffix}`);

      if (result.warnings.length) {
        for (const w of result.warnings) console.warn('[scenario]', w);
      }
    } catch (e) {
      showToast('Erreur : ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleSave(): Promise<void> {
    if (!currentPath) {
      await handleSaveAs();
      return;
    }
    try {
      await saveScenarioToPath(scenario, currentPath);
      baseSerialization = toJson(scenario);
      showToast('Enregistré');
    } catch (e) {
      showToast('Erreur : ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleSaveAs(): Promise<void> {
    try {
      const path = await saveScenarioAs(scenario);
      if (!path) return;
      currentPath = path;
      baseSerialization = toJson(scenario);
      showToast('Enregistré');
    } catch (e) {
      showToast('Erreur : ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  function handleLoadExample(): void {
    if (modified && !confirm('Modifications non sauvegardées. Continuer ?')) return;
    scenario = structuredClone(EXAMPLE_SCENARIO);
    currentPath = null;
    baseSerialization = toJson(scenario);
    showToast('Exemple rechargé');
  }
</script>

<div class="app">
  <header class="toolbar">
    <h1 class="brand display">
      RPG Music Director
      <span class="version kicker">v{APP_VERSION}</span>
    </h1>

    <button class="btn" type="button" onclick={handleNew}>Nouveau</button>
    <button class="btn" type="button" onclick={handleOpen} disabled={!inTauri} title={inTauri ? '' : 'Disponible uniquement dans la fenêtre Tauri'}>Ouvrir</button>
    <button class="btn" type="button" onclick={handleSave} disabled={!inTauri} title={inTauri ? '' : 'Disponible uniquement dans la fenêtre Tauri'}>Enregistrer</button>
    <button class="btn" type="button" onclick={handleSaveAs} disabled={!inTauri} title={inTauri ? '' : 'Disponible uniquement dans la fenêtre Tauri'}>Enregistrer sous</button>
    <button class="btn ghost" type="button" onclick={handleLoadExample}>Exemple</button>

    {#if modified}
      <span class="modified" title="Modifications non sauvegardées">●&nbsp;Modifié</span>
    {/if}
  </header>

  <main class="content">
    <article class="summary">
      <p class="kicker">Scénario chargé</p>
      <h2 class="campaign-title display">{scenario.campaignTitle}</h2>
      <hr class="rule" />

      <dl class="counts">
        <div><dt>🗺️&nbsp;Scènes</dt><dd>{counts.scenes}</dd></div>
        <div><dt>👤&nbsp;Personnages</dt><dd>{counts.characters}</dd></div>
        <div><dt>✨&nbsp;Tadas</dt><dd>{counts.stingers}</dd></div>
        <div><dt>📁&nbsp;Cartouches</dt><dd>{counts.cartouches}</dd></div>
        <div class="sep"><dt>↦&nbsp;Connexions</dt><dd>{counts.connections}</dd></div>
      </dl>

      <hr class="rule" />

      <p class="path">
        {#if currentPath}
          <span class="kicker">Fichier</span>
          <span class="path-value">{currentPath}</span>
        {:else}
          <span class="kicker">non sauvegardé</span>
        {/if}
      </p>

      {#if !inTauri}
        <p class="hint">
          Aperçu navigateur — les boutons <em>Ouvrir / Enregistrer</em> fonctionnent
          uniquement dans la fenêtre Tauri (où le système de fichiers est accessible).
        </p>
      {/if}
    </article>
  </main>

  {#if toastMsg}
    <div class="toast">{toastMsg}</div>
  {/if}
</div>

<style>
  .app {
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
  }

  /* ============================================================
     TOOLBAR
     ============================================================ */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 24px;
    background: var(--paper-soft);
    border-bottom: 1px solid var(--rule);
    flex-wrap: wrap;
  }

  .brand {
    font-size: 22px;
    font-style: italic;
    margin: 0 auto 0 0; /* pousse les boutons à droite */
    line-height: 1;
  }

  .version {
    margin-left: 6px;
    vertical-align: middle;
    font-style: normal;
  }

  .btn {
    font-family: var(--font-mono);
    background: transparent;
    color: var(--ink);
    border: 1px solid var(--rule);
    padding: 6px 14px;
    border-radius: 2px;
    cursor: pointer;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 400;
    transition:
      background var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease),
      border-color var(--t-fast) var(--ease);
  }
  .btn:hover:not(:disabled) {
    background: var(--paper-deep);
    border-color: var(--primary);
    color: var(--primary);
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .btn.ghost {
    color: var(--ink-soft);
    border-style: dashed;
  }

  .modified {
    font-family: var(--font-mono);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--warm);
    padding-left: 8px;
  }

  /* ============================================================
     CONTENU
     ============================================================ */
  .content {
    overflow: auto;
    display: grid;
    place-items: center;
    padding: 32px;
    background: var(--paper);
  }

  .summary {
    max-width: 560px;
    width: 100%;
    text-align: center;
    animation: fade-in var(--t-slow) var(--ease) both;
  }

  .summary > .kicker {
    margin-bottom: 8px;
  }

  .campaign-title {
    font-size: clamp(28px, 4vw, 44px);
    line-height: 1.15;
    margin: 4px 0 18px;
  }

  .rule {
    margin: 18px auto;
  }

  /* ============================================================
     COMPTAGES
     ============================================================ */
  .counts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0;
    margin: 0 auto;
    max-width: 480px;
    text-align: left;
  }
  .counts > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 8px 14px;
    border-bottom: 1px solid var(--rule-soft);
  }
  .counts > div.sep {
    border-top: 1px solid var(--rule);
    margin-top: 4px;
  }
  .counts dt {
    font-family: var(--font-text);
    font-size: 14px;
    color: var(--ink);
  }
  .counts dd {
    font-family: var(--font-mono);
    font-size: 14px;
    color: var(--accent);
    font-weight: 500;
    margin: 0;
  }

  /* ============================================================
     CHEMIN + HINT
     ============================================================ */
  .path {
    font-size: 12px;
    line-height: 1.5;
    color: var(--ink-soft);
  }
  .path .kicker {
    display: inline-block;
    margin-right: 6px;
  }
  .path-value {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-soft);
    word-break: break-all;
  }

  .hint {
    margin-top: 24px;
    padding: 14px 18px;
    background: var(--paper-soft);
    border-left: 2px solid var(--accent-soft);
    font-style: italic;
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink-soft);
    text-align: left;
  }

  /* ============================================================
     TOAST
     ============================================================ */
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--paper);
    border: 1px solid var(--rule);
    padding: 10px 18px;
    border-radius: 2px;
    font-size: 13px;
    font-family: var(--font-text);
    font-style: italic;
    color: var(--ink);
    box-shadow: var(--shadow);
    animation: toast-in var(--t-mid) var(--ease) both;
    z-index: 100;
  }

  /* ============================================================
     ANIMATIONS
     ============================================================ */
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translate(-50%, 6px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
</style>
