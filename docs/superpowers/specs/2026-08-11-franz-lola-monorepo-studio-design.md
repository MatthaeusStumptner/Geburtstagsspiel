# Franz & Lola: Monorepo, gemeinsamer Renderer und geführte Levelwerkstatt

**Status:** Vom Nutzer am 11. August 2026 freigegeben

## Ziel

Spiel, Levelwerkstatt, Publisher, Renderer, Simulation und Inhaltsmodell werden als ein
zusammenhängendes Produkt entwickelt und aus einem einzigen kanonischen Repository
gebaut. Nichtprogrammierer sollen ein Projekt von der ersten Idee bis zur erfolgreichen
Veröffentlichung ohne Git-, JSON- oder Kommandozeilenkenntnisse erstellen können.

Das Repository `MatthaeusStumptner/Geburtstagsspiel` wird das Monorepo und die einzige
Quelle für produktiven Quellcode und veröffentlichte Inhalte. Das Spiel bleibt unter
`/Geburtstagsspiel/` erreichbar. Die Levelwerkstatt wird unter
`/Geburtstagsspiel/studio/` ausgeliefert. Der bestehende Cloudflare-Worker bleibt der
sichere Publisher.

## Ausgangslage

Die drei aktuellen Repositories besitzen keine gemeinsame Versions- oder
Kompatibilitätsgrenze:

- das Spiel verwendet Renderer-Commit `925b1708dd8cd60f9cf4b0168d7674d8656ebdf2`;
- Editor PR #18 verwendet Renderer-Commit `4deee7d`;
- das Publisher-Unterprojekt verwendet Renderer-Commit `b9b00a2`;
- jedes Projekt besitzt ein eigenes Lockfile und einen eigenen CI-Lauf.

Eine gemergte Renderer-PR aktualisiert deshalb weder Spiel noch Editor. Ein manuell
erstellter Folge-PR kann bereits beim Merge wieder veraltet sein. Editor PR #18 änderte
lediglich den Git-Pin. Sein CI-Fehler wurde separat als Test-Race beim asynchronen Laden
der Objektbibliothek reproduziert: Während ein abgebrochener Dialog offen war, wurden
die regulären Bibliotheksobjekte geladen; der Test deutete die neue Gesamtzahl fälschlich
als verworfene Objekterstellung.

Das Katzenradar besitzt zusätzlich einen eigenen Präsentationspfad. Es wird auf 20 FPS
gedrosselt und projiziert rohe Simulationspositionen mit eigener Kameralogik. Der
Renderer liefert bereits interpolierte Katzenpositionen mit der tatsächlich
präsentierten, texelgenauen Kamera. Das Radar ignoriert diese Daten und kann deshalb
ruckeln oder von der sichtbaren Katze abweichen.

Die Levelwerkstatt besitzt mehrere unabhängige Render-Schleifen: Hauptvorschau,
Testspiel, Objektvorschau, Figurenvorschau, Cutscene und Zeitleisten aktualisieren sich
mit unterschiedlichen Frequenzen. Gleichzeitig bündelt `store.svelte.js` einen großen
Teil von Projekt-, Auswahl-, Werkzeug-, Historien-, Cloud- und UI-Zustand. Das macht
Interaktionen schwerer vorhersehbar und erschwert eine klare Einsteigerführung.

## Architekturentscheidung

Es wird ein Monorepo mit lokal verknüpften Workspace-Paketen aufgebaut. Es gibt einen
Lockfile, einen Root-CI-Vertrag und einen koordinierten Build. Interne Pakete werden
zunächst nicht über npm veröffentlicht. Dadurch können Spiel und Editor niemals
unbemerkt unterschiedliche Renderer-Versionen installieren.

