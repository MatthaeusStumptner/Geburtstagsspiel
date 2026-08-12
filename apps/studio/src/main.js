import { mount } from 'svelte';
import { createRenderCoordinator } from '@franz-lola/render-coordinator';
import App from './App.svelte';
import './style.css';

const renderCoordinator = createRenderCoordinator({
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
});

mount(App, { target: document.querySelector('#app'), props: { renderCoordinator } });