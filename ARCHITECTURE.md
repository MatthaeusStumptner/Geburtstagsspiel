# Architektur · Franz & Lola

`Geburtstagsspiel` ist das kanonische Monorepo. Ein Root-Lockfile und ein Root-Verifikationsgate halten Spiel, Studio, Publisher und interne Pakete auf demselben Stand.

## Workspaces und Inhalte

- `apps/game` enthält Browser-Orchestrierung, Svelte-UI, Audio, Rendering-Adapter und LocalStorage-Persistenz.
- `apps/studio` enthält die statische Levelwerkstatt und ihr Testspiel.
- `apps/publisher` enthält den Cloudflare Worker, D1-Zugriff und GitHub-Veröffentlichung.
- `packages/content-model` besitzt Level-/Content-Schemas, Migrationen, kanonische Pfade, Validierung und Referenzauflösung.
- `packages/game-core` besitzt deterministische Simulation, Spielregeln, Cutscene-Sampling, Fixed-Step-Schleife und reproduzierbaren Zufall. Es verwendet weder DOM, Canvas, Storage noch Wanduhr.
- `packages/pixel-renderer` besitzt Kamera, Painter, Canvas-/GPU-Backends und Präsentationslogik. Es reexportiert keine Simulationsbesitzer aus `game-core`.
- `packages/testkit` enthält gemeinsame unveränderliche Fixtures und Cross-App-Verträge.
- `content/*` ist die einzige kanonische Quelle für veröffentlichte Level, Figuren, Tilesets, Blöcke, Animationen, Cutscenes, Objekte und Events.

Direkte Imports zwischen Anwendungen sind verboten. Gemeinsames Verhalten wird über `@franz-lola/*`-Pakete konsumiert; Renderer und Game Core sind lokale Workspace-Abhängigkeiten statt externer Git-Pins.

## Laufzeitgrenzen

`createGameSession` in `game-core` validiert das Level, verarbeitet Eingaben ausschließlich über `queueInput` und wird ausschließlich mit `step(dt)` fortgeschrieben. Sein serialisierbarer Savestate umfasst neben sichtbarem Spielzustand auch Richtungsverlauf, internen PRNG-Zustand und Fixed-Step-Rest. Dadurch setzt eine wiederhergestellte Session bei identischen Eingaben und Deltas exakt wie eine ununterbrochene Session fort. Öffentliche Snapshots und Savestates sind tief unveränderlich.

`apps/game/src/main.js` verbindet diese browserfreie Session mit Renderer, UI, Audio und Persistenz. Neue Saves enthalten optional den Core-Savestate; Saves ohne dieses Feld verwenden weiterhin den bisherigen positions- und fortschrittsbasierten Restore-Pfad. Der bestehende Save-Key und Versionsbereich bleiben erhalten.

Svelte wird für Oberflächen und Bedienabläufe verwendet. Hochfrequente Simulations- und Renderdaten bleiben außerhalb der UI-Stores. Das Studio-Testspiel verwendet dieselbe `createGameSession`-Grenze wie das Spiel.

## Inhalts- und Publisher-Grenze

`franz-lola-level` bleibt das ausführbare Level-Zwischenformat. Wiederverwendbare `franz-lola-content`-Dokumente verwenden Schema v2. Nur die explizite v1-Migration darf Defaults ergänzen; v2-Abhängigkeiten und -Referenzen werden streng, ohne Sortierung, Deduplizierung oder stille Korrektur validiert.

Der Publisher validiert mit `@franz-lola/content-model`, bevor er D1-Zeilen oder den Index `content_dependencies` ersetzt. GitHub-Pfade werden ausschließlich über kanonische Typ-/ID-Zuordnung unter `content/*` erzeugt.

## Browser und Hosting

Das Spiel und das Studio bauen relative statische Assets. Der Publisher bleibt eine separate Cloudflare-Worker-Anwendung mit bestehender D1-Datenbank. Der Foundation-Workflow baut alle Workspaces, veröffentlicht bis zum kombinierten Pages-Cutover aber bewusst nur `apps/game/dist`. Die bestehende Live-Editor-URL und Worker-Routen werden in diesem Schritt nicht umgestellt.

Service Worker und LocalStorage gehören ausschließlich zur Browser-App. `content-model`, `game-core` und `pixel-renderer` greifen nicht auf Browser-Persistenz zu.
