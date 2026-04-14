# Outfit AI Mobile – Netlify Version

Diese Version ist fertig für Netlify vorbereitet.

## Enthalten
- mobile Web-App
- PWA Manifest + Service Worker
- Netlify Functions für AI-Autotagging
- lokaler Browser-Katalog
- Outfit-Vorschläge
- gespeicherte Looks

## Deployment auf Netlify
1. ZIP entpacken
2. Neues Site-Projekt bei Netlify anlegen
3. Diesen Ordner hochladen oder mit Git verbinden
4. Umgebungsvariablen setzen:
   - `OPENAI_API_KEY`
   - optional `OPENAI_MODEL=gpt-4.1-mini`
5. Deploy starten

## Wichtige Ordner
- `public/` → statische Website
- `netlify/functions/` → Serverless Functions
- `netlify.toml` → Netlify-Konfiguration

## Lokales Testen
- Netlify CLI installieren
- im Projektordner:
  `netlify dev`

## Handy-Nutzung
Nach dem Deployment:
1. Netlify-Link am iPhone öffnen
2. Teilen
3. `Zum Home-Bildschirm`

## Hinweis
Der Katalog wird lokal im Browser des jeweiligen Geräts gespeichert.
Für echte Synchronisierung zwischen mehreren Geräten wäre später eine Datenbank nötig.
