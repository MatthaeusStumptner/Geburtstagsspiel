# Stabiles Mobile-Rendering und Web-Performance

**Status:** Freigegeben am 10. August 2026

## Ziel

Das Spiel soll auf mobilen Geräten, 60-Hz-Displays und hochfrequenten Desktop-Displays stabil, flimmerfrei und mit vorhersehbarer Last laufen. Die gemeinsame Renderer-API bleibt mit dem Level Editor kompatibel. Die bereits in Renderer PR #14 und Spiel PR #15 vorhandene Trennung zwischen einer festen 120-Hz-Simulation und einer auf 30 oder 60 FPS begrenzten Präsentation bleibt erhalten.

## Ausgangslage und Root Cause

Der aktuelle lokale Stand wurde bei 412 × 915 CSS-Pixeln, emuliertem DPR 2,625 und mit WebGL2, WebGPU sowie Canvas2D verglichen.

- WebGL2 und WebGPU zeigen ein horizontales Moiré-/Flimmermuster im Spielbild; Canvas2D zeigt es nicht.
- Die GPU-Shader erzeugen Scanlines im Raster einzelner interner Canvas-Pixel. Der Renderer begrenzt den internen DPR auf 2, während der Browser das Ergebnis auf DPR 2,625 ausgibt. Die erneute Skalierung lässt das feine Muster flimmern.
- Die Kamera liefert fraktionale Quellkoordinaten an einen Nearest-Neighbor-Sampler. Kontinuierliche UV-Verzerrungen verschieben die gesamte Pixelgrafik zusätzlich um Subpixel und verstärken sichtbare Sprünge.
- Auch statische Spielzustände werden weiter mit 30 oder 60 FPS gerendert und laden die Szenentextur erneut hoch.
- Im mobilen Layout ist die Canvas so groß wie das gesamte Viewport, obwohl der obere Teil von undurchsichtigen HUD-Flächen verdeckt wird.
- Größen werden teilweise im heißen Renderpfad über DOM-Messungen ermittelt.

Damit ist das Flimmern kein reiner Emulatorfehler. Geräte mit fraktionalem DPR oder browserseitiger Nachskalierung können denselben Fehler zeigen.

## Architekturentscheidung

Es wird eine stabile hybride Pipeline umgesetzt. Sie optimiert die bestehende Canvas2D-zu-GPU-Präsentation ohne eine neue, inkompatible Tile-/Sprite-Engine einzuführen.

Ein vollständiger GPU-Sprite-Batcher bleibt außerhalb dieses Vorhabens. Er benötigt einen eigenen Architektur- und Messzyklus, da er Renderer, Spiel und Level Editor gleichzeitig berührt.

## Renderer-Änderungen

### Pixelstabiles Sampling

Die Kameraquellen werden vor der Präsentation auf das Texelraster der gerenderten Szene eingerastet. Projektionen für Radar, Text und Editor-Selektionen verwenden exakt dieselbe eingerastete Kamera, damit Logik und Bild nicht auseinanderlaufen.

Nearest-Neighbor-Sampling bleibt für die Pixel-Art erhalten. Globale, kontinuierliche Subpixelverschiebungen der gesamten Szene werden entfernt. Atmosphärische Effekte verändern Farbe, Helligkeit und lokale Overlays, nicht mehr die Lage sämtlicher Weltpixel.

Der RGB-Split des Zauberbergs bleibt als bewusstes Stilelement erhalten, verwendet aber ganzzahlige Texelabstände und eine begrenzte Aktualisierungsfrequenz. Dadurch bleibt er lesbar, ohne die Geometrie der Szene flimmern zu lassen.

### DPR-stabile Scanlines

Ein Ein-Pixel-Wechselmuster wird nicht mehr verwendet. Scanlines werden als breites, niederfrequentes Muster berechnet. Wenn interner Renderer-DPR und tatsächlicher Geräte-DPR nicht hinreichend übereinstimmen, wird die Scanline-Intensität auf null gesetzt. `prefers-reduced-motion` deaktiviert geometrische Bewegung vollständig und lässt höchstens statische Farbkorrekturen zu.

### Resize-Vertrag

`PassauPixelRenderer.resize()` erhält gemessene CSS-Abmessungen und den tatsächlichen Geräte-DPR vom Aufrufer. Ohne Argumente bleibt ein kompatibler Fallback erhalten, er wird jedoch nicht mehr pro Frame verwendet.

Der Renderer ändert Backbuffer und Overlay-Canvas nur, wenn sich Breite, Höhe oder effektiver DPR wirklich geändert haben. Debugdaten zeigen CSS-Größe, tatsächlichen DPR, effektiven DPR, Backbuffergröße und den Grund einer Größenänderung.

### Uploads und Backend-Auswahl

