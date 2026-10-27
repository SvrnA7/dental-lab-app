# Dentlab Plattform (Version 7)

Kapazitätsplanung, Plantafel, Kalkulation mit BEL II, Arbeitsplatz-Scan, Wissensbasis mit KI, Falldokumentation und Material für das Dentallabor. Diese Ausgabe läuft auf Netlify oder auf einem eigenen Server. Alle Tablets und PCs sehen dieselben Daten.

## Inhalt

| Ordner / Datei | Zweck |
|---|---|
| `public/` | Die App selbst (`index.html`, `platform.js`, Symbole, Beispieldaten `seed.json`) |
| `core/` | Server-Kern: Daten-API, Laborcode-Anmeldung, KI-Fragen |
| `netlify/` | Netlify Function (Daten) und Edge Function (KI-Fragen) |
| `server/server.mjs` | Eigener Server mit Node.js, ohne weitere Abhängigkeiten |
| `.env.example` | Vorlage für die Einstellungen |

## Einstellungen (Umgebungsvariablen)

| Name | Pflicht | Bedeutung |
|---|---|---|
| `LAB_CODE` | ja | Laborcode für den Zugang. Lang und nicht erratbar wählen, z. B. vier zufällige Wörter. Wer den Code kennt, kommt an die Daten. |
| `ANTHROPIC_API_KEY` | nein | Schlüssel von console.anthropic.com. Ohne Schlüssel läuft die Wissenssuche nur per Stichwort. |
| `ANTHROPIC_MODEL` | nein | Standard `claude-sonnet-5-5`. Günstiger: `claude-haiku-5-5`. |
| `DATA_START` | nein | Nur beim allerersten Start: `demo` (Beispiellabor, Standard) oder `leer` (nur Stammdaten, Preislisten und ein Zugang „Laborleitung“). |
| `LAB_NAME` | nein | Laborname für den Start mit `leer`. |

PIN beim ersten Anmelden: **1234** (im Demo-Labor für alle Mitarbeiter, bei `leer` für „Laborleitung“). Danach unter Team die eigenen PINs vergeben.

## Weg A: Netlify (empfohlen)

Wichtig: Einfaches Hineinziehen des Ordners ins Netlify-Fenster lädt nur die statischen Dateien hoch, dann fehlt der Server-Teil. Einer der beiden Wege unten ist nötig.

**Mit GitHub (am bequemsten für spätere Updates)**
1. Neues privates Repository auf GitHub anlegen und den Inhalt dieses Ordners hochladen.
2. In Netlify: *Add new site → Import an existing project → GitHub* und das Repository wählen. Die Einstellungen kommen aus `netlify.toml`, nichts ändern.
3. *Site configuration → Environment variables*: `LAB_CODE` und optional `ANTHROPIC_API_KEY`, `DATA_START` eintragen.
4. *Deploys → Trigger deploy → Deploy site*. Fertig, die Adresse steht oben (z. B. `https://mein-labor.netlify.app`).

**Mit der Kommandozeile** (Node.js 20 installiert)
```
npm install
npx netlify-cli login
npx netlify-cli sites:create    # neue Seite anlegen und verknüpfen
npx netlify-cli env:set LAB_CODE "dein-langer-laborcode"
npx netlify-cli env:set ANTHROPIC_API_KEY "sk-ant-..."
npx netlify-cli deploy --prod
```

Die Daten liegen in Netlify Blobs (Speicher „laborplaner“, Fotos in „laborplaner-dateien“).

## Weg B: Vercel

Vercel liefert nur die App-Dateien aus. Die App startet dann im **Demo-Modus**: Jedes Gerät speichert seine Daten nur im eigenen Browser, Tablets sehen sich gegenseitig nicht, KI und Fotos sind aus. Gut zum Ausprobieren, nicht für den Laboralltag. Einrichtung: Projekt importieren, *Framework Preset: Other*, *Output Directory: `public`*.

## Weg C: Eigener Server (Mini-PC im Labor oder gemieteter Server)

```
cp .env.example .env     # Werte eintragen
npm start                # oder: node server/server.mjs
```
Läuft auf Port 8080 (`PORT` ändert das). Daten liegen im Ordner `data/`, die Sicherung ist eine Kopie dieses Ordners. Für Zugriff von außen einen HTTPS-Proxy davor setzen (z. B. Caddy: `mein-labor.de { reverse_proxy localhost:8080 }`). Im Labornetz ohne Internetzugang geht auch `ALLOW_OPEN=1` statt Laborcode.

## Tablets

Seite im Browser öffnen, Laborcode eingeben, dann *Teilen → Zum Home-Bildschirm* (iPad) bzw. *Menü → App installieren* (Android). Die Anmeldung bleibt 180 Tage erhalten.

## Datensicherung

Angemeldet `https://deine-adresse/api/export` aufrufen. Das lädt alle Daten als eine JSON-Datei herunter (ohne Fotos).

## Datenschutz

- Der Laborcode schützt den Zugang. Die PINs ordnen nur zu, wer im Team gerade arbeitet.
- In der App Patienten nur mit Kürzel oder Nummer führen, keine vollen Namen.
- Netlify speichert in den USA. Für echte Auftragsdaten mit Patientenbezug vorher den Auftragsverarbeitungsvertrag von Netlify prüfen oder Weg C mit einem Server in Deutschland nutzen.
- KI-Fragen schicken die passenden Wissenseinträge, den Materialbestand und eine Liste offener Aufträge an Anthropic.

## Hinweise

- Die BEL-II-Preise sind die Höchstpreise Sachsen 2026. Unter Stammdaten → Preislisten prüfen oder die eigene Liste per „Preise einfügen“ übernehmen.
- Änderungen anderer Geräte erscheinen spätestens nach 30 Sekunden und sofort beim Wechsel zurück in die App.
