<script>
  import { VISUAL_EFFECT_TYPES } from '@franz-lola/pixel-renderer';
  let { effects = [], title = 'Visuelle Effekte', onchange = () => {} } = $props();
  const names = { glitch: 'Glitch', neon: 'Neon-Schein', hologram: 'Hologramm', echo: 'Echo / Spur', sparkle: 'Funkeln' };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function change(next) { onchange(clone(next)); }
  function add() {
    if (effects.length >= 4) return;
    const type = VISUAL_EFFECT_TYPES.find((entry) => !effects.some((effect) => effect.type === entry)) ?? 'glitch';
    change([...effects, { id: `${type}-${effects.length + 1}`, type, intensity: 0.55, speed: 1, color: type === 'neon' ? '#55d9dd' : '#ff4f87' }]);
  }
  function update(index, path, value) { const next = clone(effects); next[index][path] = value; if (path === 'type') next[index].id = `${value}-${index + 1}`; change(next); }
  function remove(index) { change(effects.filter((_, entry) => entry !== index)); }
</script>

<section class="effect-editor" aria-label={title}>
  <header><div><strong>{title}</strong><small>Bis zu vier Effekte kombinieren · Canvas2D, mobil kompatibel</small></div><button onclick={add} disabled={effects.length >= 4}>＋ Effekt</button></header>
  {#if !effects.length}<p>Kein Effekt. Das Element wird unverändert gezeichnet.</p>{/if}
  {#each effects as effect, index}
    <div class="effect-card" data-effect-type={effect.type}>
      <div class="effect-card-title"><span>{effect.type === 'glitch' ? '⌁' : effect.type === 'neon' ? '✦' : effect.type === 'hologram' ? '▤' : effect.type === 'echo' ? '◌' : '⁕'}</span><select aria-label={`Effekt ${index + 1}`} value={effect.type} onchange={(event) => update(index, 'type', event.currentTarget.value)}>{#each VISUAL_EFFECT_TYPES as type}<option value={type}>{names[type]}</option>{/each}</select><button aria-label={`Effekt ${index + 1} entfernen`} onclick={() => remove(index)}>×</button></div>
      <div class="effect-fields"><label>Stärke<input aria-label={`Effekt ${index + 1} Stärke`} type="range" min="0.05" max="1" step="0.05" value={effect.intensity} oninput={(event) => update(index, 'intensity', Number(event.currentTarget.value))} /><output>{Math.round(effect.intensity * 100)}%</output></label><label>Tempo<input aria-label={`Effekt ${index + 1} Tempo`} type="range" min="0.1" max="8" step="0.1" value={effect.speed} oninput={(event) => update(index, 'speed', Number(event.currentTarget.value))} /><output>{effect.speed.toFixed(1)}×</output></label><label>Farbe<input aria-label={`Effekt ${index + 1} Farbe`} type="color" value={effect.color} oninput={(event) => update(index, 'color', event.currentTarget.value)} /></label></div>
    </div>
  {/each}
</section>
