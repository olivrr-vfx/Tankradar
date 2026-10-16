# Tankradar auf dem iPhone/iPad

Es gibt drei Wege, von einfach bis „richtige“ App.

## 1. Web-App auf dem Home-Bildschirm (empfohlen, 30 Sekunden)

1. Auf dem iPhone in **Safari** die Tankradar-Seite öffnen:
   `https://olivrr-vfx.github.io/Tankradar/` (bzw. `https://<dein-github-name>.github.io/<repo>/`)
2. Unten auf **Teilen** (Quadrat mit Pfeil) tippen → **Zum Home-Bildschirm** → **Hinzufügen**.
3. Tankradar startet jetzt wie eine App: eigenes Icon, Vollbild, offline-fähig, Standort funktioniert.

Kein Apple-Account, kein Mac, keine Kosten. Updates kommen automatisch.

> Einmalig nötig: Im GitHub-Repo unter **Settings → Pages → Source** „**GitHub Actions**“ auswählen.
> Danach veröffentlicht jeder Push auf `main` die Web-App automatisch.

## 2. Native App per Sideloading (kostenlos, ohne Mac)

1. Im Repo **Actions → „iOS app (.ipa)“ → Run workflow** starten (oder ein Release-Tag `v1.0.0` pushen).
2. Nach ca. 10 Minuten unter dem Workflow-Lauf das Artefakt **Tankradar-ios** herunterladen. Darin liegt `Tankradar-unsigned.ipa`.
3. Die `.ipa` mit einem dieser Tools installieren. Alle signieren sie mit deiner normalen (kostenlosen) Apple-ID:
   - [AltStore](https://altstore.io) oder [SideStore](https://sidestore.io), direkt auf dem iPhone
   - [Sideloadly](https://sideloadly.io), am Windows-PC oder Mac per Kabel
4. iPhone: **Einstellungen → Allgemein → VPN & Geräteverwaltung** → deiner Apple-ID vertrauen.
   Ab iOS 16 zusätzlich: **Einstellungen → Datenschutz & Sicherheit → Entwicklermodus** aktivieren.

Einschränkung von Apple: Mit einer kostenlosen Apple-ID läuft die Signatur nach **7 Tagen** ab. AltStore/SideStore erneuern sie automatisch, Sideloadly per Klick.

## 3. TestFlight / App Store (Apple Developer Program, 99 €/Jahr)

Damit gibt es keine 7-Tage-Grenze und du kannst die App mit anderen teilen.

1. Mac mit Xcode: `npm install && npm run ios` öffnet das Projekt.
2. In Xcode unter *Signing & Capabilities* dein Team wählen, Bundle-ID `app.tankradar` (oder eine eigene) eintragen.
3. **Product → Archive → Distribute App → TestFlight & App Store**.
4. In App Store Connect: TestFlight-Tester einladen bzw. zur Prüfung einreichen.
   Texte und Screenshots dafür findest du unter `fastlane/metadata/android/` und `docs/screenshots/`. Die Datenschutzerklärung liegt in `docs/PRIVACY.md`.
