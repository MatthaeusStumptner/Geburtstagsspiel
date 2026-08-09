# Architektur · Franz & Lola

Das Projekt besteht aus drei bewusst getrennten Repositories:

1. **Geburtstagsspiel** enthält Spielregeln, UI, Texte, Fortschritt und Browser-Persistenz.
2. **Pacman_clone_renderer** enthält ausschließlich das Level-Zwischenformat, Validierung, Kamera und Canvas-Pixelrenderer.
3. **Pacman_clone_level_editor** ist eine statische No-Code-Anwendung, die Level im gemeinsamen Format importiert und exportiert.

## Laufzeitgrenzen

- `src/core/fixed-step-loop.js` entkoppelt die Simulation vom Bildschirmtakt. Die Logik läuft mit 120 Hz, der Renderer interpoliert zwischen zwei Simulationsständen.
- `src/game/grid-motion.js` bewegt Figuren exakt von Kreuzung zu Kreuzung und verhindert übersprungene Abbiegungen.
- `src/game/progress-system.js` besitzt die kanonische globale Skala von 70 Guttis je Ort, unabhängig von der gewählten Schwierigkeit.
- `src/main.js` ist der Laufzeit-Orchestrator: Er verbindet Spielzustand, Canvas-Engine und UI-Befehle, besitzt aber kein Markup der migrierten Oberflächen mehr.
- Das Renderer-Paket kennt keine Spielstände, Punkte, Schwierigkeit oder `localStorage`.
- Das Level-JSON kennt keine UI. Es kann daher vom Editor erzeugt und vom Spiel direkt konsumiert werden.

## UI-Schicht

- Svelte wird ausschließlich für Oberfläche und Bedienabläufe verwendet. Der Canvas-Renderer und die deterministische Spielschleife bleiben Framework-unabhängig.
- `src/ui/ui-session.js` ist die einzige Brücke zwischen beiden Welten. Die Engine veröffentlicht kleine unveränderliche Snapshots; Svelte sendet benannte Befehle zurück.
- Onboarding, Einstellungen, Karte, HUD-Flächen, Seitenleiste, Spielmeldungen, Cutscene-Texte und Endgame sind eigenständige Svelte-Komponenten. `src/ui/mount-ui-surfaces.js` setzt sie an die für Canvas und Vollbild nötigen Layoutpositionen.
- `src/ui/components/SceneTransition.svelte` deckt Szenenwechsel ab. Der Orchestrator tauscht Karte und Level erst im vollständig abgedunkelten Zustand aus; dadurch bleiben Laden, Fade-out und Fade-in unabhängig von Canvas und Karten-Markup.
- Die Konzertfreigabe ist ein Ereignis der Karte: Der letzte Levelabschluss setzt zunächst nur den internen Fortschritt. Erst nach der Rückkehr auf die Karte führt `MapEndgameEvent.svelte` die Boot- und Enthüllungssequenz aus. Die dauerhaft sichtbare Kartenplakette erscheint erst nach der bestätigten Enthüllung.
- Level-Cutscenes besitzen einen immersiven Präsentationszustand: Canvas, Cutscene-Titel, Dialog und Skip-Befehl bleiben sichtbar, während sämtliche Gameplay-HUD-Flächen aus dem Viewport und dem Accessibility-Baum verschwinden. Nach dem letzten Cutscene-Frame blendet der Orchestrator das HUD gestaffelt wieder ein; die bestehende Reduced-Motion-Vorgabe verkürzt diesen Übergang automatisch.
- `src/ui/map-geometry.js` projiziert die echten geografischen Koordinaten einmalig in ein gemeinsames metrisches Kartenkoordinatensystem. Die Komponente übernimmt nur Darstellung, Fokus und responsive Positionierung.
- Das Katzen-Radar bleibt Teil der Renderer-Integration, weil seine Positionen pro Frame aus der aktuellen Kamera berechnet werden. Dadurch gelangen keine hochfrequenten Renderdaten in den UI-Store.
- `src/audio/browser-audio-service.js` besitzt genau einen Browser-Audiokontext für UI- und Gameplay-Töne. `src/audio/level-audio-director.js` orchestriert darauf Karten-Vorschau, Übergang, Cutscene, Gameplay, Pause und Abschluss, ohne den Track desselben Ortes neu zu starten.
- `src/audio/level-soundscapes.js` enthält neun eigenständige `franz-lola-soundscape`-Profile. Melodie, Bass, Puls, Tempo und gefilterte Umgebung werden prozedural erzeugt; die veröffentlichte GitHub-Pages-Version benötigt deshalb keine externen oder lizenzpflichtigen Audiodateien. Ein Level referenziert die Klangwelt über seine stabile Level-ID, während der Renderer selbst audiofrei bleibt.
- `src/content/game-copy.js`, `src/game/difficulty-config.js` und `src/platform/save-migrations.js` halten Texte, Spielkonfiguration und Persistenzregeln aus dem Orchestrator heraus.

Die globale Typografie verwendet relative `rem`-basierte `clamp()`-Tokens. Texte und Container müssen bei 320 CSS-Pixeln einspaltig reflowen; reguläre Bedienelemente sind mindestens 44 CSS-Pixel hoch. Kartenmarker bleiben als maßstäbliche Interaktion eine bewusst kompaktere Ausnahme.

Weitere UI-Bereiche können entlang derselben Grenze migriert werden. Spielregeln gehören dabei weder in Svelte-Komponenten noch in UI-Stores; Komponenten erhalten nur darstellungsfertige Zustände und lösen Befehle aus.

## Level-Zwischenformat

Jede Datei trägt `kind: "franz-lola-level"` und `schemaVersion: 1`. Enthalten sind lokalisierte Metadaten, Geokoordinaten, Raster und Wandrechtecke, Theme/Palette, Figuren-Startpunkte und Power-ups. Neue Figuren können über stabile `renderer`-Kennungen ergänzt werden.

Die Formatvalidierung prüft nicht nur Datentypen, sondern auch Kollisionen mit Wänden und die Erreichbarkeit von Startpunkten und Power-ups.

## Browser und Hosting

Alle drei Teile sind ohne Server-API nutzbar. Spiel und Editor bauen relative Assets und können über GitHub Pages bereitgestellt werden. Spielstände und Editor-Entwürfe verbleiben ausschließlich in `localStorage` des jeweiligen Browsers.
