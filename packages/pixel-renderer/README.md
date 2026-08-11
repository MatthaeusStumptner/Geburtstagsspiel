# Franz & Lola Pixel Renderer

Gemeinsamer, frameworkfreier Canvas-Renderer und Simulationskern für Spiel und Levelwerkstatt. Das Paket enthält das versionierte Zwischenformat, Normalisierung, Validierung, Wegerreichbarkeit, Kamera-Projektion, Pixel-Art-Painter und die bildfrequenzunabhängige Maze-Chase-Simulation.

Eigene, nicht feindliche Figuren leben getrennt von Katzen unter `actors.characters`. Sie besitzen stabile IDs, eine wiederverwendbare `characterId`, Namen, Player States, Sprite-Animationen, Effekte und Cutscene-Ziele wie `character:passauer-postler`. Der Renderer zeichnet sie in normalen Levels und in gesampelten Cutscenes, ohne sie als Gegner oder Schwierigkeitsfaktor zu zählen.

```js
import { PassauPixelRenderer, parseLevelDocument } from '@franz-lola/pixel-renderer';

const renderer = new PassauPixelRenderer(document.querySelector('canvas'));
const result = parseLevelDocument(json);
if (result.ok) renderer.setLevel(result.value);
renderer.render({ level: result.value, player, cats, pellets, powerUps, elapsed });
```

## Level-Format v1

Ein Level ist reines JSON mit `kind: "franz-lola-level"` und `schemaVersion: 1`. Unterstützt werden:

- lokalisierte Namen, Missionen und Beschreibungen
- Passau-Koordinaten und Gebietsangaben
- freie Rastergröße, Tunnelzeilen und einzeln adressierbare Wandsegmente mit eigener Farbe, Muster, Deckkraft und Effektstapel
- Landmarken und vollständige Farbpaletten
- Franz & Lola, beliebig viele Katzen und Power-ups mit stabilen, eindeutigen Actor-IDs
- optionale Pixel-Sprites mit Palette, benannten Animationen und zeitbasierten Keyframes samt Dauer, Easing, Playback und Loop-Modus; das ältere FPS-/Frame-Format bleibt lesbar
- explizite Spielerzustände `idle`, `up`, `right`, `down` und `left`, die frei auf Sprite-Animationen abgebildet werden
- frei konfigurierbares Spieler- und Katzenverhalten (Steuerung, Jagdstrategie, Ziel, Tempo, Voraussicht und Zufall)
- Dekorationen wie Bäume, Bänke, Lampen, Schilder, Wasser oder freie Symbole mit Schwebe-, Puls-, Blink-, Dreh- und frei definierbarer Transform-Keyframe-Bewegung
- stapelbare Canvas2D-Effekte (`glitch`, `neon`, `hologram`, `echo`, `sparkle`) für Figuren, Objekte und Ereignissymbole
- animierbare Levelränder mit Wasserströmung, springenden Fischen, Booten, Blättern, Glühwürmchen, Nebel, Stadtlichtern, Vögeln, Dampf, Funken und Bühnenpuls
- stufenlos positionier- und skalierbare zweisprachige Textblöcke mit Größe, Ausrichtung, optional transparentem Hintergrund oder Rahmen und eigener Animation
- frei definierbare Ereignisse mit Triggerzonen, Richtungsfolgen oder Zeitpunkten, lokalisierten Standard-/Dialekttexten, Belohnungen und Sichtbarkeitsregeln
- eingebaute Pixel-Ereignissymbole für Eisvogel, Pfote und Kirchenglocke sowie beliebige Sprite-Objekte aus der gemeinsamen Bibliothek
- levelgebundene Intro-, Übergangs- und Outro-Cutscenes mit Kamera-, Figuren-, Objekt- und Dialogspuren
- Gutti-Seed, Zielwerte und vollständige Physikprofile pro Schwierigkeit
- optionale Herkunftsmetadaten für Kataloge

Das maschinenlesbare Schema liegt unter `schema/franz-lola-level.schema.json` und wird mit dem Paket ausgeliefert. `validateLevelDocument()` ergänzt semantische Prüfungen, die JSON Schema allein nicht abbildet: Erreichbarkeit, Objekte in Wänden, zu kleine begehbare Flächen und überstehende Elemente.

## Renderer-Vertrag

