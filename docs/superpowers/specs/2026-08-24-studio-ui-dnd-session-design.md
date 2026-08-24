# Studio UI, Drag-and-drop und Cloud-Sitzung

**Status:** Freigegeben am 24. August 2026

## Ziel

Das Studio soll beim Öffnen sofort arbeitsbereit sein, globale Objekte direkt per Drag-and-drop im Level platzieren, automatisch erzeugte Kopienketten vermeiden und Cloud-Stände mit verständlicher Urheberanzeige abgleichen. Der Umbau bleibt ein gezielter Aufräum-Pass und kein vollständiger Design-System-Neubau.

## Drag-and-drop

- Jede Asset-Karte erhält einen eindeutigen Drag-Payload mit der Asset-ID.
- Das Level-Canvas akzeptiert ausschließlich Studio-Asset-Payloads, zeigt während des Ziehens einen klaren Drop-Zustand und setzt das Objekt an der umgerechneten Levelposition ab.
- Die eigentliche Platzierung liegt in einer Store-Methode, damit Klick-Platzierung und Drag-and-drop dieselbe Logik verwenden.
- Nach dem Drop ist die neue Instanz ausgewählt und das Transformieren-Werkzeug aktiv.
- Auf Touch-Geräten bleibt „Im Level platzieren“ mit anschließendem Tippen auf das Canvas erhalten.

## Lokale Sicherungen statt Kopienketten

- IDs mit dem vom Studio erzeugten Marker `-lokale-kopie` gelten als alte automatische Sicherungen, nicht als eigenständige globale Inhalte.
- Beim ersten Start werden Ketten solcher Einträge auf höchstens eine lokale Sicherung pro Original reduziert.
- Die Sicherung erhält eine stabile ID, einen verständlichen Namen und eine lokale Markierung. Sie wird nicht erneut in die Cloud synchronisiert oder zur Veröffentlichung angeboten.
- Bewusst über „Duplizieren“ erzeugte `-kopie`-Objekte bleiben eigenständige Inhalte.
- Alte automatische Sicherungseinträge aus der Cloud werden aus der Arbeitsansicht entfernt und bestmöglich über ihre bekannte Revision gelöscht.

## Anmeldung und Versionsabgleich

- Das Publisher-Token wird mit einem Ablaufzeitpunkt sieben Tage im Browser gespeichert.
- Der Publisher stellt eine gespeicherte Sitzung beim Start wieder her, prüft sie über `/api/me` und entfernt sie bei HTTP 401 oder Ablauf automatisch.
- Der Worker stellt Publisher-Sitzungen für sieben Tage aus; OAuth-State bleibt kurzlebig.
- Nach erfolgreicher Prüfung startet das Studio den bestehenden Draft- und Content-Bootstrap automatisch.
- Ohne gültige Sitzung zeigt die Hauptoberfläche eine kompakte Cloud-Einführung mit direkter GitHub-Anmeldung. Die Veröffentlichung bleibt zusätzlich erreichbar.
- Cloud-Metadaten werden mit dem angemeldeten Login verglichen und als „Von dir“ beziehungsweise „Von <Login>“ dargestellt.

## UI-Aufräumen

- Doppelte Primäraktionen in Objekt-Header, Bibliothek und Canvas-Toolbar werden auf jeweils einen eindeutigen Ort reduziert.
- Schlüsselbuttons verwenden eine feste Icon-Fläche mit `display: grid`, `place-items: center` und `line-height: 1`.
- Navigation, Werkzeugleiste und Asset-Karten bekommen konsistente Höhen, Abstände, Fokuszustände und klare Primär-/Sekundärhierarchie.
- Das Canvas bleibt die visuell dominante Arbeitsfläche; Hilfetext und seltene Aktionen drängen es nicht zusammen.
- Keine neue Icon- oder UI-Abhängigkeit wird eingeführt.

## Fehler- und Sicherheitsverhalten

- Ungültige oder abgelaufene Sitzungen führen zurück zur Login-Einführung, ohne lokale Arbeit zu verlieren.
- Ein fehlender oder fremder Drag-Payload verändert das Level nicht.
- Die automatische Bereinigung betrifft nur IDs, die eindeutig dem bisherigen `-lokale-kopie`-Schema entsprechen.
- Lokale Sicherungen werden vor einer Cloud-Übernahme erstellt, aber niemals wieder als globale Inhalte interpretiert.

## Kurze Verifikation

- Gezielte Node-Tests für Sitzungsspeicherung und Bibliotheksbereinigung.
- Ein Playwright-Szenario für Asset-Drag-and-drop und die sichtbare Login-/Urheberführung.
- Studio-Build als Abschlussprüfung; keine mehrstündige Vollmatrix vor der Bereitstellung.
