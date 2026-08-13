# Render-Baseline

Stand: 11. August 2026 · Playwright Chromium 151.0.7922.34 Headless unter Windows · Node.js 24.19.0 · 300 Messframes nach 45 Warm-up-Frames.

Die Matrix wurde direkt mit `scripts/browser-regression.mjs` gemessen. Eine temporäre, anschließend bytegleich entfernte Option `--task-7-measure` rief für jede URL die vorhandene Funktion `runBenchmarkScenario()` mit `capture: true` auf; damit galten die echten späten Konsolen-, Crash- und WebGL-Kontextverlust-Prüfungen des kanonischen Harness. Viewport, CPU-Drosselung, Gerätespeicher und Kernzahl wurden pro Profil emuliert. Die Diagnosezähler sind kumulierte Werte nach insgesamt 345 Frames; Render-p95 enthält nur die 300 Messframes. Der frühere separate Task-Treiber ist nur eine Gegenmessung und bestimmt diese Werte nicht.

| Benchmark-URL | Umgebung / Profil / Qualität | Angefordert | Aufgelöst | Nativer Status / Fallbackgrund | Render p95 | Upload | Crop-Resizes | Textur-Neuanlagen | Budget |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `benchmark.html?backend=webgl2&profile=mobile&quality=balanced&frames=300` | 390×844 · CPU ×3 · 4 GB · 8 Kerne · `mobile` / `balanced` | WebGL 2 | WebGL 2 | nativ; kein Fallback | 6,2 ms | 234,6 MB | 1 | 3 | bestanden |
| `benchmark.html?backend=webgpu&profile=mobile&quality=balanced&frames=300` | 390×844 · CPU ×3 · 4 GB · 8 Kerne · `mobile` / `balanced` | WebGPU | WebGL 2 | Fallback; „WebGPU ist auf diesem Gerät nicht verfügbar.“ | 6,5 ms | 234,6 MB | 1 | 3 | bestanden |
| `benchmark.html?backend=canvas2d&profile=weak-mobile&quality=performance&frames=300` | 360×740 · CPU ×6 · 2 GB · 4 Kerne · `weak-mobile` / `performance` | Canvas2D | Canvas2D | nativ; kein Fallback | 9,2 ms | 0 MB | 0 | 0 | bestanden |

Der WebGPU-Eintrag ist bewusst kein Nachweis für natives WebGPU: `navigator.gpu` war im Headless-Browser vorhanden, aber es stand kein Adapter zur Verfügung. Der öffentliche Diagnosevertrag ist deshalb immer das Tripel aus angefordertem Backend, aufgelöstem Backend und `fallbackReason`; die bloße API-Sichtbarkeit genügt nicht.

## Auditierbarer kanonischer Messlauf

Der Lauf verwendete diese temporäre Parametrisierung des kanonischen Scripts: CLI-Flag `--task-7-measure`, die drei URLs aus der Tabelle, pro Szenario `capture: true` sowie CPU-, Speicher-, Kern- und Viewportwerte aus der jeweiligen Tabellenzeile. Die Option verzweigte unmittelbar nach dem Start des Headless-Browsers, führte dreimal `runBenchmarkScenario()` aus und übersprang nur die nicht zu Task 7 gehörenden Standardszenarien. Wiederholung im Mess-Workspace:

```powershell
git apply --check output/playwright/renderer/task-7-browser-regression.patch
git apply output/playwright/renderer/task-7-browser-regression.patch
node scripts/browser-regression.mjs --task-7-measure
git apply -R output/playwright/renderer/task-7-browser-regression.patch
git diff --exit-code -- scripts/browser-regression.mjs
```

Identitäten des Referenzlaufs:

- kanonisches Script vor und nach dem Lauf: SHA-256 `0A7113DEE8E70C99536132112C23874FE7FEB999A7F48CDF10C05DBE0D193731`
- temporär instrumentiertes Script: SHA-256 `D5187D064BD7B52E33CD0E4144356B85B4C547EB50A0A0714BDFE187F545FA0C`
- Patch `output/playwright/renderer/task-7-browser-regression.patch`: SHA-256 `3F5D97073C909F7F5E2EFDABDCFDBBCD4CF9693CAC816AD02D3D599D97D62CFE`
- Ergebnis `output/playwright/renderer/result-2026-08-11T00-50-57-477Z-46276.json`: SHA-256 `78E7D7E57D6D4E44E26F4957492FC3BFD427196D20243BEFC80F085CDA8DBCC5`
- sechs PNG-/WebM-Artefakte tragen dieselbe Run-ID `2026-08-11T00-50-57-477Z-46276`; ihre Namen und Pfade stehen im Ergebnis-JSON

Die temporäre Änderung blieb uncommitted; der Vorher-/Nachher-Hash war identisch und `git diff --exit-code -- scripts/browser-regression.mjs` endete mit Exitcode 0.

## Einmaliger Startaufwand

Die transaktionale Auswahl initialisiert einen GPU-Kandidaten zuerst auf einem 1×1-Scratch-Canvas, zerstört dessen Ressourcen und initialisiert danach den sichtbaren Canvas. Dieser Schutz erzeugt einmalig eine zusätzliche Backend-Vorbereitung, aber keine zusätzliche Arbeit pro Frame.

Ein Chrome-DevTools-Browserlauf auf dem Profil `mobile` (390×844, CPU ×3, 4 GB, 8 Kerne) verglich `createWebGL2Backend()` direkt mit `createPresentationBackend({ backend: 'webgl2' })`. Nach zwei Warm-up-Paaren wurden acht Paare in wechselnder Reihenfolge mit `performance.now()` gemessen und jeder Kontext anschließend über `WEBGL_lose_context` freigegeben:

- direkte Initialisierung: Median 8,0 ms und ein WebGL2-Kontext
- transaktionale Initialisierung: Median 15,8 ms und zwei WebGL2-Kontexte
- Proxy für den einmaligen Scratch-Aufwand: 7,8 ms

Der Proxy umfasst die zusätzliche Backend-Erzeugung einschließlich Shader-Kompilierung in diesem Browserlauf. Er ist weder eine Core-Web-Vital noch Teil des eingeschwungenen Render-p95 in der Matrix.

## Start-/LCP-Trace

Ein Chrome-DevTools-Performance-Trace mit Reload derselben WebGL2-URL und demselben `mobile`-Profil meldete LCP 94 ms (TTFB 6 ms, Renderverzögerung 88 ms) und CLS 0,0542. Das LCP-Element war die lokale H1-Überschrift; CrUX-Felddaten waren für die lokale Seite nicht verfügbar. Der Trace wies außerdem eine maximale lokale kritische Request-Kette von 166 ms aus. FCP, INP und TBT wurden in diesem Trace nicht ausgewiesen und werden daher nicht abgeleitet.

Vollständige 300-Frame-Matrix inklusive WebGPU-Diagnosepfad erneut messen:

```bash
npm run benchmark -- --frames=300 --webgpu
```

Browserregressionen und ihre Screenshots/Videos prüfen:

```bash
npm run test:browser
```
