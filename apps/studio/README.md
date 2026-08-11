# Franz & Lola · Game Studio

Statisches No-Code-Studio für das gemeinsame `franz-lola-level`-JSON-Format. Svelte 5 hält den Dokumentzustand synchron; Level, Objekte, Figuren, Cutscenes, Ereignisse, Testspiel und Veröffentlichung besitzen klar getrennte Arbeitsbereiche. Das Studio verwendet denselben Canvas-Renderer wie das Spiel, läuft weiterhin statisch auf GitHub Pages und verbindet angemeldete Redaktionsgeräte über eine kleine Cloudflare-D1-Datenbank.

## Von der Idee zum spielbaren Level

- Alle neun Originallevel aus `Geburtstagsspiel` als verlustfreie Vorlagen
- Stift, Linie, Rechteck, Flächenfüllung und Radierer für Wände
- Franz & Lola, beliebig viele Katzen und Schnüffel-Power frei platzierbar
- Universelle Objektbibliothek mit echten Renderer-Vorschauen: normale Musiknote, originale Zauberberg-Note, Bühnenlicht, Eisvogel und eigene Pixelobjekte sind in jeder Karte verwendbar
- Eigene Spezialobjekte mit Sprite-Sheet, Palette, zeitbasierten Bild-Keyframes und Transform-Keyframes für Position, Größe, Drehung und Deckkraft
- Frei bewegliche Standard-/Dialekt-Textblöcke mit Schriftgröße, Ausrichtung, Farbe sowie unabhängig ausblendbarem Hintergrund und Rahmen; standardmäßig erscheint nur der scharfe Text
- Bäume, Bänke, Lampen, Blumen, Schilder, Felsen, Wasserflächen und freie Symbole
- Eigener Franz-&-Lola-Charakterbereich mit echten Renderer-Vorschauen in Figurenliste, Detailansicht, Sprite-Playback und allen frei bearbeitbaren Zuständen für Idle, Oben, Rechts, Unten und Links
- Sichtbarer Figuren-Assistent mit Name und den Startvorlagen Pixelwesen, leere Leinwand oder Franz-&-Lola-Kopie
- Globale Figurenbibliothek: Eine Figur wird einmal gestaltet und kann anschließend in beliebig vielen Levels platziert werden
- Eigene Figuren sind technisch von Katzen getrennt, werden nicht als Gegner gezählt und bleiben als selbstenthaltende `actors.characters`-Instanzen auch auf GitHub Pages vollständig renderbar
- Eigene Pixel-Figuren mit Palette, benannten Animationen, Keyframe-Timeline, Scrubbing, Playback und Schleifenmodus
- Rechteckige und additive Pixel-Mehrfachauswahl: gleiche Farben finden, Auswahl umfärben, löschen, verschieben oder invertieren
- Levelgebundene Cutscenes für den Übergang von Passau-Karte zu Level
- Timeline mit Kamera-, Figuren-, Objekt- und Dialogspuren, Keyframes, Easing und zweisprachigen Texten
- Verhalten pro Figur: direkte Steuerung, Autopilot, Patrouille sowie unterschiedliche Jagd-, Hinterhalt-, Wach-, Streu- und Zufallsstrategien
- Direkte Auswahl aller Spezialelemente im Canvas – einschließlich Zauberberg-Musiknote und Bühnenlichtern
- Animierbare Dekorationen und fest eingebaute Kulissenelemente mit Schweben, Pulsieren, Blinken und Drehen
- Stapelbare visuelle Effekte für Figuren, Katzen, Objekte und Ereignissymbole: Glitch, Neon, Hologramm, Echo und Funkeln
- Animierte Levelränder mit Wasserströmung, springenden Fischen, Booten, Blättern, Glühwürmchen, Nebel, Vögeln, Stadtlichtern, Dampf, Funken und Bühnenpuls
- No-Code-Ereignisse mit Triggerzonen, Tast-/Wischfolgen oder Zeittriggern, Punktbelohnungen und globalem, Level- oder Rundengültigkeitsbereich
- Standarddeutsche und niederbairische Ereignistexte sowie Eisvogel-, Pfoten-, Glocken- oder frei gestaltbare Symbole
- Frei anpassbare Physikprofile pro Schwierigkeit (Tempo, Katzenzahl, Leben, Power-Dauer, Zufall und Startschutz)
- Freie Raster von 9×9 bis 45×45, Tunnelzeilen, Farben, Landmarken und Kartenkoordinaten
- Live-Vorschau für 70, 110 oder 160 Guttis mit exakt derselben Verteilung wie im Spiel
- Integrierter Testlauf mit derselben Cutscene-Wiedergabe, Kamera, demselben Renderer und derselben 120-Tick-Simulation wie das Spiel
- Spielkamera, Ganzlevel-Ansicht, nativer Vollbildmodus, Pause, Touch-Buttons und direkte Wischsteuerung während der Fingerbewegung
- Live-Prüfung auf Erreichbarkeit, Kollisionen, Gutti-Kapazität und Randüberschreitungen
- Transaktionsbasiertes Undo/Redo: ein kompletter Zeichenstrich ist ein Schritt
- Gemeinsame, automatisch versionierte D1-Entwürfe und Content-Bibliotheken für mehrere Personen und Geräte; veraltete Revisionen werden sichtbar blockiert, lokale Varianten bleiben als Kopie erhalten
- Mehrere automatisch gespeicherte `localStorage`-Entwürfe als Offline- und Wiederherstellungsnetz
- Import/Export einzelner Level sowie Export des vollständigen Originalkatalogs
- Sicheres Veröffentlichen per Knopfdruck: Level, Figuren, Tilesets, Blöcke, Animationen, Cutscenes und Objekte typisiert auswählen; Anmeldung, gemeinsamer Pull Request, Prüfung, Merge und GitHub-Pages-Deploy laufen geführt und automatisch
- Responsive Oberfläche für Maus, Tastatur, Stift und Touch

