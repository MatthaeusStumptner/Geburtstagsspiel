# Architektur · Franz & Lola

Das Projekt besteht aus drei bewusst getrennten Repositories:

1. **Geburtstagsspiel** enthält Spielregeln, UI, Texte, Fortschritt und Browser-Persistenz.
2. **Pacman_clone_renderer** enthält ausschließlich das Level-Zwischenformat, Validierung, Kamera und Canvas-Pixelrenderer.
3. **Pacman_clone_level_editor** ist eine statische No-Code-Anwendung, die Level im gemeinsamen Format importiert und exportiert.

## Laufzeitgrenzen

- `src/core/fixed-step-loop.js` entkoppelt die Simulation vom Bildschirmtakt. Die Logik läuft mit 120 Hz, der Renderer interpoliert zwischen zwei Simulationsständen.
- `src/game/grid-motion.js` bewegt Figuren exakt von Kreuzung zu Kreuzung und verhindert übersprungene Abbiegungen.
- `src/game/progress-system.js` besitzt die kanonische globale Skala von 70 Guttis je Ort, unabhängig von der gewählten Schwierigkeit.
- Das Renderer-Paket kennt keine Spielstände, Punkte, Schwierigkeit oder `localStorage`.
- Das Level-JSON kennt keine UI. Es kann daher vom Editor erzeugt und vom Spiel direkt konsumiert werden.

## Level-Zwischenformat

Jede Datei trägt `kind: "franz-lola-level"` und `schemaVersion: 1`. Enthalten sind lokalisierte Metadaten, Geokoordinaten, Raster und Wandrechtecke, Theme/Palette, Figuren-Startpunkte und Power-ups. Neue Figuren können über stabile `renderer`-Kennungen ergänzt werden.

Die Formatvalidierung prüft nicht nur Datentypen, sondern auch Kollisionen mit Wänden und die Erreichbarkeit von Startpunkten und Power-ups.

## Browser und Hosting

Alle drei Teile sind ohne Server-API nutzbar. Spiel und Editor bauen relative Assets und können über GitHub Pages bereitgestellt werden. Spielstände und Editor-Entwürfe verbleiben ausschließlich in `localStorage` des jeweiligen Browsers.
