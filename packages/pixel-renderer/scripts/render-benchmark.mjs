import { chromium } from 'playwright';
import { createServer } from 'vite';
import { selectBenchmarkAssertions } from './benchmark-assertion.js';

const shouldAssert = process.argv.includes('--assert');
const includeWebGPU = process.argv.includes('--webgpu');
const autoOnly = process.argv.includes('--auto-only');
const framesArgument = process.argv.find((value) => value.startsWith('--frames='));
const frames = Number(framesArgument?.split('=')[1]) || 180;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const address = server.httpServer.address();
const port = typeof address === 'object' ? address.port : 5173;
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  const scenarios = [
    { profile: 'notebook', viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, cpuRate: 2, memory: 8, cores: 8 },
    { profile: 'tablet', viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, cpuRate: 2, memory: 8, cores: 8 },
    { profile: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, cpuRate: 3, memory: 4, cores: 8 },
    { profile: 'weak-mobile', viewport: { width: 360, height: 740 }, deviceScaleFactor: 1, cpuRate: 6, memory: 2, cores: 4 },
  ];
  const backends = autoOnly ? ['auto'] : includeWebGPU ? ['canvas2d', 'webgl2', 'webgpu', 'auto'] : ['canvas2d', 'webgl2', 'auto'];
  const scenes = ['gameplay', 'cutscene'];
  for (const scenario of scenarios) {
    for (const backend of backends) {
      for (const scene of scenes) {
        const context = await browser.newContext({ viewport: scenario.viewport, deviceScaleFactor: scenario.deviceScaleFactor });
        await context.addInitScript(({ memory, cores }) => {
          Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => memory });
          Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { configurable: true, get: () => cores });
        }, { memory: scenario.memory, cores: scenario.cores });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: scenario.cpuRate });
        const url = `http://127.0.0.1:${port}/benchmark.html?backend=${backend}&profile=${scenario.profile}&quality=auto&scene=${scene}&frames=${frames}`;
        await page.goto(url, { waitUntil: 'networkidle' });
        const result = await page.evaluate(() => window.__RENDER_BENCHMARK__);
        results.push({ ...result, cpuThrottling: scenario.cpuRate, deviceMemory: scenario.memory, hardwareConcurrency: scenario.cores, viewport: scenario.viewport });
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}

const assertion = selectBenchmarkAssertions(results);
process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), results, assertion }, null, 2)}\n`);
if (shouldAssert && !assertion.passed) process.exitCode = 1;
