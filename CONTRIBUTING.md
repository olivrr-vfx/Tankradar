# Mitmachen

Danke, dass du Tankradar besser machen willst!

1. Forke das Repo und lege einen Branch an.
2. `npm install`, dann `npm run dev`. Ohne API-Key startet die App im Demo-Modus.
3. Vor dem PR: `npm run typecheck && npm test && npm run build`.
4. Reine Logik gehört nach `src/lib` und bekommt Tests (`*.test.ts`).
5. Texte immer in `src/i18n/de.ts` **und** `src/i18n/en.ts` pflegen. TypeScript erzwingt, dass beide vollständig sind.

## Neue Datenquelle (Land) hinzufügen

Implementiere das Interface `Provider` aus `src/lib/types.ts` in `src/providers/<name>.ts`. Registriere sie dann in `src/providers/index.ts` und ergänze die Auswahl in `screens/Settings.tsx` sowie die Texte.

## Stil

Prettier-kompatibel (2 Leerzeichen, einfache Anführungszeichen, 140 Zeichen). Farben nur über die CSS-Tokens in `src/styles/tokens.css`.
