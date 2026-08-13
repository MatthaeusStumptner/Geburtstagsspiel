<script>
  import { tick } from 'svelte';
  import './OnboardingWizard.css';

  let { state: view, command } = $props();
  let name = $state('');
  let age = $state('');
  let nameInput = $state();
  let setupFocus = $state();
  let guideFocus = $state();

  const steps = ['identity', 'setup', 'guide'];
  let activeIndex = $derived(steps.indexOf(view.step));

  $effect(() => {
    if (!view.open) return;
    const step = view.step;
    tick().then(() => {
      if (step === 'identity') nameInput?.focus();
      if (step === 'setup') setupFocus?.focus();
      if (step === 'guide') guideFocus?.focus();
    });
  });

  function submitIdentity(event) {
    event.preventDefault();
    command('validateOnboarding', name, age);
  }
</script>

{#if view.open}
  <div class="onboarding-dialog" role="presentation">
    <div class="onboarding-panel" role="dialog" aria-modal="true" aria-labelledby={`onboarding-${view.step}-title`}>
      <div class="onboarding-progress" aria-label={`Einrichtung, Schritt ${activeIndex + 1} von ${steps.length}`}>
        {#each steps as step, index}
          <span class:active={index === activeIndex} class:done={index < activeIndex}><b>{index + 1}</b></span>
          {#if index < steps.length - 1}<i></i>{/if}
        {/each}
      </div>

      {#key view.step}
        {#if view.step === 'identity'}
          <section class="onboarding-step step-enter">
            <p class="section-label">KOMMUNALE SONDERSTELLE · VORGANG 60</p>
            <h2 id="onboarding-identity-title">Identitätsfeststellung</h2>
            <p class="onboarding-copy">
              Für dich liegt eine anlassbezogene Sonderakte vor. Inhalt, Zweck und etwaige Nebenwirkungen dürfen erst nach eindeutigem Personenabgleich offengelegt werden.
            </p>
            <form class="onboarding-login-form" novalidate onsubmit={submitIdentity}>
              <div class="onboarding-fields">
                <label>
                  <span>VORNAME LAUT PERSONALAKTE</span>
                  <input bind:this={nameInput} bind:value={name} type="text" autocomplete="given-name" placeholder="Zum Beispiel: Franz" aria-invalid={view.nameInvalid} />
                </label>
                <label>
                  <span>VOLLENDETE DIENSTJAHRE</span>
                  <input bind:value={age} type="number" inputmode="numeric" min="1" max="120" placeholder="??" aria-invalid={view.ageInvalid} />
                </label>
              </div>
              <p class:success={view.success} class="onboarding-error" role="alert" aria-live="polite">{view.error}</p>
              <button class="primary-button" type="submit" disabled={view.busy} data-ui-sound="none">IDENTITÄT PRÜFEN →</button>
            </form>
            <p class="onboarding-fine-print">🔒 Dienstlich versiegelt. Ein Passwort ist laut Formular 60-B nicht vorgesehen.</p>
          </section>
        {:else if view.step === 'setup'}
          <section class="onboarding-step step-enter">
            <p class="section-label">VORPRÜFUNG · PERSÖNLICHE PRÄFERENZEN</p>
            <h2 id="onboarding-setup-title">Verfahrensparameter</h2>
            <p class="onboarding-copy">
              Vor Öffnung der Sonderakte sind zwei formlose Festlegungen erforderlich. Der Gegenstand des Verfahrens bleibt bis zur Einweisung pflichtgemäß geheim.
            </p>

            <fieldset class="onboarding-choice-group">
              <legend>1 · KOMMUNIKATIONSPROTOKOLL</legend>
              <div class="onboarding-language-options">
                <button bind:this={setupFocus} type="button" class:active={view.language === 'standard'} aria-pressed={view.language === 'standard'} data-onboarding-language="standard" onclick={() => command('setOnboardingLanguage', 'standard')}>
                  <strong>Schönes Deutsch</strong><small>Normgerechte Zustellung in vollständigen Sätzen.</small>
                </button>
                <button type="button" class:active={view.language === 'dialect'} aria-pressed={view.language === 'dialect'} data-onboarding-language="dialect" onclick={() => command('setOnboardingLanguage', 'dialect')}>
                  <strong>Niederbairisch</strong><small>Regionalverfahren mit maximaler Verständlichkeit vor Ort.</small>
                </button>
              </div>
            </fieldset>

            <fieldset class="onboarding-choice-group">
              <legend>2 · VORGANGSINTENSITÄT</legend>
              <div class="onboarding-difficulty-options">
                <button type="button" class:active={view.difficulty === 'easy'} aria-pressed={view.difficulty === 'easy'} data-onboarding-difficulty="easy" onclick={() => command('setOnboardingDifficulty', 'easy')}>
                  <strong>Regelbetrieb</strong><small>Großzügige Ermessensspielräume.<br />Jubiläumsschonend.</small>
                </button>
                <button type="button" class:active={view.difficulty === 'normal'} aria-pressed={view.difficulty === 'normal'} data-onboarding-difficulty="normal" onclick={() => command('setOnboardingDifficulty', 'normal')}>
                  <strong>Außendienst</strong><small>Ausgewogenes Verfahren.<br />Gelegentlicher Handlungsbedarf.</small>
                </button>
                <button type="button" class:active={view.difficulty === 'hard'} aria-pressed={view.difficulty === 'hard'} data-onboarding-difficulty="hard" onclick={() => command('setOnboardingDifficulty', 'hard')}>
                  <strong>Sonderlage</strong><small>Verdichtete Aktenlage.<br />Reaktionsfähigkeit vorausgesetzt.</small>
                </button>
              </div>
            </fieldset>

            <button class="primary-button" type="button" onclick={() => command('prepareOnboardingGuide')}>PARAMETER VERSIEGELN →</button>
          </section>
        {:else if view.guide}
          <section class="onboarding-step onboarding-guide step-enter">
            {#key view.guidePage}
              <div class="page-enter">
                <p class="section-label">{view.guide.kicker}</p>
                <h2 id="onboarding-guide-title">{view.guide.title}</h2>

                <div class="onboarding-guide-visuals" aria-hidden="true">
                  {#if view.guidePage === 0}
                    <div class="onboarding-guide-visual dossier">
                      <div class="onboarding-dossier-stamp"><strong>F-60</strong><span>NUR FÜR<br />FRANZ</span></div>
                      <span class="onboarding-dossier-line"></span><strong>FRANZ &amp; LOLA</strong>
                    </div>
                  {:else if view.guidePage === 1}
                    <div class="onboarding-guide-visual controls">
                      <div class="control-demo" aria-hidden="true">
                        <span class="control-demo-route"></span><span class="control-demo-dog">◆</span><span class="control-demo-touch"></span><span class="control-demo-arrow">→</span>
                      </div>
                      <div class="onboarding-guide-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>ODER WISCHEN</span></div>
                    </div>
                  {:else}
                    <div class="onboarding-guide-visual equipment">
                      <span><i>◆</i><small>GUTTI</small></span><span><i>✦</i><small>SCHNÜFFEL-POWER</small></span><span><i>▲</i><small>KATZEN-RADAR</small></span>
                    </div>
                  {/if}
                </div>

                <p class="onboarding-copy">{view.guide.copy}</p>
                <ul class="onboarding-guide-points">
                  {#each view.guide.points as point}<li>{point}</li>{/each}
                </ul>
              </div>
            {/key}

            <div class="onboarding-guide-position" aria-label={`Einweisung, Seite ${view.guidePage + 1} von ${view.guidePages}`}>
              {#each Array(view.guidePages) as _, index}
                <span class:active={index === view.guidePage} class:done={index < view.guidePage}></span>
              {/each}
            </div>
            <div class="onboarding-guide-actions">
              {#if view.guidePage > 0}<button class="secondary-button" type="button" onclick={() => command('moveOnboardingGuide', -1)}>← {view.language === 'dialect' ? 'ZRUCK' : 'ZURÜCK'}</button>{/if}
              {#if view.guidePage < view.guidePages - 1}
                <button bind:this={guideFocus} class="primary-button" type="button" onclick={() => command('moveOnboardingGuide', 1)}>{view.guide.next ?? 'WEITER →'}</button>
              {:else}
                <button bind:this={guideFocus} class="primary-button" type="button" id="onboarding-finish" onclick={() => command('finishOnboarding')}>{view.guide.finish ?? 'VORGANG 60 STARTEN →'}</button>
              {/if}
            </div>
            <p class="onboarding-fine-print">{view.guide.finePrint}</p>
          </section>
        {/if}
      {/key}
    </div>
  </div>
{/if}
