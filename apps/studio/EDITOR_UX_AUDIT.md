# UX-Audit: Franz & Lola Levelwerkstatt

Stand: 9. August 2026

## Vorgehen

Der Editor wurde nicht nur anhand vorhandener Tests beurteilt. Die sieben Arbeitsbereiche wurden auf Desktop und 390-Pixel-Mobile geöffnet und als Benutzer durchgespielt: Projekt laden, Szene auswählen, Objekt anlegen, Sprite zeichnen, Figur erstellen und platzieren, Cutscene bearbeiten, Ereignis auslösen, Testlauf starten und Veröffentlichung öffnen. Gefundene Sackgassen wurden zunächst reproduziert, dann neu gestaltet und anschließend als Regressionstest festgehalten.

## Gefundene reale Bedienabbrüche

| Problem | Auswirkung | Änderung |
| --- | --- | --- |
| „Neues Asset“ speicherte sofort einen Dummy | Abbrechen hinterließ unlöschbare Geistereinträge | Transaktionaler Assistent; Persistenz erst nach „Sprite übernehmen“ |
| Objekteditor startete mit 12×12 | Detaillierte 24×24-Figuren waren über das UI nicht reproduzierbar | 24×24 als Standard sowie 8/12/16/24-Auswahl |
| Pixelwerkzeuge waren auf Einzelpixel und Auswahl begrenzt | 24×24-Zeichnungen waren praktisch nicht herstellbar | Linie, Rechteck, gefülltes Rechteck, Flood Fill, Pipette, Copy/Paste, Palette bearbeiten/löschen |
| Undo/Redo galt nicht zuverlässig für globale Definitionen | Asset- und Figurenänderungen ließen sich nicht sicher zurücknehmen | Gemeinsame `StudioHistory` für Level, Objekte und Figuren |
| Canvas hatte keine Kameraarbeit | Große/ungünstige Layouts ließen sich nicht präzise bearbeiten | Zoom, Mausrad, Pan, Leertaste, mittlere Maustaste und Einpassen |
| Tests klickten bei Letterboxing neben Objekte | Auswahl- und Transformtests waren scheinbar zufällig | Browser-Tooling verwendet nun die echte Renderer-Kameraprojektion |
| Mobile Navigation versteckte hinter horizontalem Scrollen mehrere Bereiche | Testspiel, Ereignisse und Live waren ohne Vorwissen kaum auffindbar | Sichtbarer Bereichswähler mit allen sieben Arbeitsbereichen |
| Objekt-Cutscene-Track war ohne Objekt anlegbar | Ungültiger leerer Target-Track | Aktion deaktiviert, erklärender Hinweis und Store-Guard |
| Keyframes wurden nur am Trackende angelegt | Der sichtbare Playhead war für Autorinnen bedeutungslos | „Keyframe bei x.xx s“, inklusive Kopie des vorherigen Zustands |
| Cutscene-Objekte/Figuren hatten nur X/Y | Rendererfähigkeiten waren nicht editierbar | Skalierung, Drehung, Deckkraft und Sichtbarkeit im Inspector |
| Ereigniszonen waren nur Textzeilen | Zonen konnten weder korrigiert noch gelöscht werden | Direkte X/Y/Breite/Höhe-Felder und Löschen pro Zone |
| Richtungsfolgen verlangten fehleranfällige Freitexteingabe | Unklare gültige Werte | Pfeil-Composer mit Rückschritt und Leeren |
| Früher Klick auf „Testlauf starten“ ging verloren | Oberfläche reagierte scheinbar nicht | Start wird vorgemerkt und nach Grafikinitialisierung automatisch ausgeführt |

## Verwendete Editorprinzipien

- **Definition versus Instanz:** Wie in LDtk sind globale Vorlagen und platzierte Levelobjekte sichtbar verschiedene Kontexte.
- **Szenenbaum bestimmt Auswahl:** Wie in Godot/Tiled führt eine Szenenauswahl zum passenden Inspector; Sichtbarkeit, Sperre und Reihenfolge bleiben am Element.
- **Playhead ist Wahrheit:** Wie in Aseprite entstehen Keyframes an der sichtbaren Zeit, nicht an einer unsichtbaren Standardposition.
- **Abbrechen ist sicher:** Assistenten schreiben erst bei ausdrücklicher Bestätigung.
- **Direkte Manipulation:** Sichtbare Objekte werden am Canvas bewegt/skaliert; präzise Zahlenfelder bleiben parallel verfügbar.
- **Mobile Entdeckbarkeit:** Primäre Bereiche dürfen nicht von einem unsichtbaren horizontalen Scrollzustand abhängen.

## Verbleibende bewusste Grenzen

- Remote-Löschungen gemeinsamer Cloud-Inhalte bleiben bewusst explizite, bestätigte Aktionen. Ein lokales Undo darf nicht stillschweigend gemeinsam genutzte Daten löschen.
- Die Spezialstudios werden jetzt als eigene Chunks geladen; der initiale JavaScript-Chunk sank von rund 537 kB auf 394 kB. Renderer und Levelkern bleiben bewusst im Start-Chunk, weil der erste sichtbare Canvas sie sofort benötigt.
- Pixel- und Cutscene-Editor sind jetzt praktisch verwendbar, ersetzen aber keinen vollständigen Aseprite- oder Videoeditor. Ihr Funktionsumfang ist auf das gemeinsame Spielformat begrenzt.

## Akzeptanzkriterien

- Abbrechen eines Erstellassistenten verändert weder Bibliothek noch Browserstorage.
- Eine neue 24×24-Definition kann ausschließlich über das UI erstellt, gezeichnet, gespeichert, platziert, bewegt und skaliert werden.
- Jede bestätigte lokale Änderung ist nachvollziehbar rückgängig/wiederholbar.
- Kein Arbeitsbereich ist auf 390 px versteckt.
- Canvas-Klick, Auswahlrahmen und Rendererbild verwenden dieselbe Kamera.
- Ein Cutscene-Track kann keinen unerfüllbaren Zielzustand erzeugen.
- Jede Ereigniszone ist nachträglich editier- und löschbar.
- Der erste Klick auf den Testlauf startet zuverlässig, auch bei langsamer GPU-Initialisierung.