`render(snapshot, options)` arbeitet unabhängig von der Bildfrequenz und kann interpolierte Actor-Snapshots anzeigen. `cameraEnabled: false` verwendet eine unverzerrte Contain-/Letterbox-Projektion für Editoren; die Spielkamera folgt bei aktivierter Kamera dem Spieler. Neue immutable Levelobjekte werden auch bei gleicher ID zuverlässig übernommen.

Der Aufrufer übergibt beobachtete Anzeigegrößen explizit, damit `render()` keine Layoutmessung auslösen muss. `sceneChanged` kennzeichnet, ob die Pixelwelt seit dem letzten präsentierten Frame neu auf die GPU geladen werden muss:

```js
renderer.resize({ width: 412, height: 712, devicePixelRatio: 2.625, reason: 'resize-observer' });
renderer.render(snapshot, { viewport: { x: 0, y: 0, width: 412, height: 712 }, sceneChanged: true });
```

Statische Aufrufer übergeben `sceneChanged: false`; der ältere Aufruf ohne Option bleibt kompatibel und gilt als geändert. Ein fraktionaler Device-Pixel-Ratio oder ein durch das Qualitätsprofil heruntergerechneter Pixel-Ratio deaktiviert Scanlines, damit beim Resampling kein Moiré entsteht.

### Canvas2D, WebGL 2 und WebGPU

Die Spiellogik und die Pixelwelt bleiben deterministisch in Canvas2D. Eine getrennte Präsentationsschicht kann das fertige Bild anschließend mit WebGL 2 (GLSL ES) oder WebGPU (WGSL) verarbeiten. Dadurch bleiben Level-JSON, Kollisionen, Editor und GitHub-Pages-Deployment unverändert statisch; nur Licht, Atmosphäre und Bildschirm-Feedback laufen optional auf der GPU.

`backend: 'auto'` ist der produktive Standard. Notebooks, Tablets und moderne Handys bleiben GPU-berechtigt. GPU-Kandidaten werden zunächst transaktional auf einem separaten Canvas vorbereitet; erst nach erfolgreicher Initialisierung wird derselbe Backendtyp am sichtbaren Canvas aufgebaut. Nicht verfügbare APIs und Shaderfehler fallen kontrolliert auf den nächsten Kandidaten bis hin zu Canvas2D zurück. Nur das klar eingeschränkte `performance`-Profil verwendet ein strenges Gate. `quality: 'auto'` begrenzt zusätzlich interne Auflösung und Device-Pixel-Ratio anhand von Speicher und CPU-Kernen.

Die Pixelwelt wird auf GPU-Backends in nativer Auflösung übertragen und kameraabhängig zugeschnitten. Der Crop-Puffer wächst in quantisierten Schritten und wird während Kamera- oder Cutscene-Zoom nicht wieder verkleinert; dadurch entfallen fortlaufende Canvas- und GPU-Textur-Neuanlagen. Die statische Umgebung bleibt gecacht, Pixel-Sprite-Frames werden einmal rasterisiert und wiederverwendet, und kontinuierliche Atmosphäre, Farbe sowie Bildschirm-Feedback übernimmt der Shader.

```js
const renderer = await PassauPixelRenderer.create(canvas, {
  backend: 'auto',
  preferWebGPU: true,
  quality: 'auto',
  powerPreference: 'high-performance',
});
```

Die Effektart wird aus `theme.edgeEffects` des Levels abgeleitet: Wasser erhält sanfte Strömung, Natur feine Lichtpunkte, Nebel atmosphärische Bewegung, Stadt und Industrie subtile Licht- beziehungsweise Hitzereize und die Zauberberg-Bühne einen chromatischen Bühnenpuls. Schnüffel-Power und Treffer bekommen kurzes Bildschirm-Feedback. `reducedMotion: true` stoppt die zeitbasierte Shaderbewegung, ohne Lesbarkeit oder Steuerung zu ändern. Texte und Editor-Markierungen werden nach dem Effekt scharf darübergelegt.

Für Diagnose und Vergleich können `canvas2d`, `webgl2` und `webgpu` explizit angefordert werden. Der tatsächlich verwendete Pfad steht in `renderer.rendererInfo().backend`; im Spiel ist er im Entwicklungsmodus zusätzlich über `?renderer=canvas2d`, `?renderer=webgl2` oder `?renderer=webgpu` wählbar. `rendererInfo()` liefert außerdem getrennte Szene-, Screen-Overlay- und Welt-Overlay-Uploadmengen, übersprungene Uploads, Textur-Neuanlagen und Crop-Resizes.

### Performance-Benchmark