```text
franz-lola/
├─ apps/
│  ├─ game/                    Browser-Spiel
│  ├─ studio/                  Levelwerkstatt
│  └─ publisher/               Cloudflare Worker
├─ packages/
│  ├─ content-model/           Schema, Referenzen, Migrationen, Validierung
│  ├─ game-core/               deterministische Simulation und Spielregeln
│  ├─ pixel-renderer/          Kamera, Painter und Canvas-/GPU-Backends
│  ├─ render-coordinator/      Präsentations- und Preview-Scheduling
│  └─ testkit/                 gemeinsame Fixtures, Browser- und Bildverträge
├─ content/
│  ├─ levels/
│  ├─ characters/
│  ├─ objects/
│  ├─ animations/
│  ├─ cutscenes/
│  └─ events/
├─ tools/                      Migration, Build, Prüfungen und Veröffentlichung
└─ package-lock.json
```

### Paketgrenzen

`content-model` ist browser- und rendererunabhängig. Es definiert Inhaltsversionen,
JSON-Schemas, ID-Referenzen, Abhängigkeitsauflösung, Migrationen und verständliche
Validierungsfehler. Spiel, Studio und Publisher verwenden exakt dieselben Funktionen.

`game-core` besitzt keine DOM- oder Canvas-Abhängigkeit. Es implementiert die feste
Simulation, Spieler, Katzen, Guttis, Ereignisauslöser, Kollisionen, Levelabschluss und
reproduzierbare Zufallsquellen. Echtes Spiel und Studio-Testspiel verwenden dieselbe
Session-Implementierung.

`pixel-renderer` enthält keine Editor- oder Spielnavigation. Es nimmt einen
Szenen-Snapshot und ein Darstellungsprofil entgegen und liefert das Bild sowie einen
`PresentationFrame`. Canvas2D, WebGL2 und WebGPU bleiben austauschbare Backends hinter
demselben Vertrag.

`render-coordinator` entscheidet, wann präsentiert wird. Er besitzt Profile für Spiel,
interaktive Editorvorschau, Testspiel, animierte Miniatur und statische Miniatur. Kein
Svelte-Component erzeugt eine eigene unkoordinierte Dauer-`requestAnimationFrame`-
Schleife.

`testkit` liefert gemeinsame Beispiellevel, simulierte Displays, Golden Scenes,
Screenshot-Helfer, Publisher-Fixtures und Browserzustände. Änderungen am Renderer
werden dadurch automatisch gegen Spiel und Studio geprüft.

Direkte Imports zwischen `apps/game` und `apps/studio` sind verboten. Gemeinsam
benötigtes Verhalten muss eine explizite Paketgrenze erhalten. So bleibt das Monorepo
modular und wird nicht zu einem unstrukturierten gemeinsamen Quellordner.

## Gemeinsamer Darstellungsvertrag

Der Renderer liefert nach jeder tatsächlichen Präsentation einen
`PresentationFrame`. Mindestens folgende Daten gehören dazu:

```text
frameId und presentationTime
requestedBackend und resolvedBackend
Kamera und sichtbarer Ausschnitt
Displaygröße, tatsächlicher und effektiver DPR
interpolierte Spielerposition im Welt- und Bildschirmraum
interpolierte Katzenpositionen im Welt- und Bildschirmraum
Sichtbarkeit, Entfernung, Status und Farbe der Katzen
sichtbare Charaktere, Objekte und Ereignisanker
Diagnostik zu Context Loss, Uploads und Reallokationen
```

Alle Bildschirmprojektionen außerhalb der eigentlichen Weltmaler verwenden diesen
Frame. Radar, Editor-Selektion, Handles, Ereignismarker und Debug-Overlays dürfen keine
eigene Kamera oder eigene Interpolation berechnen.

### Katzenradar

Das Radar konsumiert `PresentationFrame.entities` aus demselben Frame wie das sichtbare
Spiel. Die harte 50-ms-/20-FPS-Drossel entfällt. Positionsänderungen werden in der
Präsentationskadenz über `translate3d` geschrieben. Text, Gefahrenstatus, Farbe und
ARIA-Beschreibung werden nur aktualisiert, wenn sich ihr semantischer Wert ändert.

Ausgeblendetes Radar schläft vollständig. Offscreen-Richtung und Entfernung stammen
aus der gemeinsamen Projektion. Browser-Tests vergleichen Radaranker und gerenderte
Katzenposition über Kamera-, Resize-, Portrait-, Landscape- und hohe-Hz-Fälle.

## Levelwerkstatt als Produkt

