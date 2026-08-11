# Franz & Lola – Gassi-Runde Passau

Ein responsives Pixel-Art Maze-Chase-Spiel aus Passau. Franz und sein Maltipoo Lola sammeln auf ihrer Abendrunde Guttis und halten Abstand zu den Nachbarskatzen.

Über eine geografisch angeordnete Passau-Karte stehen neun Level zur Auswahl: Dahoam am Bramerhof, Hals & Ilz, Veste Oberhaus, Dom St. Stephan, Dreiflüsseeck, Universität & Inn, Bschüttpark, Tabakfabrik sowie Zauberberg. Die Karte ist stilisiert, ihre Markerabstände werden jedoch maßstabsgetreu aus WGS84-Ortskoordinaten projiziert. Längengrade werden dabei mit dem Passauer Breitengrad korrigiert; SVG, Marker und der 1-km-Maßstab verwenden in jedem Seitenverhältnis dieselbe Projektion. Sie bildet die vollbreite Hauptansicht der Oberfläche; Schwierigkeit, Sprache, Steuerung, Pause, Ton und das Zurücksetzen des Spielstands liegen gesammelt im Zahnrad-Dialog. Das Zuhause von Franz und Lola ist als zentraler Schauplatz umgesetzt; zum Schutz einer privaten Wohnadresse wird in der öffentlich hostbaren App keine Hausnummer veröffentlicht.

Die Level besitzen eigene Themen und Pixelkulissen. Im Bschüttpark stehen Grünflächen, Streetball und Betonrampen im Mittelpunkt. Die Tabakfabrik erscheint als Backstein- und Proberaumkulisse. Im Zauberberg leuchten Bühne, Verstärker, Lautsprecher und Scheinwerfer zu Rock, Punk und Metal.

Beim ersten Start ohne vorhandenen Spielstand erscheint eine scherzhafte, bewusst
geheimnisvolle Zutrittskontrolle der „Kommunalen Sonderstelle · Vorgang 60“. Nur
`Franz` und das Alter `60` öffnen die versiegelte Akte. Sprache und globaler
Schwierigkeitsgrad werden davor als unverfängliche Verfahrensparameter gewählt, ohne
das Spiel bereits zu verraten. Anschließend führt eine dreiseitige kleine Geschichte
durch Auftrag, Steuerung und Einsatzmittel. Erst der letzte Freigabeknopf startet den
eigentlichen Spielablauf auf der Passau-Karte und speichert die Einrichtung im Browser,
sodass sie bei späteren Besuchen übersprungen wird.

## Lokal starten

```bash
npm install
npm run dev
```

Der Produktions-Build wird mit `npm run build` erzeugt und landet in `dist/`.
`npm run verify` führt zusätzlich alle Node-Tests, den Produktions-Build und die reale
Chromium-Matrix aus.

Die Einweisung lässt sich auch in der veröffentlichten Version mit
`?onboarding=1` erneut öffnen. Bei einem bereits vorhandenen Spielstand läuft sie dann
als sichere Vorschau: Fortschritt und bisherige Einstellungen bleiben unangetastet,
und nach der letzten Seite kehrt die App automatisch zur normalen Spieladresse zurück.

Die sichtbare Versionsnummer wird beim Vite-Build automatisch aus den Commits auf dem
ersten Elternpfad von `main` berechnet. Ausgangspunkt ist die erste Pages-Version
`V0.6`; jeder nachfolgende Main-Commit erhöht die letzte Stelle um eins. Der
GitHub-Pages-Workflow checkt dafür die vollständige Historie aus.

## Steuerung

- Desktop: Pfeiltasten oder WASD, `P`/Leertaste zum Pausieren
- Mobile: Wischen direkt auf dem Spielfeld
- Menü: Zahnrad im mobilen Level; dort liegen Pause, Ton, Steuerung und die Rückkehr zur Karte
- Die große mintfarbene Pfote aktiviert für acht Sekunden die Schnüffel-Power

Beim Start eines Levels erscheint zunächst eine Ortskarte mit animierter Wisch-Erklärung. Danach wechselt die mobile Ansicht in einen scrollgesperrten Fokusmodus: Das DOM-HUD bleibt oberhalb des Spielfelds, und das Canvas belegt exakt den verbleibenden sichtbaren Bereich. Eine Kamera begleitet Franz und Lola durch die quadratische Spielwelt. Im Hochformat bleiben seitliche, im Querformat obere und untere Weltbereiche außerhalb des aktuellen Kamerafensters. Dadurch wird das Level weder verzerrt noch von schwarzen Balken eingerahmt. Farbige Katzen-Radarindikatoren erscheinen an den Rändern, sobald eine Katze außerhalb des Kameraausschnitts liegt; Pfeilrichtung und Distanzzahl zeigen ihre vermutete Position. Die frühere untere Aktionsleiste entfällt zugunsten des Zahnrad-Menüs. Ein eigener Vollbildmodus ist für diese Darstellung nicht erforderlich; aktuell bietet die App deshalb keinen separaten Vollbildknopf an.

