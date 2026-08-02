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

Beim Start eines Levels erscheint zunächst eine Ortskarte mit animierter Wisch-Erklärung. Danach wechselt die mobile Ansicht in einen scrollgesperrten Fokusmodus: Das Canvas belegt den kompletten Bildschirm, während eine Kamera Franz und Lola durch die quadratische Spielwelt begleitet. Im Hochformat bleiben seitliche, im Querformat obere und untere Weltbereiche außerhalb des aktuellen Kamerafensters. Dadurch wird das Level weder verzerrt noch von schwarzen Balken eingerahmt. Farbige Katzen-Radarindikatoren erscheinen an den Rändern, sobald eine Katze außerhalb des Kameraausschnitts liegt; Pfeilrichtung und Distanzzahl zeigen ihre vermutete Position. Die frühere untere Aktionsleiste entfällt zugunsten des Zahnrad-Menüs. Unterstützte Browser öffnen zusätzlich den nativen Vollbildmodus.

Die Spielwelt behält intern eine feste logische Auflösung von 600 × 600 Pixeln und wird zunächst in einen unsichtbaren Pixelpuffer gezeichnet. Das sichtbare Canvas besitzt dagegen immer die Größe des aktuellen Viewports und zeigt daraus einen proportional skalierten Kameraausschnitt. Spielkoordinaten und Kollisionen müssen dadurch nicht umgebaut werden. Die Anwendung bleibt ohne Serverlogik und ohne zusätzliche Laufzeitbibliothek vollständig statisch und weiterhin direkt über GitHub Pages auslieferbar.

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

## Technik

- Vanilla JavaScript und Canvas
- Vite als kleiner Build-Schritt
- Keine Laufzeit-Abhängigkeiten, keine externen Bildassets
- HiDPI-Canvas, Touch-/Swipe-Steuerung, Tastatursteuerung und lokaler Highscore
