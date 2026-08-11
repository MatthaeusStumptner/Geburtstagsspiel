<script>
  import { onMount } from 'svelte';
  import { getPublisherClient } from '../publisher-client.js';

  let { studio } = $props();
  const publisher = getPublisherClient();
  let state = $state(publisher.configured ? 'login' : 'unavailable');
  let user = $state.raw(null);
  let publication = $state.raw(null);
  let error = $state('');
  let selectedKeys = $state([]);
  let selectionInitialized = false;
  let polling = null;
  let clock = null;
  let publicationId = $state(0);
  let pollFailures = 0;
  let startedAt = 0;
  let elapsed = $state(0);
  let activity = $state([]);
  let resolvingConflict = $state('');
  let candidates = $derived.by(() => { studio.revision; return studio.publishCandidates(); });
  let selectedCandidates = $derived(candidates.filter((entry) => selectedKeys.includes(entry.key)));
  let candidateGroups = $derived(['level', 'character', 'object', 'tileset', 'block', 'animation', 'cutscene']
    .map((type) => ({ type, label: candidates.find((entry) => entry.type === type)?.typeLabel, items: candidates.filter((entry) => entry.type === type) }))
    .filter((group) => group.items.length));
  let levelConflict = $derived(studio.cloudStatus === 'conflict' && studio.hasCloudConflict());
  let selectionValid = $derived(selectedCandidates.length > 0
    && selectedCandidates.every((entry) => entry.validation.ok)
    && !selectedCandidates.some((entry) => entry.type === 'level' && studio.hasCloudConflict(entry.id)));

  const steps = [
    ['transfer', 'Sicher übertragen'],
    ['validation', 'Tests & Levelprüfung'],
    ['merge', 'Ins Spiel übernehmen'],
    ['deploy', 'GitHub Pages bauen'],
    ['published', 'Live geschaltet'],
  ];

  function phaseIndex(phase = '') {
    if (phase === 'published') return 4;
    if (phase.startsWith('deploy')) return 3;
    if (phase === 'validation-merge' || phase === 'validation-dispatch') return 2;
    if (phase.startsWith('validation')) return 1;
    return 0;
  }
  function setPublication(next) {
    const previousPhase = publication?.phase;
    publication = { ...publication, ...next };
    if (next.phase && next.phase !== previousPhase) activity = [{ phase: next.phase, label: next.phaseLabel || next.detail, at: new Date() }, ...activity].slice(0, 8);
  }
  function login() {
    const url = publisher.loginUrl(window.location.href);
    if (url) window.location.assign(url);
  }
  async function identify() {
    if (!publisher.authenticated) return;
    state = 'loading'; error = '';
    try {
      user = await publisher.me();
      if (studio.cloudUser?.login !== user.login || studio.cloudStatus === 'offline') await studio.enableCloudDrafts(publisher, user);
      state = 'review';
    }
    catch (reason) { error = reason.message; state = 'login'; }
  }
  async function poll(id) {
    clearTimeout(polling); publicationId = id;
    try {
      const next = await publisher.publication(id); pollFailures = 0; error = ''; setPublication(next);
      state = next.state === 'published' ? 'published' : next.state === 'failed' ? 'failed' : 'progress';
      if (state === 'progress') polling = setTimeout(() => poll(id), 1800);
    } catch (reason) {
      pollFailures += 1; error = `Statusabfrage ${pollFailures}/4 fehlgeschlagen: ${reason.message}`;
      if (pollFailures < 4) { setPublication({ phaseLabel: 'Verbindung wird wiederhergestellt', detail: 'Der GitHub-Workflow läuft weiter. Die Werkstatt versucht die Statusabfrage automatisch erneut.' }); polling = setTimeout(() => poll(id), 2500); }
      else state = 'failed';
    }
  }
  async function publish() {
    if (!selectionValid) { studio.notify('Bitte mindestens einen gültigen Inhalt auswählen'); return; }
    state = 'progress'; error = ''; activity = []; startedAt = Date.now(); elapsed = 0;
    setPublication({ state: 'testing', phase: 'preparing', phaseLabel: 'Veröffentlichung vorbereiten', progress: 4, detail: 'Die ausgewählten Entwürfe werden lokal gesammelt und für die sichere Übertragung vorbereitet.' });
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      setPublication({ phase: 'uploading', phaseLabel: 'Inhalte verschlüsselt übertragen', progress: 12, detail: `${selectedCandidates.length === 1 ? 'Der Inhalt wird' : `${selectedCandidates.length} Inhalte werden`} an den sicheren Cloudflare Publisher übertragen.` });
      const references = await studio.prepareCloudPublication(selectedCandidates);
      const result = await publisher.publishContent(references);
      setPublication(result); publicationId = Number(result.publicationId); await poll(publicationId);
    } catch (reason) { error = reason.message; state = 'failed'; }
  }
  function toggleCandidate(key, checked) { selectedKeys = checked ? [...new Set([...selectedKeys, key])] : selectedKeys.filter((entry) => entry !== key); }
  function selectAllValid() { selectedKeys = candidates.filter((entry) => entry.validation.ok).map((entry) => entry.key); }
  function clearSelection() { selectedKeys = []; }
  function logout() { publisher.clearSession(); studio.disableCloudDrafts(); user = null; publication = null; publicationId = 0; state = 'login'; }
  async function resolveConflict(strategy) {
    resolvingConflict = strategy; error = '';
    try { await studio.resolveCloudConflict(strategy); }
    catch (reason) { error = reason.message; }
    finally { resolvingConflict = ''; }
  }

  onMount(() => {
    publisher.consumeSessionFromLocation();
    if (studio.cloudUser && publisher.authenticated) { user = studio.cloudUser; state = 'review'; }
    else if (publisher.authenticated) identify();
    clock = setInterval(() => { if (startedAt && state === 'progress') elapsed = Math.floor((Date.now() - startedAt) / 1000); }, 1000);
    return () => { clearTimeout(polling); clearInterval(clock); };
  });

  $effect(() => {
    const available = new Set(candidates.map((entry) => entry.key));
    const retained = selectedKeys.filter((key) => available.has(key));
    if (!selectionInitialized) {
      const currentKey = `level:${studio.level.id}`;
      selectedKeys = candidates.some((entry) => entry.key === currentKey && entry.validation.ok) ? [currentKey] : [];
      selectionInitialized = true;
    } else if (retained.length !== selectedKeys.length) selectedKeys = retained;
  });
