# Architektur des Franz-&-Lola-Studios

Die Anwendung ist eine statisch baubare Svelte-5-Oberfläche. Sie benötigt zur Laufzeit keinen eigenen Webserver und bleibt damit GitHub-Pages-kompatibel. Cloud-Funktionen sind ein optionaler Publisher-Dienst; Bearbeiten, Testen, Import und Export funktionieren weiterhin lokal.

## Architekturgrenzen

Die Anwendung unterscheidet vier Zustandsarten, die nicht mehr unkontrolliert ineinander schreiben:

1. **Dokumentzustand** – das aktive Level im gemeinsamen `franz-lola-level`-Format.
2. **Globale Definitionen** – Objekt- und Figurenvorlagen, unabhängig von einem Level.
3. **Studio-Kontext** – Auswahl, Fachbereich, aktiver Track, aktives Asset und Canvas-Kamera.
4. **Flüchtige Editorzustände** – noch nicht bestätigte Assistenten, Sprite-Gesten, Playhead und offene Dialoge.

`StudioState` koordiniert diese Grenzen. Geometrieänderungen laufen durch `EditorState`; globale Vorlagen durch `ObjectLibrary` beziehungsweise `CharacterLibrary`. `StudioHistory` legt vor einem bestätigten Kommando einen vollständigen Snapshot von Level und globalen Definitionen an. Dadurch können auch Änderungen außerhalb des Levels mit demselben Undo/Redo rückgängig gemacht werden.

Ein Assistent darf niemals durch bloßes Öffnen persistente Daten erzeugen. Neue Assets und Figuren sind lokale Entwürfe, bis „Sprite übernehmen“ bestätigt wurde. Abbrechen ist garantiert nebenwirkungsfrei.

## Arbeitsbereiche

1. **Level** – Raster, Wände, Startpunkte, Regeln, Theme und Szenenbaum
2. **Objekte** – globale Assetdefinitionen und klar getrennte Levelinstanzen
3. **Figuren** – globale Figuren, Levelinstanzen, Sprite-Sheets, States und Verhalten
4. **Cutscenes** – levelgebundene Tracks, Playhead, Keyframes, Kamera und Dialoge
5. **Ereignisse** – Triggerzonen, Richtungsfolgen, Visuals und beide Sprachfassungen
6. **Testspiel** – dieselbe Simulation, Kamera und Cutscene-Wiedergabe wie im Spiel
7. **Live** – lokale Entwürfe, gemeinsame Revisionen und geführte Veröffentlichung

Auf kleinen Viewports werden alle sieben Bereiche über einen sichtbaren Bereichswähler erreicht. Der Desktop-Navigator wird dort nicht nur horizontal abgeschnitten. Bibliothek, Canvas und Inspector bleiben als fokussierte mobile Sheets erhalten.

## Zentrale Module

- `src/App.svelte`: Shell, Projektleiste, responsive Fachbereichnavigation und Tastaturkommandos
- `src/studio/store.svelte.js`: Orchestrierung bestätigter Studio-Kommandos
- `src/studio/history.js`: bereichsübergreifende, begrenzte und koaleszierbare History
- `src/editor-state.js`: Leveltransaktionen und Wandgeometrie
- `src/editor-tools.js`: reine Geometrie und Bildschirm-/Weltkoordinaten
- `src/pixel-selection.js`: Pixel-Auswahl, Linie, Rechteck, Füllen sowie Copy/Paste
- `src/object-library.js` und `src/character-library.js`: globale Definitionen
- `src/scene-model.js`: Szenenbaum, Hit-Testing und Auswahlkontext
- `src/playtest-engine.js`: deterministische Spielsimulation
- `src/draft-repository.js`: lokale Levelentwürfe und sichere Migration
- `src/publisher-client.js`: optionale gemeinsame Revisionen ohne Browser-Secrets
- `src/components/`: Fachbereiche und transaktionale Spezialeditoren

## Kommandofluss

```text
Benutzeraktion
    │
    ├── flüchtig ──► Dialog-/Gesture-State ──► Abbrechen: verwerfen
    │                                      └─► Bestätigen
    │
    └── bestätigt ─► Snapshot vorher
                     ├─► Levelkommando / Bibliothekskommando
                     ├─► verknüpfte Instanzen aktualisieren
                     ├─► Snapshot nachher in StudioHistory
                     └─► lokales Autosave + optionale Cloud-Synchronisation
```

Laufende Eingaben wie Farbregler werden nach Kontext koalesziert, bleiben aber sofort sichtbar. Eine Zeichen-, Transformations- oder Pan-Geste ist jeweils ein verständlicher History-Schritt.

## Renderer und Canvas

Editor, Cutscene-Vorschau, Testspiel und fertiges Spiel verwenden denselben Renderer. Der Level-Canvas unterstützt Einpassen, Zoom, Mausrad, Handwerkzeug, mittlere Maustaste und Leertaste. Hit-Testing verwendet die reale Kamera samt Letterboxing. Für Browsertests exportiert der Canvas die berechnete Source-/Viewport-Projektion als Diagnoseattribute; Testklicks benutzen daher exakt dieselbe Projektion wie ein sichtbarer Klick.

Der Testlauf merkt einen Startwunsch vor, falls WebGL/WebGPU noch initialisiert. Ein früher Klick geht nicht mehr verloren, sondern startet nach der Initialisierung automatisch.

## Qualitätsvertrag

- Reine Fachlogik erhält Node-Tests.
- Jeder reparierte Bedienabbruch erhält einen Browser-Regressionstest.
- Desktop und Mobile führen echte Klick-, Drag-, Eingabe-, Undo-, Reload- und Platzierabläufe aus.
- Visuelle Tests prüfen Renderer-Schärfe, kleine Viewports und komplexe Originallevel.
- Produktions-Build und alle Tests müssen ohne versteckte Test-Sonderpfade funktionieren.

Die Browsermatrix deckt unter anderem transaktionale Asset-Erstellung, 24×24-Pixelwerkzeuge, globale History, Canvas-Zoom/Pan, Kamera-Hit-Testing, Figurenplatzierung und Skalierung, editierbare Ereigniszonen, Richtungsfolgen, Cutscene-Playhead-Keyframes, Testlauf-Initialisierung, mobile Navigation, Publisher-Flows und Accessibility ab.