### Zwei Bedienmodi, ein Projekt

Der geführte Modus ist der Standard. Er zeigt einen verständlichen Projektweg:

1. Idee und Levelgrundlage
2. Wege, Blöcke und Umgebung
3. Figuren und Objekte
4. Animationen und Zustände
5. Ereignisse und Cutscene
6. echtes Testspiel
7. Qualitätsprüfung und Veröffentlichung

Jeder Schritt besitzt Ziel, kurze Erklärung, sichtbaren Fortschritt, nächste sinnvolle
Aktion und direkt anwählbare Probleme. Nutzer können Schritte erneut öffnen oder
überspringen, solange der finale Qualitätscheck fehlende Voraussetzungen klar zeigt.

Der Profi-Modus behält die freie Studio-Navigation mit direktem Zugriff auf Level,
Objekte, Figuren, Cutscenes, Ereignisse, Testspiel und Live-Bereich. Beide Modi arbeiten
auf demselben Projektdokument, derselben Historie und derselben Auswahl. Ein Wechsel
verliert keine Daten.

### Routing und Wiederaufnahme

Jeder relevante Arbeitszustand besitzt eine stabile Route:

```text
/studio/project/:projectId/plan
/studio/project/:projectId/level
/studio/project/:projectId/objects
/studio/project/:projectId/characters
/studio/project/:projectId/animations
/studio/project/:projectId/events
/studio/project/:projectId/cutscene
/studio/project/:projectId/playtest
/studio/project/:projectId/publish
```

Route, gewähltes Werkzeug, ausgewähltes Element, Zoom, Kameraposition und letzter
geführter Schritt werden lokal gespeichert. Ein geteilter oder neu geladener Link darf
nicht in einen unklaren Default-Arbeitsraum zurückfallen.

### Zustandsaufteilung

Der bisherige große Studio-Store wird in klar verantwortete Bereiche zerlegt:

- `ProjectSession`: geladenes Projekt, Inhaltsreferenzen und Dirty-Status;
- `CommandHistory`: Undo/Redo über benannte, atomare Kommandos;
- `SelectionModel`: Einzel-, Mehrfach- und Bereichsauswahl;
- `ToolSession`: aktives Werkzeug und temporäre Pointer-Geste;
- `ViewportSession`: Kamera, Zoom, Raster und sichtbare Handles;
- `RenderSession`: Rendererprofil, Sichtbarkeit und letzte Präsentation;
- `DraftSync`: lokale Speicherung, D1-Synchronisierung und Konflikte;
- `PublicationSession`: Preflight, Snapshot und Veröffentlichungsstatus;
- `NavigationSession`: geführter Schritt, Profi-Bereich und Route.

Persistenter Projektzustand und flüchtiger UI-Zustand werden getrennt. Pointer-Moves
erzeugen keine vollständigen Projektsnapshots. Eine abgeschlossene Geste wird als ein
Undo-Kommando gespeichert.

### Renderer im Studio

Die Hauptvorschau und das Testspiel verwenden dasselbe `pixel-renderer`-Workspace-
Paket wie das Spiel. Das Testspiel verwendet zusätzlich dieselbe `game-core`-Session.
Damit sind Kamera, Katzenverhalten, Effekte, Cutscenes und Levelabschluss WYSIWYG.

Der `render-coordinator` steuert die Last:

- aktive Hauptvorschau: displaygerecht, sofort nach Interaktion;
- Testspiel: identische Simulations- und Präsentationsregeln wie das Spiel;
- sichtbare animierte Miniaturen: gemeinsame begrenzte Kadenz;
- statische Miniaturen: einmal nach Datenänderung;
- verdeckte Tabs, Dialoghintergründe und offscreen Miniaturen: keine Präsentation;
- Resize und DPR-Wechsel: atomare Layoutmessung außerhalb des Renderloops.

Objekt- und Figurenauswahl zeigen das tatsächlich gerenderte Asset. Symbolische
Platzhalter sind nur für explizit fehlende oder defekte Assets zulässig und tragen eine
verständliche Reparaturaktion.

## Inhaltsmodell

