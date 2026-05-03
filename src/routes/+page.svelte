<script lang="ts">
  // Jalon 1 — écran d'accueil. Sera remplacé au jalon 3 par l'app proprement dite
  // (toolbar, fil d'Ariane, canvas du graphe nodal, inspecteur).
  const version = '0.1.0';
</script>

<main class="welcome">
  <article class="content">
    <h1 class="display title">RPG Music Director</h1>
    <hr class="rule" />
    <p class="kicker">Lemniscate · v{version}</p>
    <p class="intent">
      Une scénarisation musicale pour vos parties de jeu de rôle — <br />
      à la manière des bandes originales de cinéma et de jeu vidéo.
    </p>
  </article>
</main>

<style>
  .welcome {
    height: 100vh;
    width: 100vw;
    display: grid;
    place-items: center;
    background: var(--paper);
    animation: fade-in var(--t-slow) var(--ease) both;
  }

  .content {
    text-align: center;
    max-width: 540px;
    padding: 0 32px;
  }

  .title {
    font-size: clamp(40px, 6vw, 64px);
    line-height: 1.1;
    margin-bottom: 24px;
  }

  .rule {
    margin: 0 auto 18px;
  }

  .kicker {
    margin-bottom: 28px;
  }

  .intent {
    font-family: var(--font-text);
    font-style: italic;
    font-size: 17px;
    line-height: 1.6;
    color: var(--ink-soft);
  }

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
</style>
