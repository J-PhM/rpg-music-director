<script lang="ts">
  /**
   * Fil d'Ariane : `Campagne › Partie 1 › Sous-partie`.
   *
   * - Clic sur un item (sauf le dernier qui est l'élément courant)
   *   → navigation vers ce niveau via le store.
   * - Double-clic sur n'importe quel item (y compris la racine)
   *   → édition du titre en place. Validation par Entrée ou
   *   perte de focus, annulation par Échap. Une valeur vide annule.
   * - L'item racine renomme la campagne, les autres renomment leur cartouche.
   */

  import { tick } from 'svelte';
  import { getBreadcrumb, type BreadcrumbItem } from '$lib/model/navigation';
  import { store } from '$lib/store/scenarioStore.svelte';

  // Liste d'items dérivée du scénario courant + sélection navigationnelle
  const items = $derived<BreadcrumbItem[]>(
    getBreadcrumb(store.scenario, store.scenario.currentCartoucheId),
  );

  // État d'édition en place
  interface EditState {
    id: BreadcrumbItem['id']; // null = renommer la campagne
    value: string;
  }
  let editing = $state<EditState | null>(null);
  let inputEl: HTMLInputElement | null = null;

  async function startEdit(item: BreadcrumbItem): Promise<void> {
    editing = { id: item.id, value: item.title };
    await tick(); // attend le rendu de l'input
    inputEl?.focus();
    inputEl?.select();
  }

  function commitEdit(): void {
    if (!editing) return;
    const value = editing.value.trim();
    if (value.length === 0) {
      // Annule si vide
      editing = null;
      return;
    }
    if (editing.id === null) {
      store.renameCampaign(value);
    } else {
      store.renameCartouche(editing.id, value);
    }
    editing = null;
  }

  function cancelEdit(): void {
    editing = null;
  }

  function handleKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }

  function handleClick(item: BreadcrumbItem, isLast: boolean): void {
    if (isLast) return; // l'élément courant n'est pas cliquable pour naviguer
    store.goToCartouche(item.id);
  }
</script>

<nav class="breadcrumb" aria-label="Fil d'Ariane">
  {#each items as item, i (item.id ?? 'root')}
    {@const isLast = i === items.length - 1}
    {@const isEditing = editing?.id === item.id}

    {#if isEditing && editing}
      <input
        bind:this={inputEl}
        bind:value={editing.value}
        class="edit-input"
        type="text"
        size={Math.max(12, editing.value.length + 2)}
        onblur={commitEdit}
        onkeydown={handleKey}
      />
    {:else}
      <span
        class="item"
        class:current={isLast}
        role="button"
        tabindex="0"
        title="Double-clique pour renommer"
        onclick={() => handleClick(item, isLast)}
        ondblclick={() => startEdit(item)}
      >{item.title}</span>
    {/if}

    {#if !isLast}
      <span class="sep" aria-hidden="true">›</span>
    {/if}
  {/each}
</nav>

<style>
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 24px;
    background: var(--paper);
    border-bottom: 1px solid var(--rule-soft);
    font-size: 14px;
    flex-shrink: 0;
    overflow-x: auto;
    font-family: var(--font-text);
  }

  .item {
    color: var(--ink-soft);
    cursor: pointer;
    padding: 2px 4px;
    white-space: nowrap;
    font-style: italic;
    border-radius: 2px;
    transition: color var(--t-fast) var(--ease);
    user-select: none;
  }
  .item:hover {
    color: var(--primary);
  }
  .item.current {
    color: var(--ink);
    cursor: default;
    font-weight: 500;
    font-style: normal;
  }
  .item.current:hover {
    color: var(--ink);
  }

  .sep {
    color: var(--accent-soft);
    user-select: none;
  }

  .edit-input {
    background: var(--paper);
    color: var(--ink);
    border: 1px solid var(--primary);
    padding: 2px 8px;
    border-radius: 2px;
    font-size: 14px;
    font-weight: 500;
    font-family: var(--font-text);
    outline: none;
    min-width: 140px;
  }
</style>
