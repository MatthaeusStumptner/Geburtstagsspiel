# Franz & Lola – Gassi-Runde Passau

Ein responsives Pixel-Art Maze-Chase-Spiel aus Passau. Franz und sein Maltipoo Lola sammeln auf ihrer Abendrunde Guttis und halten Abstand zu den Nachbarskatzen.

Über eine geografisch angeordnete Passau-Karte stehen neun Level zur Auswahl: Dahoam am Bramerhof, Hals & Ilz, Veste Oberhaus, Dom St. Stephan, Dreiflüsseeck, Universität & Inn, Bschüttpark, Tabakfabrik sowie Zauberberg. Die Karte ist stilisiert, die Markerabstände werden jedoch aus Ortskoordinaten projiziert. Das Zuhause von Franz und Lola ist als zentraler Schauplatz umgesetzt; zum Schutz einer privaten Wohnadresse wird in der öffentlich hostbaren App keine Hausnummer veröffentlicht.

Die Level besitzen eigene Themen und Pixelkulissen. Im Bschüttpark stehen Grünflächen, Streetball und Betonrampen im Mittelpunkt. Die Tabakfabrik erscheint als Backstein- und Proberaumkulisse. Im Zauberberg leuchten Bühne, Verstärker, Lautsprecher und Scheinwerfer zu Rock, Punk und Metal.

## Lokal starten

```bash
npm install
npm run dev
```

Der Produktions-Build wird mit `npm run build` erzeugt und landet in `dist/`.

## Steuerung

- Desktop: Pfeiltasten oder WASD, `P`/Leertaste zum Pausieren
- Mobile: Wischen direkt auf dem Spielfeld
- Karte: Karten-Symbol auf Desktop oder Mobile
- Die große mintfarbene Pfote aktiviert für acht Sekunden die Schnüffel-Power

Beim Start eines Levels wechselt die mobile Ansicht in einen scrollgesperrten Fokusmodus: Das quadratische Spielfeld nutzt im Hochformat die komplette Gerätebreite und im Querformat die maximal verfügbare Höhe. Eine kompakte Aktionsleiste für Pause, Ton und Karte ersetzt das frühere Steuerkreuz. Unterstützte Browser öffnen zusätzlich den nativen Vollbildmodus; eine feste Schaltfläche in der Kopfzeile führt jederzeit zurück zur Passau-Karte. Hoch- und Querformat besitzen dafür eigene Layouts.

Das Canvas behält intern eine feste logische Auflösung von 600 × 600 Pixeln. Das mobile Layout skaliert diese Bühne proportional mit CSS, ohne die Spielkoordinaten oder Kollisionen umzubauen. Dadurch bleibt die Anwendung ohne Serverlogik und ohne zusätzliche Laufzeitbibliothek vollständig statisch und weiterhin direkt über GitHub Pages auslieferbar.

Wischrichtungen werden bereits während der Fingerbewegung mit kurzer Aktivierungsdistanz verarbeitet. Dadurch lassen sich auch mehrere Richtungswechsel in einer einzigen durchgehenden Geste vorbereiten.

Die Oberfläche lässt sich jederzeit zwischen schönem Deutsch und Niederbairisch umschalten. Natürlich mit der gebotenen wissenschaftlichen Strenge zur Frage, ob Letzteres überhaupt eine richtige Sprache ist.

Es gibt drei Schwierigkeitsstufen:

- **Spaziergang / Gmiatlich:** zwei Katzen, fünf Leinen, 70 Guttis und lange Schnüffel-Power
- **Gassirunde:** drei Katzen, drei Leinen, 110 Guttis und ausgewogenes Tempo
- **Abenteuer / Sakrisch:** drei schnelle Katzen, zwei Leinen und 160 Guttis

Die Ortsnummer verändert die Geschwindigkeit nicht mehr. Alle platzierten Guttis werden vor Levelbeginn über eine Wegsuche auf Erreichbarkeit geprüft. Nach dem letzten Gutti erscheint der Abschlussdialog und der Ort wird dauerhaft auf der Passau-Karte abgehakt.

Der globale Passau-Fortschritt wird im HUD und als Prozentbalken in der Missionskarte angezeigt. Sind alle neun Orte geschafft, erscheint ein eigener 100%-Abschluss für Franz und Lola. Über „Neuer Spielstand“ lassen sich Punkte, Orts-Häkchen und Geheimnisse nach einer Sicherheitsabfrage zurücksetzen; Sprache, Ton und gewählte Schwierigkeit bleiben dabei erhalten.

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