Die Spielwelt behält intern eine feste logische Auflösung von 600 × 600 Pixeln und wird zunächst in einen unsichtbaren Pixelpuffer gezeichnet. Das sichtbare Canvas besitzt dagegen immer die Größe des nach dem DOM-HUD verbleibenden Spielbereichs und zeigt daraus einen proportional skalierten Kameraausschnitt. Spielkoordinaten und Kollisionen müssen dadurch nicht umgebaut werden. Die Anwendung bleibt ohne Serverlogik vollständig statisch und weiterhin direkt über GitHub Pages auslieferbar.

Renderer, Kamera, Figurenbewegung, Katzen-KI, Ereignissymbole und der feste 120-Tick-Simulationsschritt stammen aus dem gemeinsamen Paket `@franz-lola/pixel-renderer`. Das Spiel pinnt den geprüften Renderer unveränderlich auf Commit `925b1708dd8cd60f9cf4b0168d7674d8656ebdf2`; derselbe Kern läuft im Level-Editor. Bei 60-Hz-Displays werden meist zwei Simulationsschritte pro Bild verarbeitet, bei 120 Hz einer und bei höheren Frequenzen entsprechend verteilt; das Spieltempo folgt immer der real verstrichenen Zeit. Die Präsentation bleibt unabhängig davon auf höchstens 60 FPS begrenzt, im Performanceprofil auf 30 FPS.

Die ursprünglichen Passau-Geheimnisse sind zugleich Teil des gemeinsamen Level-Formats: Eisvogel, Lolas Lieblingsplatz und Kirchenglocken besitzen dort ihre Trigger, Bonuspunkte, Standard-/Dialekttexte und Pixel-Darstellung. Damit lassen sie sich in der Levelwerkstatt vollständig anzeigen, testen und verändern.

Wischrichtungen werden bereits während der Fingerbewegung mit kurzer Aktivierungsdistanz verarbeitet. Dadurch lassen sich auch mehrere Richtungswechsel in einer einzigen durchgehenden Geste vorbereiten.

Die Oberfläche lässt sich jederzeit zwischen schönem Deutsch und Niederbairisch umschalten. Natürlich mit der gebotenen wissenschaftlichen Strenge zur Frage, ob Letzteres überhaupt eine richtige Sprache ist.

Es gibt drei Schwierigkeitsstufen:

- **Spaziergang / Gmiatlich:** zwei Katzen, fünf Leinen, 70 Guttis und lange Schnüffel-Power
- **Gassirunde:** drei Katzen, drei Leinen, 110 Guttis und ausgewogenes Tempo
- **Abenteuer / Sakrisch:** drei schnelle Katzen, zwei Leinen und 160 Guttis

Die Ortsnummer verändert die Geschwindigkeit nicht mehr. Alle platzierten Guttis werden vor Levelbeginn über eine Wegsuche auf Erreichbarkeit geprüft. Nach dem letzten Gutti erscheint der Abschlussdialog und der Ort wird dauerhaft auf der Passau-Karte abgehakt.

Der globale Passau-Fortschritt wird im HUD und als Prozentbalken in der Missionskarte angezeigt. Sind alle neun Orte geschafft, erscheint ein eigener 100%-Abschluss für Franz und Lola. Über „Neuer Spielstand“ lassen sich Punkte, Orts-Häkchen und Geheimnisse nach einer Sicherheitsabfrage zurücksetzen; Sprache, Ton und gewählte Schwierigkeit bleiben dabei erhalten. Die getrennte Funktion „Alle Browserdaten löschen“ entfernt nach einer besonders deutlichen Bestätigung sämtliche von diesem Spiel gespeicherten Daten und startet anschließend wieder bei Vorgang 60.

Der komplette laufende Spielstand wird automatisch im LocalStorage des Browsers gesichert: aktiver Ort, abgeschlossene Level, Schwierigkeit, Sprache, Positionen, verbleibende Guttis, Gutti-Gesamtzahl, Punkte, Leben, Sound-Einstellung und bereits entdeckte Passau-Geheimnisse. Beim nächsten Besuch kann die Runde direkt fortgesetzt werden.

## GitHub Pages

Der Workflow unter `.github/workflows/deploy.yml` baut und veröffentlicht die App bei jedem Push auf `main`.

1. Repository auf GitHub anlegen und diesen Ordner hochladen.
2. Unter **Settings → Pages → Build and deployment** als Quelle **GitHub Actions** auswählen.
3. Auf `main` pushen. Der Workflow veröffentlicht anschließend den Inhalt aus `dist/`.