Jedes Dokument besitzt mindestens `formatVersion`, `id`, `type`, `revision` und
menschenlesbaren Namen. Referenzen erfolgen über stabile IDs statt eingebetteter Kopien.
Der Inhaltspfad ist die einzige veröffentlichte Wahrheit:

```text
content/levels/<id>.level.json
content/characters/<id>.character.json
content/objects/<id>.object.json
content/animations/<id>.animation.json
content/cutscenes/<id>.cutscene.json
content/events/<id>.event.json
```

Eine Levelabhängigkeitsauflösung bestimmt transitiv alle verwendeten Figuren, Objekte,
Animationen, Ereignisse und Cutscenes. Der Editor zeigt fehlende, veraltete oder lokal
abweichende Abhängigkeiten vor dem Testspiel und vor der Veröffentlichung.

Migrationen sind rein, versioniert und wiederholbar. Spiel, Studio und Publisher
akzeptieren denselben Versionsbereich. Unbekannte neuere Formate werden nicht still
interpretiert. Der Nutzer erhält eine sichere Exportmöglichkeit, bevor eine lokale
Migration dauerhaft gespeichert wird.

## Publisher und Veröffentlichung

### Bestehende Infrastruktur

Der Cloudflare Worker `franz-lola-publisher`, die D1-Datenbank, die GitHub App und alle
Secrets bleiben bestehen. Es gibt keine Datenbankneuanlage. Die bestehende GitHub App
ist bereits für `Geburtstagsspiel` installiert und schreibt nach der Migration direkt
in das kanonische Monorepo.

Folgende Produktionswerte bleiben beziehungsweise ändern sich:

```text
GITHUB_OWNER        = MatthaeusStumptner       unverändert
GITHUB_REPO         = Geburtstagsspiel         unverändert
GITHUB_BASE_BRANCH  = main                     unverändert
EDITOR_ORIGIN       = https://matthaeusstumptner.github.io
EDITOR_PATH_PREFIX  = /Geburtstagsspiel/studio/
GAME_URL            = https://matthaeusstumptner.github.io/Geburtstagsspiel/
```

Der Worker-OAuth-Callback bleibt unter seiner vorhandenen `workers.dev`-Adresse. Der
erlaubte Rücksprungpfad wird auf das neue Studio geändert. Sitzungstoken bleiben nur im
URL-Fragment bis zum unmittelbaren Verbrauch und anschließend im Speicher des Tabs.

### Geführter Preflight

Vor einer Netzwerkanfrage erstellt das Studio einen unveränderlichen
Veröffentlichungssnapshot. Der lokale Preflight prüft:

- Schema und Inhaltsversion;
- vollständige Referenzauflösung;
- erreichbare Guttis, Start und Abschlussbedingung;
- gültige Charakterzustände und Animationen;
- Ereignisauslöser und Cutscene-Zuordnung;
- fehlende Assets und unzulässige Dateigrößen;
- mindestens einen erfolgreichen Testlauf des aktuellen Snapshots;
- mobile und Desktop-Darstellung ohne harte Geometriefehler.

Probleme verlinken direkt auf den betroffenen Schritt und das betroffene Element. Der
geführte Modus verwendet keine Begriffe wie JSON, Branch, Pull Request oder SHA. Der
Profi-Modus kann diese Diagnostik zusätzlich anzeigen.

### Serverseitiger Ablauf

1. Der Publisher authentifiziert den erlaubten GitHub-Benutzer.
2. Er validiert Snapshot, Revisionen und Abhängigkeiten erneut mit `content-model`.
3. Er speichert die ausgewählten Dokumente in einer wiederverwendbaren
   `publisher/<key>-...`-Branch im Monorepo.
4. Er erzeugt einen Inhalts-PR gegen `main`.
5. Der Monorepo-Workflow prüft Inhaltsmodell, Simulation, Renderer, Spiel, Studio,
   Publisher, Browserfluss und Build.
6. Nur ein vollständig grüner Inhalts-PR wird automatisch übernommen.
7. Ein gemeinsamer Pages-Build veröffentlicht Spiel und Studio atomar.
8. Der Worker markiert die exakten D1-Revisionen erst nach erfolgreichem Deployment als
   veröffentlicht.

