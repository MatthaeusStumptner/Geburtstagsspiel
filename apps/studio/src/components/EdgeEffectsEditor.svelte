<script>
  import { EDGE_EFFECT_TYPES } from '@franz-lola/pixel-renderer';
  let { effects = [], onchange = () => {} } = $props();
  const names = { 'water-flow': 'Fließendes Wasser', fish: 'Springende Fische', boat: 'Vorbeifahrendes Boot', leaves: 'Treibende Blätter', fireflies: 'Glühwürmchen', mist: 'Nebel', 'city-lights': 'Stadtlichter', birds: 'Vögel', steam: 'Dampf', sparks: 'Funken', 'stage-pulse': 'Bühnenpuls' };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function change(next) { onchange(clone(next)); }
  function add() { if (effects.length < 16) change([...effects, { id: `rand-${effects.length + 1}`, type: 'water-flow', side: 'both', speed: 1, intensity: 0.55, count: 5, color: '#2379a3', accent: '#f5c451' }]); }
  function update(index, key, value) { const next = clone(effects); next[index][key] = value; if (key === 'type') next[index].id = `${value}-${index + 1}`; change(next); }
</script>

<section class="edge-effect-editor" aria-label="Animierte Levelränder">
  <header><div><strong>Animierte Levelränder</strong><small>Wasser, Natur, Stadt, Industrie oder Bühne</small></div><button onclick={add}>＋ Rand-Effekt</button></header>
  {#if !effects.length}<p>Noch keine Randanimation. Füge Wasser, Fische, ein Boot oder atmosphärische Partikel hinzu.</p>{/if}
  {#each effects as effect, index}
    <div class="edge-effect-card" data-edge-effect={effect.type}>
      <div><select aria-label={`Rand-Effekt ${index + 1}`} value={effect.type} onchange={(event) => update(index, 'type', event.currentTarget.value)}>{#each EDGE_EFFECT_TYPES as type}<option value={type}>{names[type]}</option>{/each}</select><button aria-label={`Rand-Effekt ${index + 1} entfernen`} onclick={() => change(effects.filter((_, entry) => entry !== index))}>×</button></div>
      <div class="field-row"><label>Seite<select value={effect.side} onchange={(event) => update(index, 'side', event.currentTarget.value)}><option value="left">Links</option><option value="right">Rechts</option><option value="both">Beide</option></select></label><label>Anzahl<input type="number" min="1" max="16" value={effect.count} onchange={(event) => update(index, 'count', Number(event.currentTarget.value))} /></label></div>
      <div class="field-row"><label>Tempo<input aria-label={`Rand-Effekt ${index + 1} Tempo`} type="number" min="0.1" max="8" step="0.1" value={effect.speed} onchange={(event) => update(index, 'speed', Number(event.currentTarget.value))} /></label><label>Stärke<input aria-label={`Rand-Effekt ${index + 1} Stärke`} type="number" min="0.05" max="1" step="0.05" value={effect.intensity} onchange={(event) => update(index, 'intensity', Number(event.currentTarget.value))} /></label></div>
      <div class="field-row"><label>Farbe<input aria-label={`Rand-Effekt ${index + 1} Farbe`} type="color" value={effect.color} oninput={(event) => update(index, 'color', event.currentTarget.value)} /></label><label>Akzent<input aria-label={`Rand-Effekt ${index + 1} Akzent`} type="color" value={effect.accent} oninput={(event) => update(index, 'accent', event.currentTarget.value)} /></label></div>
    </div>
  {/each}
</section>
