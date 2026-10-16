# Tankradar-Server selbst betreiben

Der Server ist optional. Er bringt:

- **Vollständige Preisverläufe** rund um die Uhr für deine Regionen.
- **Einen geteilten Cache:** Viele Nutzer erzeugen nur wenige Anfragen bei Tankerkönig.
- **Einen privaten API-Key:** Die App kennt nur die Server-Adresse.

## Docker (empfohlen)

```bash
cd server
cp .env.example .env      # TANKERKOENIG_API_KEY und REGIONS eintragen
docker compose up -d
curl http://localhost:8787/api/health
```

Oder mit dem fertigen Image (wird bei jedem Release gebaut):

```bash
docker run -d --name tankradar -p 8787:8787 -v tankradar:/data \
  -e TANKERKOENIG_API_KEY=… -e REGIONS="50.11,8.68,15;52.52,13.40,15" \
  ghcr.io/olivrr-vfx/tankradar-server:latest
```

## Ohne Docker

```bash
cd server && TANKERKOENIG_API_KEY=… REGIONS="50.11,8.68,15" node src/index.js
```

Node ≥ 22.13 wird benötigt (eingebautes `node:sqlite`).

## Konfiguration

| Variable | Standard | Bedeutung |
|---|---|---|
| `TANKERKOENIG_API_KEY` | – | Kostenloser Key von creativecommons.tankerkoenig.de |
| `REGIONS` | – | `lat,lng,radiusKm` getrennt durch `;` (max. 25 km je Region) |
| `POLL_INTERVAL_MIN` | `10` | Abfrage-Intervall (min. 5) |
| `LIVE_CACHE_SEC` | `300` | Cache-Dauer für Live-Abfragen aus der App |
| `RETENTION_DAYS` | `400` | Wie lange der Verlauf aufbewahrt wird |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | |
| `DB_PATH` | `./data/tankradar.db` | SQLite-Datei |
| `CORS_ORIGIN` | `*` | Erlaubte Web-Origin |
| `RATE_LIMIT_PER_MIN` | `120` | Anfragen pro IP und Minute |

Für die öffentliche Erreichbarkeit gehört der Server hinter einen Reverse Proxy mit HTTPS (z. B. Caddy: `tankradar.example.org { reverse_proxy localhost:8787 }`).

In der App dann **Einstellungen → Datenquelle → Eigener Tankradar-Server** wählen und die Adresse eintragen.

## API

| Endpoint | Beschreibung |
|---|---|
| `GET /api/health` | Status, Anzahl Stationen/Preise |
| `GET /api/stations?lat=&lng=&rad=` | Stationen im Umkreis (live, gecacht) |
| `GET /api/stations/:id` | Station inkl. Öffnungszeiten |
| `GET /api/prices?ids=a,b,c` | Aktuelle Preise (max. 50 IDs) |
| `GET /api/history/:id?fuel=e10&from=&to=` | Preisänderungen (Stufenfunktion, ms-Timestamps) |

Bitte halte die [Nutzungsbedingungen von Tankerkönig](https://creativecommons.tankerkoenig.de) ein und nenne die Quelle (CC BY 4.0).