Der Vorgang ist idempotent. Ein erneuter Klick erzeugt für denselben offenen Auftrag
keinen zweiten PR. Ein Browser-Neuladen setzt die Statusüberwachung anhand der
D1-Publikationsnummer fort. Konflikte zwischen lokaler und gemeinsamer Revision werden
nicht überschrieben, sondern als Wahl zwischen Aktualisieren, Kopie anlegen und
bewusstem Ersetzen erklärt.

### Fortschrittsdarstellung

Der Nutzer sieht acht fachliche Phasen:

1. Entwurf sichern
2. Abhängigkeiten sammeln
3. Spielbarkeit prüfen
4. Vorschau erzeugen
5. sicher übertragen
6. automatisch testen
7. live schalten
8. im Spiel verfügbar

Jede Phase zeigt Startzeit, letzten bestätigten Status und eine konkrete Erklärung.
Technische Links zu GitHub Actions und PR bleiben im aufklappbaren Detailbereich. Bei
einem Fehler zeigt das Studio, ob eine Korrektur im Inhalt, eine Wiederholung oder Hilfe
des Besitzers notwendig ist.

## Offline- und Updateverhalten

Spiel und Studio erhalten getrennte Service-Worker-Verträge innerhalb desselben
Pages-Artefakts.

Der Spiel-Service-Worker cached ausschließlich versionierte Spielassets und ignoriert
`/studio/` ausdrücklich. Der Studio-Service-Worker besitzt den engeren Scope
`/Geburtstagsspiel/studio/` und cached Studio-Shell, Rendererbundle, lokale Fonts und
gehashte Standardvorlagen.

Folgende Requests werden niemals durch einen Offline-Cache beantwortet:

- `/auth/*` und `/api/*` des Publishers;
- GitHub OAuth und GitHub API;
- Veröffentlichungsstatus;
- D1-Entwurfssynchronisierung;
- nicht versionierte Inhalts- und Build-Manifeste.

Navigation und kleine Einstellungen bleiben in `localStorage`. Größere Projektdokumente,
Sprites, Cutscene-Zustände und lokale Historie werden in IndexedDB gespeichert. Eine
einmalige Migration übernimmt bestehende lokale Entwürfe und behält bis zur bestätigten
Übernahme eine lesbare Sicherung. Der bestehende LocalStorage-Spielstand des Spiels
bleibt unverändert.

Offline-Arbeit ist erlaubt, Offline-Veröffentlichung nicht. Der Editor zeigt klar
`Nur lokal` und synchronisiert nach Rückkehr der Verbindung über die Anwendung. Er
verlässt sich nicht auf Browser-Background-Sync. Ein neuer Service Worker wartet bei
ungesicherten Änderungen. Der Nutzer kann zuerst sichern und dann bewusst aktualisieren.

## Hosting und Deployment

Der Monorepo-Build erzeugt ein gemeinsames Pages-Artefakt:

```text
dist/pages/
├─ index.html                 Spiel
├─ assets/                    versionierte Spielassets
├─ studio/
│  ├─ index.html              Levelwerkstatt
│  └─ assets/                 versionierte Studioassets
└─ build-manifest.json        gemeinsame Build- und Formatkennungen
```

`build-manifest.json` enthält Commit, Buildzeit, Inhaltsformat, Renderer-Vertrag und
Service-Worker-Version. Spiel, Studio und Publisher-Diagnostik können damit den live
ausgelieferten Stand eindeutig anzeigen.

Das alte Editor-Repository veröffentlicht nach dem Cutover nur noch eine statische
Weiterleitung auf `/Geburtstagsspiel/studio/`. Renderer- und Editor-Repositories werden
anschließend schreibgeschützt archiviert. Ihre letzte produktive Commit-ID wird im
Migrationsbericht dokumentiert. Das Cloudflare-Worker-Deployment wird aus
`apps/publisher` im Monorepo ausgeführt.

## CI- und Qualitätsvertrag

Jeder PR installiert einmal am Root und verwendet denselben Lockfile. Pfadfilter dürfen
Tests ergänzen oder parallellisieren, aber keine erforderliche Integrationsprüfung
umgehen.