Unveränderte Szene-, Welttext- und Bildschirm-Overlay-Texturen werden nicht erneut hochgeladen. Der Renderer erhält dafür explizite Änderungsmarker und behält die bereits vorhandenen Umgebungs- und Overlay-Caches bei. Collectibles und statische Dekorationen werden nur neu zusammengesetzt, wenn sich ihre Daten ändern.

WebGL2 reserviert unveränderliche Texturspeicher mit `texStorage2D` und aktualisiert sie mit `texSubImage2D`. Texturgrößenwechsel erzeugen kontrolliert eine neue Textur statt impliziter Reallokationen im Präsentationspfad.

Der synthetische Backend-Performance-Probe beim Start entfällt. Die Reihenfolge lautet WebGPU, WebGL2, Canvas2D, jeweils nach erfolgreicher Initialisierung. Qualität, Pixelratio und Präsentationsrate steuern die Last. Backend-Auswahl, Initialisierungsfehler, Context Loss und Fallback-Grund werden im Renderer-Snapshot ausgewiesen. Unter Windows wird WebGPU ohne wirkungsloses `powerPreference` angefordert.

## Spiel-Änderungen

### Zustandsabhängiger Scheduler

Kontinuierliche Simulation und Präsentation laufen nur in `playing`, `hit` und `cutscene`.

`ready`, `paused`, `won`, `over` und geöffnete Spielmenüs rendern genau einmal beim Eintritt und danach nur bei einer sichtbaren Änderung. In `map` und während des Onboardings wird die verdeckte Spiel-Canvas nicht präsentiert. Ein zentraler `requestRender(reason)`-Mechanismus markiert Einmal-Renderings und protokolliert im Entwicklungsmodus den Grund.

Beim Zurückkehren aus einem inaktiven Tab werden Simulation und Präsentationspacer zurückgesetzt. Der erste sichtbare Frame wird sofort angefordert.

### Layout und mobile Canvas

Ein `ResizeObserver` misst Board und HUD. Wenn verfügbar, wird `device-pixel-content-box` verwendet; andernfalls werden CSS-Größe und `devicePixelRatio` kombiniert. Gemessene Werte werden gecacht und an Renderer sowie Kamera weitergereicht.

Im mobilen Spiel ist das Board in zwei Bereiche geteilt:

- ein DOM-HUD oberhalb des Spielfelds;
- eine Canvas, die nur den verbleibenden sichtbaren Spielbereich belegt.

Overlays, Cutscenes und Radar verwenden dieselbe Spielfeldgeometrie. Safe-Area-Insets und Wechsel zwischen Portrait, Landscape und Browser-Vollbild lösen genau eine atomare Layoutaktualisierung aus.

### Passau-Karte

Das bewegte Raster wird auf einem eigenen Pseudo-Element über `transform` verschoben. Marker-Glow verwendet Opacity und Transform statt eines animierten Filters. Fluss- und Straßenlichter werden als wenige transformierte Glints umgesetzt, nicht als dauerhaft animierter `stroke-dashoffset` über komplette SVG-Pfade.

Kartenanimationen pausieren, wenn Auswahlmodal, Onboarding oder ein anderer Bildschirm die Karte verdeckt. `prefers-reduced-motion` zeigt eine statische Karte.

### Fonts, Cache und Accessibility

Silkscreen und DM Mono werden als lokale WOFF2-Dateien ausgeliefert. Das CSS-`@import` zu Google Fonts entfällt. Nur die für den ersten Bildschirm benötigten Schnitte werden vorab geladen.

Ein kleiner Service Worker cached ausschließlich versionierte Build-Assets unter `/assets/` mit Cache-first. HTML und Level-/Content-Dokumente bleiben network-first, damit Veröffentlichungen und neue Level nicht durch einen alten Cache verdeckt werden. Aktivierung und Cachebereinigung verändern keine LocalStorage-Spielstände.

Das unzulässige `aria-label` auf `strong#lives` entfällt. Eine visuell versteckte, semantische Textalternative liefert die Anzahl der Leinen.

## Datenfluss

1. `ResizeObserver` aktualisiert ein gecachtes Layoutmodell.
2. Zustandswechsel oder sichtbare Datenänderungen rufen `requestRender(reason)` auf.
3. Der Präsentationspacer entscheidet nur bei kontinuierlichen Zuständen über den nächsten Frame.
4. Der Renderer berechnet eine texelgenaue Kamera aus Snapshot und Layoutmodell.
5. Dirty-Marker bestimmen, welche Canvas-Layer neu gezeichnet und welche GPU-Texturen hochgeladen werden.
6. Der gewählte Backend-Shader präsentiert die Szene ohne globale Subpixelverzerrung.
7. Renderer- und Scheduler-Snapshots liefern Messwerte für Tests und lokale Audits.

