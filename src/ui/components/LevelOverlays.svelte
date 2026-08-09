<script>
  let { state: view, command } = $props();
</script>

{#if view.cutscene}
  <section class="level-cutscene" id="level-cutscene" aria-label="Level-Intro">
    <div class="level-cutscene-heading"><small>MAP → LEVEL</small><strong>{view.cutscene.title}</strong></div>
    {#if view.cutscene.dialogue}
      <div class="level-cutscene-dialogue" role="status"><strong>{view.cutscene.dialogue.speaker}</strong><p>{view.cutscene.dialogue.text}</p></div>
    {/if}
    {#if view.cutscene.skippable}
      <button class="level-cutscene-skip" id="level-cutscene-skip" type="button" onclick={() => command('skipCutscene')}>{view.cutscene.skipLabel}</button>
    {/if}
  </section>
{/if}

{#if view.easterToast}
  <div class="easter-toast" id="easter-toast" role="status"><span aria-hidden="true">✦</span><p>{view.easterToast}</p></div>
{/if}

{#if view.confettiActive && view.confetti.length}
  <div class="level-confetti active" id="level-confetti" aria-hidden="true">
    {#each view.confetti as piece}
      <i style={`--confetti-x:${piece.x};--confetti-drift:${piece.drift};--confetti-delay:${piece.delay};--confetti-duration:${piece.duration};--confetti-color:${piece.color};--confetti-turn:${piece.turn}`}></i>
    {/each}
  </div>
{/if}