Alle URLs sind relativ und funktionieren deshalb auch unter einer Projekt-URL wie `https://name.github.io/repository/`.

Der generierte Service Worker cached ausschließlich die gehashten Dateien unter
`/assets/`. Navigationen, HTML, JSON und veröffentlichte Levelinhalte werden immer aus
dem Netz geladen. Bei einem neuen Deployment installiert der Browser einen neuen,
inhaltlich versionierten Asset-Cache und entfernt nur ältere Caches dieses Spiels;
LocalStorage-Spielstände werden nicht verändert. Schlägt Registrierung oder Cache fehl,
läuft das Spiel weiterhin online ohne Offline-Cache.

## Performance und Diagnose

Der Audit vom 11. August 2026 lief mit Chromium 151 in einem kalten mobilen Kontext bei
412 × 915 CSS-Pixeln, DPR 2,625, Fast 4G und vierfacher CPU-Drosselung. Der passive Lauf
maß TTFB 7,2 ms, FCP 1.248 ms, LCP 1.860 ms und CLS 0,0023. Zwei Long Tasks nach FCP
ergaben über ihre jeweilige 50-ms-Grenze eine TBT-Näherung von 357 ms; ein weiterer
221-ms-Task lag vor FCP. LCP ≤ 2.500 ms und CLS ≤ 0,10 sind bestanden. Das ist eine
lokale Labormessung ohne CrUX-Felddaten oder Lighthouse-Performance-Score; der lokale
Prüfserver komprimiert Antworten bewusst nicht. Dokument plus sechs Page-Ressourcen
übertrugen 494.774 Byte, ohne Hintergrundverkehr der Service-Worker-Installation.

Der ursprünglich sichtbare Silkscreen-700-Fallback wurde belegt und behoben: Vor dem
Fix lag FCP bei 1.136 ms, während der Font noch bis 1.303 ms lud. Die quellstabilen
Preloads für beide im ersten Gameplay-Frame sichtbaren Silkscreen-Schnitte werden von
Vite auf gehashte relative Assetpfade umgeschrieben. Im finalen mobilen Lauf endeten
Silkscreen 400 bei 431 ms und Silkscreen 700 bei 447 ms, deutlich vor FCP. Eine separate
Font-Timeline zeigte beim ersten und bei allen später eingeblendeten Textframes keine
noch fehlende verwendete Schrift. Ein zusätzlich kalter Desktop-Restore eines
Gameplay-Saves maß FCP 1.204 ms, LCP 1.668 ms und CLS 0,00088; die verdeckte äußere
App-Shell blieb dabei von Beginn an außerhalb des Layout-Flows.

In der realen Fünf-Sekunden-Matrix schliefen Karte und Pause auf WebGL2 und Canvas2D
vollständig: beide erzeugten 0 zusätzliche Präsentationen, WebGL2 zusätzlich 0
Upload-Bytes und 0 Textur-Reallokationen. Canvas2D besitzt keine GPU-Upload- oder
Textur-Reallokationszähler; diese Rohwerte bleiben dort `null` beziehungsweise nicht
anwendbar. Aktives WebGL2 präsentierte 203 Frames in 5,045 Sekunden bei 0
Reallokationen, Canvas2D 301 Frames in 5,014 Sekunden. Beide blieben in diesen stabilen
Messfenstern ohne Long Task, Context Loss oder Backend-Fallback. Bei 412 × 915 und
Qualitätsprofil misst das Spiel nach dem HUD ein Canvas von 412 × 727 CSS-Pixeln. Der
tatsächliche DPR bleibt 2,625, der auf 2 begrenzte Renderer-DPR erzeugt einen Backbuffer
von 824 × 1.454 Pixeln.

In einem lokalen Entwicklungsserver stehen zwei read-only Diagnosefunktionen bereit:

- `window.__GASSI_RENDERER_DEBUG__()` liefert Backend, Fallback/Context-Loss, Qualität,
  tatsächlichen und effektiven DPR, Backbuffer, Frame-/Upload-/Reallocation-/Cache-Zähler,
  Schedulergrund und Renderpolitik.
- `window.__GASSI_DEBUG__()` liefert Spielzustand, Spielerposition, Fortschritt,
  Gutti-/Leben-Zähler und gespeicherten Zustand.

Diese Hooks sind absichtlich nicht Bestandteil des Produktions-Builds.

## Technik

- JavaScript-Module, Svelte 5 für DOM-Oberflächen und Canvas für das Spielbild
- Vite als kleiner Build-Schritt
- Gemeinsamer Renderer- und Simulationskern, keine externen Bildassets
- HiDPI-Canvas, Touch-/Swipe-Steuerung, Tastatursteuerung und LocalStorage-Spielstand