### Paket- und Vertragstests

- `content-model`: Schema, Referenzen, Migrationen und verständliche Fehler;
- `game-core`: deterministische 60-/120-Hz-Simulation und Levelabschluss;
- `pixel-renderer`: Kamera, Backends, DPR, Effekte und PresentationFrame;
- `render-coordinator`: Sichtbarkeit, Kadenz und Einmal-Rendering;
- Paketgrenzentest gegen direkte App-zu-App-Imports;
- Root-Test, dass genau ein Lockfile und genau eine Workspace-Auflösung existieren.

### Integrations- und Browsertests

- dieselbe Golden Scene liefert in Spiel und Studio dieselbe Kamera und
  Entityprojektion;
- Radaranker stimmen mit den gerenderten Katzenkoordinaten überein;
- Editor-Testspiel und Spiel erreichen für denselben Input denselben Zustand;
- geführter Weg von Projektanlage bis veröffentlichungsfähigem Snapshot;
- Profi-/Guide-Wechsel ohne Datenverlust;
- Undo/Redo für Einzel-, Mehrfach-, Text-, Objekt- und Animationsoperationen;
- Publisher-Login, D1-Konflikt, Batch, Abbruch, Wiederaufnahme und Fehlerstatus;
- Service-Worker-Installation, Update, Offline-Studio und striktes API-Bypass;
- Portrait, Landscape, DPR 1 bis 3, reduzierte Bewegung, Canvas2D und WebGL2;
- WebGPU, sofern im Runner verfügbar, sonst strukturierter Skip.

Renderer- oder `game-core`-Änderungen lösen immer die vollständigen Spiel- und
Studio-Browsermatrizen aus. Inhalts-PRs verwenden denselben Validator und mindestens
einen automatischen kompletten Spielablauf des betroffenen Levels.

### Performancebudgets

- statische Studio-Miniaturen präsentieren nach dem initialen Bild nicht weiter;
- verdeckte Arbeitsbereiche erzeugen keine Rendererframes oder GPU-Uploads;
- Pointer-Interaktion aktualisiert die aktive Vorschau im nächsten Präsentationsframe;
- Testspiel und echtes Spiel besitzen dieselben Pacinggrenzen;
- Radarpositionen folgen jeder tatsächlichen Präsentation ohne Layout-Read im Hot Path;
- fünf Sekunden Pause oder Karte erzeugen keine fortlaufenden Weltuploads;
- Studio-Start und Routewechsel erzeugen keine unerwarteten Layoutverschiebungen;
- Publisher- und API-Requests werden nie aus dem Service-Worker-Cache beantwortet.

## Fehlerbehandlung und Wiederherstellung

- Ein inkompatibles Inhaltsformat stoppt mit Exportmöglichkeit statt stiller Migration.
- Renderer-Fallbackgründe bleiben in Spiel und Studio sichtbar diagnostizierbar.
- Ein fehlgeschlagener Inhalts-PR verändert weder `main` noch die veröffentlichte
  D1-Revision.
- Ein fehlgeschlagenes Pages-Deployment lässt das vorherige Artefakt live.
- Ein abgebrochener Tab kann Entwurf und Publikationsstatus wieder aufnehmen.
- D1-Konflikte werden revisionsbasiert behandelt; Last-Write-Wins ist verboten.
- Service-Worker-Fehler reduzieren nur Offlinefähigkeit, nicht Editor oder Publisher.
- Migrationen besitzen Vorher-/Nachher-Zähler, Prüfsummen und einen trockenen Lauf.

## Sicherheit

Private GitHub-App-Schlüssel, Client Secret und Session Secret verbleiben ausschließlich
im Cloudflare Worker. Das Studio erhält nur die öffentliche Worker-URL. Zulässige
GitHub-Logins bleiben serverseitig begrenzt. CORS akzeptiert nur den GitHub-Pages-Origin
mit dem neuen Studio-Prefix.