Die Originalvorlagen enthalten auch die ursprünglichen Geheimnisse: den Eisvogel an der Ilz, Lolas Lieblingsplatz und die Passauer Kirchenglocken – jeweils mit Originaltrigger, Belohnung und beiden Sprachfassungen. Zusätzlich besitzt jedes der neun Level eine eigene neue Ereignisidee, einen frei beweglichen Textblock und eine individuelle Intro-Cutscene mit unterschiedlicher Dauer, Trackzahl und Dramaturgie. Der Zauberberg besitzt in Editor und Testlauf seine beiden Bühnenlichtkegel, Lautsprecher, Verstärker und sowohl die generische als auch die originalgetreue Musiknote.

Eine bloß geöffnete Originalvorlage wird nicht als Entwurf gespeichert. Erst die erste echte Änderung erzeugt eine lokale Kopie; über „Originalvorlage wiederherstellen“ lässt sie sich jederzeit zurücksetzen.

## Entwicklung

```bash
npm install
npm run dev
```

Vollständige Prüfung:

```bash
npm test              # Fachtests: Modell, Katalog, Keyframes, Objekte, Speicher und Testlauf
npm run test:e2e      # echte Chromium-Abläufe inklusive aller neun Level, Publisher und Mobile
npm run test:visual   # visuelle Belege für Text/Transformation, Publisher, Figuren-Assistent, Ereignisse und Cutscenes unter output/playwright
npm run build         # statischer GitHub-Pages-Build
```

`npm run catalog:generate -- ../Pacman_clone/src/main.js src/data/passau-levels.json` erzeugt die neun Vorlagen deterministisch aus dem Spielcode. Der geprüfte Quellstand wird über einen SHA-256-Hash im Katalog festgehalten.

## Austauschformat

Ein Export ist normales, versioniertes JSON mit `kind: "franz-lola-level"` und `schemaVersion: 1`. Eigenständig veröffentlichte Bibliothekseinträge verwenden den typisierten Wrapper `franz-lola-content`. Beide Verträge besitzen ein JSON Schema und enthalten keine ausführbare Logik. Jede platzierte Figur und jedes verwendete Objekt wird weiterhin vollständig in das Level kopiert; die statische Spielseite benötigt deshalb weder D1 noch Browser-Speicher oder zusätzliche Asset-Anfragen.

## Veröffentlichen ohne Repository-Zugriff

Der Editor kann mit dem kleinen Cloudflare Worker in [`publisher/`](publisher/) verbunden werden. Die Redaktion meldet sich über GitHub an und sieht danach dieselben Levelentwürfe, Figuren und Objekte auf allen Geräten. D1 schützt jeden eigenständigen Inhalt mit einer Revision; GitHub hält die statische veröffentlichte Projektion und übernimmt Prüfung, Historie und Deployment. GitHub-App-Schlüssel gelangen nie in den Browser; die kurzlebige Editorsitzung bleibt nur im Arbeitsspeicher des Tabs. Die einmalige Einrichtung für den Besitzer ist in [`publisher/README.md`](publisher/README.md) beschrieben.
