# Datenschutzerklärung – Tankradar

**Kurzfassung:** Tankradar hat kein Konto, kein Tracking, keine Analyse-Tools und keine Werbung. Alle persönlichen Daten bleiben auf deinem Gerät.

## Welche Daten verarbeitet die App?

- **Standort:** Nur mit deiner Erlaubnis und nur, um Tankstellen in der Nähe zu suchen. Die Koordinaten gehen als Suchanfrage an die gewählte Datenquelle (Tankerkönig, E-Control oder deinen eigenen Server). Gespeichert wird nichts davon.
- **Suchbegriffe** für Orte gehen an Photon (Komoot) bzw. Nominatim (OpenStreetMap).
- **Routen:** Start- und Zielkoordinaten gehen an den OSRM-Routingdienst (FOSSGIS bzw. Project OSRM oder deinen eigenen).
- **Kartenkacheln** lädt die App von OpenFreeMap.
- **Logos und Fotos** (abschaltbar unter *Einstellungen → Logos & Fotos*): Markenlogos werden von Wikimedia Commons geladen. Mit hinterlegtem Google-API-Key werden die Koordinaten der Tankstelle an die Google Street View Static API gesendet. Luftbilder (Karte „Satellit“ und Bildkopf der Tankstelle) lädt die App von Esri World Imagery. Für Tankstellenfotos werden die Koordinaten der angezeigten Tankstelle an Mapillary (falls ein Token hinterlegt ist) bzw. Wikimedia Commons gesendet.
- **Lokal gespeichert** werden Einstellungen, Favoriten, Fahrzeuge, Preisalarme, das Tankbuch und der Preisverlauf, und zwar in localStorage bzw. IndexedDB auf deinem Gerät. Du kannst alles in den Einstellungen exportieren oder löschen.

Die genannten Dienste erhalten technisch bedingt deine IP-Adresse. Es gelten deren Datenschutzbestimmungen.

## Kontakt

Für Fragen bitte ein Issue im GitHub-Repository eröffnen.