Der Publisher akzeptiert ausschließlich bekannte Inhaltstypen, sichere IDs, begrenzte
Payloadgrößen und erwartete Revisionen. PR-Pfade werden aus validiertem Typ und ID
gebildet. Service Worker, Browsercache und lokale Projektspeicherung enthalten keine
OAuth- oder GitHub-App-Secrets.

## Barrierefreiheit und Sprache

Der geführte Modus verwendet klare Standardsprache als Default. Der vorhandene
Niederbairisch-Schalter bleibt eine Darstellungspräferenz und verändert keine IDs,
Validierung oder Projektdateien. Technische Fachbegriffe werden erklärt oder in den
Profi-Details verborgen.

Alle Schritte, Werkzeugleisten, Dialoge, Fortschrittszustände und Canvas-Alternativen
sind per Tastatur erreichbar und besitzen benannte Statusmeldungen. Farbe allein zeigt
keinen Fehler oder Fortschritt. Reduced Motion pausiert nicht notwendige Vorschau- und
Studioanimationen.

## Migration und Cutover

Die Migration erfolgt in überprüfbaren, rückrollbaren Grenzen:

1. Monorepo-Workspaces und Root-CI ohne Verhaltensänderung anlegen.
2. Den verifizierten Rendererstand als `packages/pixel-renderer` übernehmen.
3. `content-model` und `game-core` aus den vorhandenen Verträgen extrahieren.
4. Das Spiel nach `apps/game` verschieben und die bestehende Pages-Ausgabe vergleichen.
5. Studio und Publisher nach `apps/studio` und `apps/publisher` übernehmen.
6. Gemeinsamen RenderCoordinator und PresentationFrame in Spiel und Studio verdrahten.
7. Katzenradar auf Rendererprojektionen umstellen.
8. Inhaltsdateien nach `content/*` migrieren und Prüfsummen vergleichen.
9. Geführten Modus und neuen Publikations-Preflight aktivieren.
10. Service-Worker-Scopes und kombiniertes Pages-Artefakt testen.
11. Worker-Variablen auf den neuen Studio-Prefix umstellen.
12. Produktions-Cutover durchführen, alte Editor-URL weiterleiten und alte Repositories
    archivieren.

Vor dem Cutover werden bestehende lokale Entwürfe, D1-Revisionen, veröffentlichte
Inhalte, Spielstände, OAuth-Rücksprung und beide Live-URLs in einer realen
Browser-Migrationsmatrix geprüft.

## Abnahmekriterien

Das Vorhaben ist abgeschlossen, wenn:

- Spiel, Studio und Publisher aus demselben Commit und Lockfile gebaut werden;
- kein Git-Pin auf ein externes Renderer-Repository mehr existiert;
- Spiel und Studio exakt dasselbe lokale Renderer- und Game-Core-Paket verwenden;
- das Katzenradar in Position und Kadenz mit dem PresentationFrame übereinstimmt;
- der geführte Weg ein neues Projekt bis zur Veröffentlichung vollständig abdeckt;
- der Profi-Modus alle bisherigen Arbeitsbereiche ohne Datenverlust anbietet;
- bestehende lokale und D1-Entwürfe migriert oder sicher exportiert werden können;
- eine Veröffentlichung ohne Git-Kenntnisse erstellt, geprüft, übernommen und live
  bestätigt wird;
- Spiel und Studio gemeinsam auf GitHub Pages laufen;
- der Publisher nach Reload, Konflikt und fehlgeschlagenem CI verständlich fortsetzen
  kann;
- Offline-Cache niemals OAuth-, API- oder Publikationsantworten liefert;
- alle Unit-, Integrations-, visuellen, Browser-, Performance- und Migrationsgates grün
  sind;
- die alten Quellrepositories erst nach erfolgreichem Cutover archiviert werden.

## Nicht Bestandteil dieses Vorhabens

- Echtzeit-Mehrbenutzerbearbeitung im selben Dokument;
- Veröffentlichung des internen Renderers als öffentliches npm-Paket;
- native Mobile-Apps oder Desktop-Installer;
- ein eigener Asset-Marktplatz;
- ein vollständiger Ersatz von GitHub Pages oder Cloudflare Worker;
- eine neue Game-Engine oder ein vollständiger GPU-Sprite-Batcher.
