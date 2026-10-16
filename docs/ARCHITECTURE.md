# Architektur

Tankradar ist **eine** Web-Codebasis (React 19 + TypeScript + Vite), die auf allen Plattformen ausgeliefert wird:

| Plattform | Hülle | HTTP | Standort | Benachrichtigungen | Dateien |
|---|---|---|---|---|---|
| Web/PWA | Service Worker (Workbox) | `fetch` | Geolocation API | Notification API | Download |
| Android/iOS | Capacitor 7 | `CapacitorHttp` (nativ, kein CORS) | `@capacitor/geolocation` | Local Notifications | Filesystem + Share |
| Desktop | Tauri 2 | `tauri-plugin-http` | WebView-Geolocation | `tauri-plugin-notification` | Dialog + FS |

Die Unterschiede kapselt `src/services/platform.ts` bzw. `src/services/http.ts`.

## Datenfluss

```
Provider (Demo | Tankerkönig | E-Control | Server)
   │  search(center, radius) / detail(id) / prices(ids) / history?(id, fuel, from, to)
   ▼
store/data.ts ──► historyStore (IndexedDB): jede Preisänderung wird lokal aufgezeichnet
   │                                      + Gebiets-Snapshots (Ø, Min) für den Gebietstrend
   ▼
Screens (Radar, Station, Stats, Route …)
```

`loadHistory()` führt Server- bzw. Provider-Verlauf und lokalen Verlauf zusammen.

## Beste Tankzeit (Tagesprofil)

`lib/history.ts → hourlyProfile()` tastet den Preis-Stufenverlauf jedes vollständigen Tages zur halben Stunde ab. Davon wird der Tagesmittelwert abgezogen und über die Tage gemittelt. Das ergibt 24 Abweichungen in €/l. Für ein Gebiet werden die Profile der nächstgelegenen Stationen gewichtet kombiniert. Liegen weniger als 3 Tage vor, greift das eingebaute `DEFAULT_PROFILE` (typisches Muster in Deutschland: Spitze morgens gegen 7 Uhr, günstig zwischen 18 und 22 Uhr, Sprung gegen 22 Uhr).

Prognose: `predict(now → t) = Preis_jetzt − Profil[Stunde_jetzt] + Profil[Stunde_t]`.

## Routenplaner

1. Route über OSRM mit `annotations=duration`, damit pro Koordinate die Fahrzeit bekannt ist und daraus die ETA jeder Tankstelle folgt.
2. Abfragepunkte entlang der Route, deren Suchradius den Korridor abdeckt (höchstens 60 Abfragen, 3 parallel).
3. Jede Station wird auf die Route projiziert (`alongKm`, `offKm`). Daraus ergeben sich der Umweg (`2 · offKm · 1,3`) und die ETA.
4. Ausdünnen: je 10-km-Abschnitt die 3 attraktivsten Stationen.
5. **Optimierung** (`lib/planner.ts`): dynamische Programmierung über *(Station, Füllstand bei Ankunft)* mit diskretem Füllstandsraster. Entscheidungen: Station überspringen oder auf Füllstand *g* tanken. Kosten sind Liter × prognostizierter Preis plus Zeitwert pro Stopp, inklusive Umweg-Sprit. Nebenbedingungen sind Reserve und Wunsch-Restmenge am Ziel. Der Rest im Tank am Ziel wird zum Median-Preis der Route gutgeschrieben, sodass an günstigen Stationen voll getankt wird statt nur das Minimum.
6. Abfahrtsvergleich: Für 24 stündliche Abfahrtszeiten werden ETAs und Preise neu prognostiziert und mit grobem Raster neu optimiert.

## Server

`server/` enthält Node 22 ohne Abhängigkeiten (`node:http`, `node:sqlite`).

- **Collector:** fragt konfigurierte Regionen alle *n* Minuten per `list.php` ab (≥ 5 min, gemäß Tankerkönig-Bedingungen) und speichert nur **Änderungen**.
- **On-Demand-Cache:** `/api/stations` fragt höchstens einmal je Rasterzelle und Cache-Intervall bei Tankerkönig an. Jede Nutzung erweitert damit den Verlauf.
- Tabellen: `stations`, `prices(station_id, fuel, t, p)`, `fetches`.
