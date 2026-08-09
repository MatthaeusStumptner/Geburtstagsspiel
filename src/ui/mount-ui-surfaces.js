import { mount } from 'svelte';
import BoardHud from './components/BoardHud.svelte';
import GameOverlay from './components/GameOverlay.svelte';
import LevelOverlays from './components/LevelOverlays.svelte';
import LocationRibbon from './components/LocationRibbon.svelte';
import MapScreen from './components/MapScreen.svelte';
import SceneTransition from './components/SceneTransition.svelte';
import SidePanel from './components/SidePanel.svelte';
import TopHud from './components/TopHud.svelte';
import Surface from './Surface.svelte';

const SURFACES = [
  ['#svelte-top-hud', TopHud, 'hud'],
  ['#svelte-board-hud', BoardHud, 'hud'],
  ['#svelte-location-ribbon', LocationRibbon, 'hud'],
  ['#svelte-side-panel', SidePanel, 'hud'],
  ['#svelte-map-screen', MapScreen, 'map'],
  ['#svelte-game-overlay', GameOverlay, 'overlay'],
  ['#svelte-level-overlays', LevelOverlays, 'levelOverlays'],
  ['#svelte-scene-transition', SceneTransition, 'sceneTransition'],
];

export function mountUiSurfaces(session) {
  return SURFACES.map(([selector, component, section]) => {
    const target = document.querySelector(selector);
    if (!target) throw new Error(`Missing UI surface: ${selector}`);
    return mount(Surface, {
      target,
      props: { session, section, component },
    });
  });
}
