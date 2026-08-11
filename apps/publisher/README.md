# Sicherer Ein-Klick-Publisher

Dieser Cloudflare Worker verbindet die statische Levelwerkstatt mit `Geburtstagsspiel`. Cloudflare D1 hält den gemeinsamen Entwurfs- und Bibliotheksstand aller Geräte, während GitHub die statische veröffentlichte Projektion bleibt. Der Worker akzeptiert validierte `franz-lola-level`-Dokumente sowie typisierte `franz-lola-content`-Dokumente für Figuren, Tilesets, Blöcke, Animationen, Cutscenes und Objekte.

## Datenfluss

1. Nach der GitHub-Anmeldung gleicht der Worker die veröffentlichten Level aus `Geburtstagsspiel` mit D1 ab.
2. Änderungen an Leveln, eigenen Figuren und eigenen Objekten werden lokal im Browser und verzögert als neue D1-Revision gespeichert.
3. Stimmt die erwartete Revision nicht mehr, liefert der Worker einen Konflikt statt fremde Änderungen zu überschreiben.
4. Eine Veröffentlichung referenziert exakte D1-Revisionen. Erst der geprüfte GitHub-PR und der erfolgreiche Pages-Deploy markieren diese Revisionen als veröffentlicht.

D1 behält pro Level oder Bibliothekseintrag höchstens 20 normale Arbeitsrevisionen; Veröffentlichungs-Snapshots bleiben nachvollziehbar. Unveränderte Dokumente erzeugen keine neue Revision und damit keine unnötigen Schreibvorgänge. Abhängigkeiten werden separat indexiert, während Keyframes im jeweils besitzenden Dokument bleiben.

## Sicherheitsmodell

- Die GitHub App wird nur auf `Geburtstagsspiel` installiert.
- App-Rechte: **Actions: read**, **Contents: read and write**, **Pull requests: read and write**. Metadaten werden von GitHub automatisch lesbar gemacht.
- Redakteurinnen erhalten keinerlei Repository-Rechte. Ihre GitHub-Namen stehen in einer exakten Allowlist.
- Der private App-Schlüssel, Client Secret und Sitzungsschlüssel liegen nur als verschlüsselte Cloudflare-Secrets vor.
- Der Browser erhält lediglich eine signierte Sitzung für 30 Minuten. Sie steht im URL-Fragment, wird beim Laden sofort entfernt und weder in `localStorage` noch in `sessionStorage` gespeichert.
- CORS, Rücksprung-URL und Links sind auf die echten Editor-/GitHub-/Spieladressen begrenzt.
- Der Worker akzeptiert maximal 1 MB pro Inhalt, nur JSON, keine gefährlichen Objektschlüssel und feste Inhaltslimits. Er kann ausschließlich die kanonischen Level- und Bibliotheksverzeichnisse unter `src/data/` ändern.
- Das Spiel übernimmt nur Pull Requests des konfigurierten App-Bots und prüft Dateipfad, Tests und Build vor dem Merge.

Der Betrieb ist bewusst für die kostenlosen Kontingente von GitHub Pages, GitHub Actions, Cloudflare Workers und D1 ausgelegt. Es gibt keine dauerhaft laufende Instanz und unveränderte Level verursachen keine D1-Schreibvorgänge. Die jeweiligen Anbieter können ihre Limits später ändern.

## Einmalige Einrichtung durch den Besitzer

### 1. GitHub App anlegen

Unter **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**:

1. Einen eindeutigen Namen vergeben, zum Beispiel `Franz Lola Publisher`.
2. Homepage: `https://matthaeusstumptner.github.io/Pacman_clone_level_editor/`.
3. Webhooks deaktivieren.
4. Repository permissions setzen:
   - Actions: Read-only
   - Contents: Read and write
   - Pull requests: Read and write