</script>

<section class="workspace publish-workspace" aria-labelledby="publish-workspace-title">
  <header class="workspace-header">
    <div><span class="eyebrow">EIN KLICK · AUTOMATISCH GEPRÜFT</span><h2 id="publish-workspace-title">Veröffentlichen</h2><p>Hier wählst du Level, Figuren, Objekte und weitere Inhalte getrennt aus. Sie werden gemeinsam geprüft und als statische Spieldaten auf GitHub Pages veröffentlicht.</p></div>
    {#if user}<div class="publisher-user"><span>{user.avatarUrl ? '●' : 'GH'}</span><div><strong>{user.name || user.login}</strong><small>GitHub verbunden</small></div><button onclick={logout}>Abmelden</button></div>{/if}
  </header>

  <div class="publish-layout">
    <div class="publication-card">
      <div class="publication-level-icon">{studio.level.icon}</div>
      <div><span class="eyebrow">AKTUELLES LEVEL</span><h3>{studio.level.name.standard}</h3><p>{studio.level.id} · {studio.level.board.columns} × {studio.level.board.rows} Felder · {studio.pellets.size} Guttis</p></div>
      <div class:invalid={!studio.validation.ok} class="validation-pill">{studio.validation.ok ? '✓ Spielbar' : `⚠ ${studio.validation.errors.length} Fehler`}</div>
    </div>

    {#if state === 'unavailable'}
      <article class="publish-state warning-state"><span class="state-symbol">⚙</span><h3>Einmalige Einrichtung fehlt</h3><p>Die Editor-Version kennt noch keine Publisher-Adresse. Trage in GitHub unter <b>Settings → Secrets and variables → Actions → Variables</b> die Variable <code>PUBLISHER_URL</code> mit deiner <code>workers.dev</code>-Adresse ein und starte den Pages-Workflow erneut.</p><a href="https://github.com/MatthaeusStumptner/Pacman_clone_level_editor/settings/variables/actions" target="_blank" rel="noreferrer">GitHub-Variable öffnen →</a></article>
    {:else if state === 'login'}
      <article class="publish-state"><span class="state-symbol">GH</span><h3>Mit GitHub anmelden</h3><p>Die Anmeldung prüft, ob du veröffentlichen darfst. Private Schlüssel bleiben ausschließlich im Cloudflare Worker.</p>{#if error}<p class="error-copy">{error}</p>{/if}<button class="primary large-action" id="publisher-login" onclick={login}>Sicher mit GitHub verbinden</button></article>
    {:else if state === 'loading'}
      <article class="publish-state"><span class="loader"></span><h3>Berechtigung wird geprüft</h3><p>Einen kleinen Moment …</p></article>
    {:else if state === 'review'}
      <article class="publish-state review-state">
        <span class="state-symbol ok">✓</span><h3>Inhalte auswählen</h3><p>Jeder Eintrag wird eigenständig versioniert. Ein Level enthält zusätzlich vollständige Snapshots seiner verwendeten Figuren und Objekte.</p>
        {#if levelConflict}
          <section class="cloud-conflict-resolver" aria-labelledby="cloud-conflict-title">
            <span>⚠</span><div><h4 id="cloud-conflict-title">Zwei Fassungen von „{studio.level.name.standard}“</h4><p>Auf diesem Gerät liegt eine andere Fassung als in der gemeinsamen Cloud. Nichts wird automatisch überschrieben.</p></div>
            <div class="cloud-conflict-choices">
              <button disabled={Boolean(resolvingConflict)} onclick={() => resolveConflict('remote')}><b>{resolvingConflict === 'remote' ? 'Wird geladen …' : 'Gemeinsamen Stand laden'}</b><small>Deine lokale Fassung bleibt automatisch als Sicherung erhalten.</small></button>
              <button class="primary" disabled={Boolean(resolvingConflict)} onclick={() => resolveConflict('local')}><b>{resolvingConflict === 'local' ? 'Wird übertragen …' : 'Meine Fassung verwenden'}</b><small>Speichert diese Fassung als neue gemeinsame Revision.</small></button>
            </div>
            {#if error}<p class="error-copy">{error}</p>{/if}
          </section>
        {/if}
        <div class="publish-selection">
          <div class="publish-selection-toolbar"><strong>{selectedCandidates.length} von {candidates.length} ausgewählt</strong><div><button onclick={selectAllValid}>Alle gültigen</button><button onclick={clearSelection}>Auswahl aufheben</button></div></div>
          {#each candidateGroups as group}
            <h4 class="publish-type-heading"><span>{group.label}</span><small>{group.items.length}</small></h4>
            {#each group.items as candidate}
              <label class="publish-candidate" data-content-type={candidate.type} data-content-key={candidate.key}>
                <input type="checkbox" aria-label={`${candidate.typeLabel} ${candidate.name} auswählen`} checked={selectedKeys.includes(candidate.key)} onchange={(event) => toggleCandidate(candidate.key, event.currentTarget.checked)} />
                <span>{candidate.icon}</span>
                <div><strong>{candidate.name}{candidate.current ? ' · geöffnet' : ''}</strong><small>{candidate.typeLabel} · {candidate.id} · {candidate.detail}{candidate.savedAt ? ` · ${new Date(candidate.savedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</small></div>
                <em class:invalid={!candidate.validation.ok}>{candidate.validation.ok ? '✓ gültig' : `⚠ ${candidate.validation.errors.length}`}</em>
              </label>
            {/each}
          {/each}
        </div>
        {#if selectedCandidates.some((entry) => !entry.validation.ok)}<p class="error-copy">Mindestens ein ausgewählter Inhalt enthält Fehler. Entferne ihn aus der Auswahl oder korrigiere ihn zuerst.</p>{/if}
        {#if levelConflict}<p class="error-copy">Löse zuerst den Cloud-Konflikt. Danach kann die Veröffentlichung ohne Datenverlust fortgesetzt werden.</p>{/if}
        <div class="review-facts"><span><b>{selectedCandidates.filter((entry) => entry.type === 'level').length}</b>Level</span><span><b>{selectedCandidates.filter((entry) => ['character', 'object', 'tileset', 'block'].includes(entry.type)).length}</b>Bausteine</span><span><b>{selectedCandidates.filter((entry) => ['animation', 'cutscene'].includes(entry.type)).length}</b>Abläufe</span></div>
        <button class="primary large-action" id="publisher-confirm" disabled={!selectionValid} onclick={publish}>{selectedCandidates.length === 1 ? `1 ${selectedCandidates[0]?.typeLabel ?? 'Inhalt'} veröffentlichen` : `${selectedCandidates.length} Inhalte gemeinsam veröffentlichen`}</button>
      </article>
    {:else}
      <article class="publish-state progress-state" data-state={publication?.state || state} data-phase={publication?.phase || ''}>
        <span class:failed={state === 'failed'} class:ok={state === 'published'} class:spinning={state === 'progress'} class="state-symbol">{state === 'published' ? '✓' : state === 'failed' ? '!' : '↻'}</span>
        <h3>{state === 'published' ? `${selectedCandidates.length === 1 ? 'Inhalt ist' : 'Inhalte sind'} live!` : state === 'failed' ? 'Veröffentlichung gestoppt' : publication?.phaseLabel || 'Veröffentlichung läuft'}</h3>
        <p>{state === 'failed' ? error || publication?.detail : publication?.detail || error || 'Die automatischen Schritte laufen im Hintergrund.'}</p>
        <div class="publish-progress" role="progressbar" aria-label="Veröffentlichungsfortschritt" aria-valuemin="0" aria-valuemax="100" aria-valuenow={publication?.progress ?? 0}><span style:width={`${publication?.progress ?? 0}%`}></span></div>
        <div class="publish-live-facts"><span><b>{publication?.progress ?? 0}%</b>Fortschritt</span><span><b>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</b>vergangen</span><span><b>{publication?.checkedAt ? new Date(publication.checkedAt).toLocaleTimeString('de-DE') : 'jetzt'}</b>zuletzt geprüft</span></div>
        <div class="publication-steps">
          {#each steps as [id, label], index}
            <div class:done={state === 'published' || index < phaseIndex(publication?.phase)} class:active={index === phaseIndex(publication?.phase) && state !== 'failed'}><i>{state === 'published' || index < phaseIndex(publication?.phase) ? '✓' : index + 1}</i><span>{label}</span></div>
          {/each}
        </div>
        {#if activity.length}<div class="publish-activity" aria-label="Veröffentlichungsprotokoll"><strong>Was gerade passiert</strong>{#each activity as entry, index}<div class:current={index === 0}><time>{entry.at.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span>{entry.label}</span></div>{/each}</div>{/if}
        {#if error && state !== 'failed'}<p class="connection-note">{error}</p>{/if}
        <div class="publish-actions">
          {#if state === 'failed'}<button onclick={() => { state = 'review'; publication = null; error = ''; }}>Noch einmal prüfen</button>{/if}
          {#if state === 'progress' && publicationId}<button onclick={() => poll(publicationId)}>Jetzt Status prüfen</button>{/if}
          {#if publication?.actionsUrl || publication?.prUrl}<a href={publication.actionsUrl || publication.prUrl} target="_blank" rel="noreferrer">Technische Details</a>{/if}
          {#if state === 'published' && publication?.gameUrl}<a class="primary button-link" href={publication.gameUrl} target="_blank" rel="noreferrer">Im Spiel öffnen →</a>{/if}
        </div>
      </article>
    {/if}
  </div>
</section>