## Fehlerbehandlung

- Schlägt WebGPU fehl, wird der Grund erfasst und einmalig WebGL2 versucht.
- Schlägt WebGL2 fehl oder geht der Context dauerhaft verloren, bleibt Canvas2D verfügbar.
- Ein Context Restore verwirft Textur-Dirty-Flags, sodass alle notwendigen Ressourcen genau einmal neu hochgeladen werden.
- Fehlt `ResizeObserver`, aktualisieren `resize`, `orientationchange` und `fullscreenchange` das Layoutmodell.
- Scheitert die Service-Worker-Registrierung, bleibt das Spiel ohne Offline-Cache vollständig funktionsfähig.

## Teststrategie und Abnahmekriterien

### Automatisierte Renderer-Tests

- Kameraquellen sind bei Scene-Scale 1 und 2 auf dem jeweiligen Texelraster eingerastet.
- Shader enthalten keine Ein-Pixel-Scanline-Formel und keine kontinuierliche globale UV-Verzerrung.
- Fraktionale DPR-Kombinationen 1,25, 1,5, 1,6, 2,625 und 3 deaktivieren instabile Scanlines.
- WebGL2 und WebGPU erzeugen für dieselbe statische Szene über mehrere Präsentationen identische Pixel.
- WebGL2 verwendet `texStorage2D`; unveränderte Texturen erhöhen den Uploadzähler nicht.
- Context Loss und Backend-Fallback liefern einen maschinenlesbaren Grund.
- Präsentationspacer bleiben bei simulierten 60, 120 und 175 Hz stabil.

### Automatisierte Spieltests

- Jeder Spielzustand besitzt eine deklarierte Renderpolitik: kontinuierlich, einmalig oder verborgen.
- Karte, Onboarding, Pause und Game Over erhöhen nach dem initialen Frame den Renderer-Framezähler nicht weiter.
- Layoutmessungen werden bei unverändertem Viewport nicht im Renderloop wiederholt.
- Mobile Spielfeldhöhe entspricht Viewport minus HUD und Safe Area.
- Service Worker cached nur versionierte Assets und aktualisiert HTML sowie Leveldaten weiterhin über das Netz.

### Browser- und visuelle Tests

Playwright prüft Chromium in folgenden Kombinationen:

- Desktop bei simulierten 60, 120 und 175 Hz;
- Mobile Portrait 390 × 844 bei DPR 3;
- Mobile Portrait 412 × 915 bei DPR 2,625;
- Mobile Landscape 915 × 412 bei DPR 2,625;
- WebGL2, WebGPU sofern verfügbar, und Canvas2D;
- normales Rendering und reduzierte Bewegung.

Für WebGL2 und Canvas2D werden Referenzscreenshots erzeugt. Kurze Videos decken Laufbewegung, Kamera, Pause, Kartenwechsel und Rotation ab. Im statischen Pausentest darf außerhalb absichtlich animierter DOM-Elemente keine zeitliche Pixeldifferenz im Spielbild entstehen.

### Performance-Abnahme

- Aktive Präsentation überschreitet auf Qualitätsprofilen nicht 60 FPS und auf Performanceprofil nicht 30 FPS.
- Karte, Pause, Game Over und verdeckte Canvas verursachen nach dem Einmal-Rendering null fortlaufende Szenenuploads.
- Im mobilen Portrait wird kein Backbuffer für die vom HUD verdeckte Fläche angelegt.
- Während fünf Sekunden aktivem Spiel entstehen keine Textur-Reallokationen.
- Der bestehende Benchmark muss die Profile Notebook, Mobile und Weak Mobile weiterhin erfüllen.
- Der erneute Web-Performance-Audit darf auf Mobile keinen schlechteren LCP als 2,5 Sekunden und keinen CLS über 0,1 zeigen.

## PR-Aufteilung

### Renderer PR #14

- texelgenaue Kamera und DPR-stabile Effektprofile;
- überarbeitete GLSL-/WGSL-Shader;
- expliziter Resize-Vertrag und Dirty-Upload-Logik;
- `texStorage2D`, vereinfachte Backend-Auswahl und Diagnostik;
- Unit-, Benchmark- und Browser-Regressionstests.

### Spiel PR #15

- zustandsabhängiger Render-Scheduler;
- gecachtes Layoutmodell und echtes mobiles Spielfeld;
- compositor-freundliche Kartenanimationen;
- lokale Fonts, Service Worker und Accessibility-Korrektur;
- automatisierte Zustands-, Layout- und Playwright-Tests.

PR #15 referenziert nach Abschluss einen konkreten Commit aus Renderer PR #14. Beide PRs bleiben zunächst Entwürfe, bis alle automatisierten und visuellen Abnahmen dokumentiert sind.