5. App nur für den eigenen Account und danach **nur auf `Geburtstagsspiel`** installieren.
6. App ID, Client ID und Installation ID notieren, ein Client Secret sowie einen Private Key erzeugen. Den Schlüssel niemals committen.

Die Callback URL wird nach dem ersten Worker-Deploy auf diese Adresse gesetzt:

```text
https://franz-lola-publisher.<deine-workers-subdomain>.workers.dev/auth/callback
```

### 2. Cloudflare-Deploy aktivieren

Im Repository `Pacman_clone_level_editor` folgende GitHub-Actions-Werte anlegen:

| Art | Name | Wert |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | Cloudflare-Token mit „Edit Cloudflare Workers“ für dieses Konto |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| Variable | `PUBLISHER_DEPLOY_ENABLED` | `true` |

Danach **Actions → Deploy secure level publisher → Run workflow** starten. Die D1-Ressource `franz-lola-publisher-level-db` ist über Name und ID in `wrangler.jsonc` gebunden; Wrangler führt ausstehende Migrationen vor dem Deploy aus. Die Ausgabe nennt die öffentliche `workers.dev`-Adresse.

Im Cloudflare-Dashboard beim Worker unter **Settings → Variables and Secrets** diese Werte als verschlüsselte Secrets eintragen:

| Secret | Inhalt |
| --- | --- |
| `GITHUB_APP_ID` | App ID |
| `GITHUB_APP_CLIENT_ID` | Client ID |
| `GITHUB_APP_CLIENT_SECRET` | erzeugtes Client Secret |
| `GITHUB_INSTALLATION_ID` | Installation ID der App auf `Geburtstagsspiel` |
| `GITHUB_APP_PRIVATE_KEY` | vollständiger PEM-Private-Key |
| `SESSION_SECRET` | mindestens 32 zufällige Zeichen, besser 64 |
| `ALLOWED_GITHUB_LOGINS` | erlaubte GitHub-Namen, durch Komma getrennt |

Beispiel zum lokalen Erzeugen eines Sitzungsschlüssels:

```bash
openssl rand -hex 32
```

Anschließend die Callback URL der GitHub App auf die Worker-Adresse aktualisieren.

### 3. Editor und Spiel verbinden

Im Repository `Pacman_clone_level_editor`:

- Variable `PUBLISHER_URL` = Worker-Adresse ohne abschließenden Slash.
- Danach den Workflow **Deploy Level Editor to GitHub Pages** einmal manuell starten.

Im Repository `Geburtstagsspiel`:

- Variable `PUBLISHER_BOT_LOGIN` = Bot-Login der GitHub App, normalerweise der App-Slug plus `[bot]`, zum Beispiel `franz-lola-publisher[bot]`.

Nun kann ein erlaubter Account im Editor auf **Veröffentlichen** klicken und bis zu 20 Level oder Bibliothekseinträge typisiert auswählen. Der Worker akzeptiert höchstens 5 MB pro Veröffentlichung und 1 MB pro Inhalt; alle ausgewählten Dateien landen in genau einem Pull Request. Nicht erlaubte Accounts erhalten nur eine neutrale Fehlermeldung.

Während der Veröffentlichung zeigt der Editor die tatsächlich laufenden GitHub-Schritte: sichere Übertragung, Checkout, Abhängigkeiten, Tests, Build, Merge und GitHub-Pages-Deployment. Dazu kommen Prozentanzeige, verstrichene Zeit, Zeitpunkt des letzten Checks, ein Aktivitätslog und ein manueller Status-Check. Vorübergehende Netzwerkfehler werden mehrfach erneut versucht und nicht sofort als Abbruch dargestellt.

## Lokale Prüfung

Benötigt Node.js 22.3 oder neuer:

```bash
npm ci
npm test
npm audit
npm run db:migrate:local
npm run dev
```

Für lokale Secrets `.dev.vars.example` nach `.dev.vars` kopieren. `.dev.vars` ist ignoriert und darf nie committed werden.
