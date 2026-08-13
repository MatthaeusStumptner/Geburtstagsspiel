import { mount } from 'svelte';
import { createRenderCoordinator } from '@franz-lola/render-coordinator';
import App from './App.svelte';
import './style.css';
import { studioRenderDiagnostics } from './render/studio-render-diagnostics.js';

const renderCoordinator = createRenderCoordinator({
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
});

mount(App, { target: document.querySelector('#app'), props: { renderCoordinator } });

if (import.meta.env.DEV) {
  window.__FRANZ_LOLA_STUDIO_RENDER_DEBUG__ = () => ({
    ...studioRenderDiagnostics(),
    coordinator: JSON.parse(JSON.stringify(renderCoordinator.snapshot())),
  });
}