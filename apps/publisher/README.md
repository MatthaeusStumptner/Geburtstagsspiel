# Sicherer Ein-Klick-Publisher

Der Workspace `@franz-lola/publisher` verbindet die statische Levelwerkstatt mit dem kanonischen Monorepo `Geburtstagsspiel`. Cloudflare D1 hält gemeinsame Entwürfe und Bibliotheksrevisionen; GitHub hält die veröffentlichte statische Projektion. Der Worker akzeptiert validierte `franz-lola-level`-Dokumente sowie `franz-lola-content`-Dokumente für Figuren, Tilesets, Blöcke, Animationen, Cutscenes, Objekte und Events.

## Datenfluss

1. Nach der GitHub-Anmeldung gleicht der Worker veröffentlichte Inhalte aus den kanonischen Verzeichnissen unter `content/*` mit D1 ab.
2. Änderungen werden lokal im Browser und verzögert als neue D1-Revision gespeichert.
3. Stimmt die erwartete Revision nicht, liefert der Worker einen Konflikt statt fremde Änderungen zu überschreiben.
4. Eine Veröffentlichung referenziert exakte D1-Revisionen und schreibt einen Pull Request gegen `Geburtstagsspiel/main`.
5. Erst geprüfter Merge und erfolgreicher Pages-Deploy markieren diese Revisionen als veröffentlicht.

D1 behält pro Level oder Bibliothekseintrag höchstens 20 normale Arbeitsrevisionen; Veröffentlichungs-Snapshots bleiben nachvollziehbar. Abhängigkeiten werden in `content_dependencies` separat indexiert. Ungültige v2-Abhängigkeiten scheitern vor jeder Ersetzung dieses Indexes.

## Sicherheitsmodell

- Die GitHub App ist nur auf `Geburtstagsspiel` installiert.
- App-Rechte: **Actions: read**, **Contents: read and write**, **Pull requests: read and write**.
- Redakteurinnen benötigen keine Repository-Rechte; ihre GitHub-Namen stehen in einer exakten Allowlist.
- Private App-Schlüssel, Client Secret und Sitzungsschlüssel liegen nur als Cloudflare-Secrets vor.
- Die signierte Browsersitzung gilt 30 Minuten, wird aus dem URL-Fragment sofort entfernt und nie in `localStorage` oder `sessionStorage` geschrieben.
- Der Worker akzeptiert höchstens 1 MB pro Inhalt, nur bekannte Typen, kanonische Slug-IDs und die Pfade `content/levels`, `content/characters`, `content/tilesets`, `content/blocks`, `content/animations`, `content/cutscenes`, `content/objects` und `content/events`.
- Veröffentlicht werden nur Pull Requests des konfigurierten App-Bots; Pfadguard, Tests und Build laufen vor dem Merge.

## Einmalige Einrichtung durch den Besitzer

### 1. GitHub App

Unter **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**:

1. Einen eindeutigen Namen vergeben, zum Beispiel `Franz Lola Publisher`.
2. Bis zum kombinierten Pages-Cutover bleibt die live verwendete Homepage `https://matthaeusstumptner.github.io/Pacman_clone_level_editor/` unverändert.
3. Webhooks deaktivieren.
4. Repository permissions setzen: Actions Read-only, Contents Read and write, Pull requests Read and write.
5. App nur für den eigenen Account und nur auf `Geburtstagsspiel` installieren.
6. App ID, Client ID und Installation ID notieren, Client Secret und Private Key erzeugen und niemals committen.

Die Callback URL bleibt die vorhandene Worker-Adresse:

```text
https://franz-lola-publisher.<deine-workers-subdomain>.workers.dev/auth/callback
```

### 2. Cloudflare Worker

Alle Befehle laufen vom Root des Monorepos und verwenden das Root-Lockfile:

```bash
npm ci --ignore-scripts
npm test --workspace @franz-lola/publisher
npm run deploy --workspace @franz-lola/publisher -- --dry-run --outdir .wrangler-dry-run
```

Die bestehende D1-Ressource `franz-lola-publisher-level-db` ist in `apps/publisher/wrangler.jsonc` gebunden und darf nicht neu erstellt oder zurückgesetzt werden. Remote-Migrationen und ein echter Deploy werden nur in einem ausdrücklich freigegebenen Betriebsfenster ausgeführt; der Foundation-Review führt ausschließlich den Dry-Run aus.

Im Cloudflare-Dashboard beim Worker unter **Settings → Variables and Secrets** werden diese verschlüsselten Secrets gepflegt:

| Secret | Inhalt |
| --- | --- |
| `GITHUB_APP_ID` | App ID |
| `GITHUB_APP_CLIENT_ID` | Client ID |
| `GITHUB_APP_CLIENT_SECRET` | erzeugtes Client Secret |
| `GITHUB_INSTALLATION_ID` | Installation ID auf `Geburtstagsspiel` |
| `GITHUB_APP_PRIVATE_KEY` | vollständiger PEM-Private-Key |
| `SESSION_SECRET` | mindestens 32 zufällige Zeichen, besser 64 |
| `ALLOWED_GITHUB_LOGINS` | erlaubte GitHub-Namen, durch Komma getrennt |

Beispiel für einen Sitzungsschlüssel: `openssl rand -hex 32`.

### 3. Studio und Spiel verbinden

Im Repository `Geburtstagsspiel` unter **Settings → Secrets and variables → Actions → Variables**:

- `VITE_PUBLISHER_URL` = vorhandene Worker-Adresse ohne abschließenden Slash für Studio-Builds.
- `PUBLISHER_BOT_LOGIN` = Bot-Login der GitHub App, normalerweise App-Slug plus `[bot]`.

Der Foundation-Schritt ändert weder die live Editor-URL noch `EDITOR_PATH_PREFIX`; der kombinierte Game-/Studio-Pages-Cutover ist ein separates Vorhaben. Die Setup-Verlinkung im Studio zeigt deshalb auf die Variablen des kanonischen Monorepos, ohne eine neue Route vorzutäuschen.

## Lokale Entwicklung

Benötigt wird Node.js 22.14 oder neuer:

```bash
npm ci --ignore-scripts
npm run db:migrate:local --workspace @franz-lola/publisher
npm test --workspace @franz-lola/publisher
npm run dev --workspace @franz-lola/publisher
```

Für lokale Secrets `apps/publisher/.dev.vars.example` nach `apps/publisher/.dev.vars` kopieren. Die Zieldatei ist ignoriert und darf nie committed werden.