Der Browser-Benchmark rendert ein absichtlich dichtes 25×25-Level und vergleicht Canvas2D, WebGL 2 und die produktive Automatik in vier Profilen: Notebook (CPU ×2), Tablet (CPU ×2), modernes Handy (CPU ×3) und schwaches Handy (CPU ×6). Speicher und Kernzahl werden dabei ebenfalls emuliert. Gemessen werden Render-p50/p95/p99, Frame-p95, effektive FPS, lange Frames, Long Tasks und GPU-Uploadvolumen. Nur die Automatik ist ein Release-Gate, weil explizite Backends bewusst auch langsame Softwareimplementierungen sichtbar machen sollen.

```bash
npm run benchmark
npm run benchmark:assert
npm run benchmark -- --auto-only --assert
npm run benchmark -- --frames=300 --webgpu
```

Die aktuellen Render-p95-Budgets liegen bei Notebook ≤ 14 ms, Tablet ≤ 20 ms, modernem Handy ≤ 24 ms und schwachem Handy ≤ 36 ms. Die jeweils automatisch gewählte Implementierung ist das Release-Gate.

Die reproduzierbare 300-Frame-Matrix, Backend-Auflösung, Upload- und Allokationszähler sowie der getrennte Einmalaufwand der transaktionalen GPU-Vorbereitung stehen in [`benchmark/BASELINE.md`](benchmark/BASELINE.md). Der Vorbereitungsaufwand gehört zum Start und wird nicht auf den Render-p95 der eingeschwungenen Frames aufgeschlagen.

`FixedStepLoop` und `LevelSimulation` sind der gemeinsame Gameplay-Vertrag. Die Simulation läuft mit festen 120 Updates pro Sekunde. `PresentationFramePacer` begrenzt davon unabhängig die teure Präsentation auf stabile 60 FPS beziehungsweise 30 FPS im `performance`-Profil. Displays mit 60, 120 oder 175 Hz zeigen damit denselben interpolierten Takt, ohne Spieltempo, Kollisionen oder Richtungswechsel zu verändern.

`DirectionalSwipeInput` und `queuePlayerDirection()` bilden außerdem den gemeinsamen Eingabevertrag für Spiel und Editor-Testlauf: Wischen reagiert während der Geste, Gegenrichtungen kehren sofort um und Abzweigungen werden bis zum nächsten gültigen Rasterzentrum gepuffert, ohne die Figur zu versetzen.

Umgebungsdetails sind Teil desselben Renderers. Die animierte Zauberberg-Bühne enthält nur noch die bauliche Kulisse und zwei transparente Lichtkegel. Beschriftungen und Musiknoten sind normale, frei verschiebbare und löschbare Levelobjekte; dasselbe gilt für Ereignissymbole und die optional eingeblendeten Triggerzonen des Editors.

Textblöcke werden mit Pretext Unicode-sicher vorbereitet und vermessen. Statische Texte liegen in einer hochauflösenden Welt-Textur, die nur bei Inhalt-, Level- oder Sprachänderungen neu gerastert und hochgeladen wird. Animierte Texte und Editor-Markierungen bleiben in der endgültigen Kameraauflösung. So bleiben beide Pfade auf Retina-Displays und bei Kamerazoom scharf, ohne pro Frame ein vollständiges Bildschirm-Overlay zu übertragen.

`drawActorPreview()` rendert Franz & Lola oder eine Katze in beliebige Vorschaurahmen. Die Funktion verwendet exakt dieselben Custom-Sprites, Player States, Animationszeiten und Fallback-Painter wie `PassauPixelRenderer`; Editoren müssen daher keine zweite Figuren-Darstellung nachbauen.

```js
drawActorPreview(context, actor, { left: 0, top: 0, width: 96, height: 96 }, {
  kind: 'player', state: 'right', animationId: 'right', elapsed: 0.35,
});
```

```js
const simulation = new LevelSimulation(level, { difficulty: 'normal', pellets });
const loop = new FixedStepLoop({ updatesPerSecond: 120 });
const presentation = new PresentationFramePacer({ framesPerSecond: recommendedPresentationRate(renderer.rendererInfo().quality) });
const now = performance.now();
loop.advance(now, (dt) => simulation.step(dt));
if (presentation.shouldPresent(now)) renderer.render(simulation.snapshot(), { alpha: loop.interpolationAlpha, cameraEnabled: true });
```

```bash
npm install
npm test
npm run build
```
