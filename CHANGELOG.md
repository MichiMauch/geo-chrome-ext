# Changelog

## [3.0.1] - 2026-05-26

### Fixed

- **Side-Panel öffnet nicht / „Content script not reachable":** In 3.0.0 wurde `chrome.sidePanel.open()` nach einem `await chrome.sidePanel.setOptions(...)` aufgerufen. Das verbraucht die User-Geste, und `open()` warf in Chrome silently „may only be called in response to a user gesture", landete im Fallback-Popup-Window — wo `chrome.tabs.query({ currentWindow: true })` das Popup-Fenster selbst zurückgab und „Nicht unterstützt" anzeigte. Fix: `sidePanel.open()` wird jetzt synchron im `chrome.action.onClicked`-Handler aufgerufen; `setOptions`/Messaging laufen in `.then()`-Chains.
- **Upgrader von 2.x bekamen die neue Flow nie zu sehen:** v2.x hatte `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` gesetzt, und Chrome persistiert das Setting über Updates hinweg. Das unterdrückte `chrome.action.onClicked` weiter, sodass die neue Logik bei Upgradern nie lief. Fix: Service-Worker setzt das Setting beim `onInstalled`/`onStartup` explizit auf `false` zurück.
- **Popup-Window-Fallback findet jetzt den richtigen Tab:** Wenn die sidePanel-API nicht verfügbar ist oder `open()` doch fehlschlägt, übergibt der Service-Worker die Tab-ID via `?tabId=…` an die Popup-URL. Der Popup liest sie via `chrome.tabs.get()` aus, statt fälschlich seinen eigenen Window-Tab zu queryen.
- **Aussagekräftige Fehlermeldung statt „Content script not reachable":** `chrome.scripting.executeScript`-Fehler werden nicht mehr stillschweigend verschluckt — wenn die Injection scheitert (typischerweise fehlende activeTab-Gewährung), zeigt das Panel die Original-Chrome-Fehlermeldung plus einen Hinweis, das Icon erneut zu klicken.

## [3.0.0] - 2026-05-18

### Added

- **Side-Panel-Modus:** Klick auf das Extension-Icon öffnet jetzt das Chrome Side-Panel statt eines Popups. Das Panel bleibt beim Tab-Wechsel offen, sodass der Workflow „Seite editieren → re-analysieren → vergleichen" ohne Schließen und Wiederöffnen funktioniert. Beim Wechsel auf einen anderen Tab zeigt das Panel einen informativen Hinweis-Banner („Klick aufs Extension-Icon, um diese Seite zu analysieren"). Layout ist responsive: Side-Panel füllt die volle Breite und Höhe, Footer sitzt am unteren Rand.
  - Manifest: neue Permissions `sidePanel` und `tabs` — **keine** `host_permissions` nötig, die Extension läuft weiterhin mit `activeTab`, das beim Icon-Klick automatisch erteilt wird (kein Permission-Dialog beim Install, kein Re-Aktivieren beim Update)
  - Service-Worker: `chrome.action.onClicked`-Handler öffnet das Side-Panel via `chrome.sidePanel.open()` und schickt dem Panel eine `analyze-tab`-Message, damit es für den Tab, auf dem das Icon geklickt wurde, neu analysiert (der Klick erteilt frisch `activeTab` für genau diesen Tab)
  - Banner-String in 6 Sprachen (`ui_otherPageDetected`)

- **One-Click Fix-Snippets:** Pro Empfehlung gibt es jetzt einen „Snippet anzeigen"- und einen „Kopieren"-Button. Generiert konkrete Code-Snippets (JSON-LD-Schema für Article/FAQPage/Person/Organization, semantisches HTML, llms.txt-Template, robots.txt-Anweisungen etc.), die mit einem Klick in die Zwischenablage gehen. Wandelt die Extension vom Diagnose- in ein Umsetzungs-Tool. 16 Snippets + 2 No-Snippet-Hinweise für alle 18 Recommendation-Keys. Funktioniert im Popup und im HTML-Report. UI-Strings in 6 Sprachen.

- **Lesbarkeits-Score (Flesch / LIX):** Neuer Sub-Check in der Kategorie „Inhaltliche Klarheit & Struktur". Wählt automatisch die richtige Formel basierend auf der aktiven UI-Sprache: Flesch Reading Ease für EN/FR/ES/PT/IT (höher = einfacher; ≥60 ist Plain English), LIX für DE (niedriger = einfacher; ≤30 sehr leicht, ≥60 sehr schwer; gut geeignet für lange deutsche Komposita). Zeigt den Rohwert direkt im Kriterium („42 Flesch" / „45 LIX") plus Erklärung im HTML-Report. Bei zu komplexen Texten gibt es die Empfehlung „Vereinfachen Sie den Text: kürzere Sätze, einfachere Wörter, weniger lange Komposita." in 6 Sprachen.

- **Schema.org-Vollständigkeits-Validierung:** Zusätzlich zum bestehenden `@type`-Presence-Check prüft die Maschinenlesbarkeits-Analyse jetzt auch die Pflichtfelder pro Schema-Typ. Ein leeres `Article`-Schema ohne `author` und `datePublished` wird nicht mehr als „Pass" gewertet. Validiert werden Article / NewsArticle / BlogPosting (headline, author, datePublished), FAQPage (mainEntity), HowTo (name, step), Product (name, offers), Organization (name, url), Person (name), BreadcrumbList (itemListElement), WebPage (name). Shallow-Schemas aus Microdata/RDFa-Extraktion (nur `@type` ohne Properties) werden fair übersprungen. Zeigt im Sub-Kriterium konkret welche Felder fehlen („Article: author, datePublished"). Neue Empfehlung `rec_schema_incomplete` in 6 Sprachen.

- **6. Analyse-Kategorie: On-Page SEO:** Neue Kategorie erweitert das Tool von GEO-only zu kombiniertem GEO+SEO-Audit. Gesamtscore geht neu von 0–30 (statt 0–25); Rating-Schwellen entsprechend skaliert (Exzellent ≥25, Gut ≥19, Verbesserungsbedarf ≥12). Sechs Sub-Checks:
  - **Seitentitel-Qualität** (Pflicht, Länge 30–60 Zeichen, Weight 2.0)
  - **Meta-Description** (Pflicht, Länge 120–160 Zeichen, Weight 1.5)
  - **Bild-Alt-Texte** (Anteil Bilder mit `alt`-Attribut; `alt=""` für decorative Images zählt korrekt; Seiten ohne Bilder = volle Punkte, Weight 1.5)
  - **Indexierbarkeit** (`<meta name="robots">` mit `noindex` triggert eine kritische Empfehlung mit Priority 12 — höher als alles andere im System; Weight 2.5)
  - **Mobile-Viewport** (drei Stati: kein Tag = rot/0, Tag ohne `width=device-width` = orange/0.4, korrekt = grün/1; Weight 1.5)
  - **Open Graph & Twitter Cards** (og:title + og:description + og:image + twitter:card mit OG-Fallback, Weight 1.0)

### Changed

- **Kategorie-Layout im Popup:** Sub-Kriterien werden jetzt jedes auf einer eigenen Zeile dargestellt (vorher horizontal mit `•`-Separator und Flex-Wrap). Bessere Lesbarkeit insbesondere bei langen Kriterien-Namen und vielen Sub-Checks pro Kategorie.
- **Empfehlungs-Bullet-Position:** Der orange Bullet sitzt jetzt korrekt auf Höhe der ersten Textzeile — auch wenn die Snippet-Buttons („Snippet anzeigen", „Kopieren") darüber stehen. Vorher war der Bullet bei Items mit Snippet-Buttons leicht verrutscht.
- **Score-Range 0–30 statt 0–25:** Durch die neue 6. Kategorie. Total-Score-Anzeige im Popup, History-Liste und HTML-Report zeigt jetzt `X/30`.
- **`schemaOrg`-Weight in Maschinenlesbarkeit:** Von 2.5 auf 2.0 reduziert, um Platz für das neue `schemaCompleteness` (Weight 1.5) zu machen ohne den Kategorie-Gesamtscore zu verfälschen.
- **Header-Titel:** „Paul AI GEO Analyzer 2.0" → „Paul AI GEO Analyzer 3.0".

### Technical

- Komplette Test-Suite: 71 Tests (von 8 vor dem Release-Zyklus). Neue Test-Dateien: `readability.test.ts` (13), `machine-readability.test.ts` (6), `on-page-seo.test.ts` (16), `fix-snippets.test.ts`.
- Manifest v3-konformes Side-Panel-Setup ohne `default_popup` (damit `sidePanel.setPanelBehavior` greift).
- Cache-Prefix in `src/utils/cache.ts` zweimal gebumpt: `v1` → `v2` (Fix-Snippets-Integration änderte `topRecommendations` von Text auf Keys) → `v3` (neue On-Page-SEO-Kategorie änderte die Result-Shape). Alte Caches werden automatisch ignoriert.
- `PageData`-Type um `ImageData[]`, `OpenGraphData`, `TwitterCardData`, `RobotsMetaData`, `ViewportData` erweitert; neue Extract-Funktionen `extractImages`, `extractOpenGraph`, `extractTwitterCard`, `extractRobotsMeta`, `extractViewport` in `dom-helpers.ts`.

## [2.0.0] - 2026-04-05

### Added

- **Vollständige Internationalisierung (i18n):** Die gesamte Extension-Oberfläche wird nun automatisch in der Browsersprache des Users angezeigt. Unterstützte Sprachen: Deutsch, Englisch, Französisch, Spanisch, Portugiesisch und Italienisch. Die Spracherkennung erfolgt automatisch via `navigator.language` mit Fallback auf Englisch.
  - Alle UI-Texte (Loading, Fehler, Not Supported, History etc.)
  - Scoring-Labels (Excellent/Exzellent/Eccellente etc.)
  - Kategorie-Namen und Kriterien-Bezeichnungen
  - Alle 13 Empfehlungstexte
  - Trend-Anzeige und Zeitangaben
  - Lokalisierte Datumsformate im Analyse-Verlauf

- **Opt-in Analytics:** Analysedaten können optional an einen eigenen Server gesendet werden. Toggle im Footer mit Erklärungs-Text ("Keine persönlichen Daten oder Seiteninhalte werden gesendet"). Fire-and-forget mit 5s Timeout. Standard: deaktiviert. Wird der Toggle nach einer Analyse aktiviert, wird das letzte Ergebnis sofort gesendet.

- **HTML-Report Export:** Analyse-Ergebnisse können als professioneller HTML-Report in einem neuen Tab geöffnet werden. Enthält Gesamtscore, alle Kategorie-Karten mit Fortschrittsbalken, und Top-Empfehlungen. Vollständig lokalisiert in 6 Sprachen. Includes "Als PDF speichern"-Button.

- **Detaillierte Fehler-Erklärungen:** Im HTML-Report wird pro Kriterium erklärt, warum es bestanden oder nicht bestanden hat. Farbcodierte Boxen (grün/gelb/rot) mit konkreten Verbesserungshinweisen. Alle Erklärungen in 6 Sprachen.

- **5. Analyse-Kategorie: KI-Zitierbarkeit (AI Citation Readiness):** Neuer Analyzer prüft, wie gut Inhalte von KI-Systemen zitiert werden können. Gesamtscore geht neu von 0-25 (statt 0-20). Rating-Schwellen angepasst (Exzellent ≥21, Gut ≥16, Verbesserungsbedarf ≥10). Vier Kriterien:
  - Zitierbare Faktenaussagen (Zahlen, Statistiken, "laut"-Patterns)
  - FAQ-/Frage-Antwort-Sektionen (FAQPage-Schema + Heading-Patterns)
  - Aussagen mit Quellenangaben (Zitationsmuster, externe Links)
  - Kerninformationen am Anfang (Definition in den ersten 150 Wörtern)

- **Dark Mode:** Automatische Erkennung via System-Einstellung + manueller Toggle (Mond/Sonne-Icon) oben rechts im Header. Einstellung wird gespeichert. Alle Popup-Elemente, Kategorie-Cards, History-Panel und Footer sind Dark-Mode-kompatibel.

- **Trend-Sparkline:** Mini-Chart im History-Panel zeigt den Score-Verlauf über Zeit als türkise Linie mit Flächenfüllung. Erscheint ab 2+ Einträgen. Canvas-basiert, Dark-Mode-kompatibel.

- **History löschen:** Mülleimer-Icon neben "Analyse-Verlauf" ermöglicht das Löschen der gesamten History für die aktuelle URL.

- **Manuelle Sprachwahl:** Dropdown im Header (z.B. `DE ▼`) ermöglicht das manuelle Umschalten zwischen allen 6 Sprachen — mit Flaggen-Emojis. Einstellung wird gespeichert und überschreibt die Browser-Erkennung.

- **Vergleichsansicht:** Aktuelle Seite mit einer beliebigen URL vergleichen. "Vergleichen"-Button neben dem Export öffnet ein URL-Eingabefeld. Die zweite Seite wird im Hintergrund analysiert, dann öffnet sich ein Side-by-Side-Vergleich mit Gesamtscore, allen Kategorien nebeneinander und einer Zusammenfassung (Stärken/Schwächen pro Seite).

- **Accessibility:** ARIA-Labels auf allen interaktiven Elementen (Buttons, Toggles, Dropdowns, Progressbars). Korrekte Rollen (role="menu", role="alert", role="status", role="progressbar"). aria-expanded auf Dropdowns und History-Panel. Keyboard-Navigation: Escape schliesst Dropdowns. Screen-Reader-kompatibel.

- **Modernes SaaS-Design für Report & Vergleich:** Beide Exportseiten wurden neu gestaltet mit Inter-Font, Mesh-Gradient-Header, Glaseffekt-Cards, 2-Spalten Bento-Grid, Line-Icons pro Kategorie, animiertem Count-up für Scores, gleitenden Progress-Bars und Flash-Animationen auf Delta-Badges.

### Changed

- Analytics-Toggle zeigt jetzt "GEO Analyzer verbessern" mit Erklärungstext statt einfacher Checkbox
- Export-Button und Analytics-Toggle sind in separate Bereiche aufgeteilt
- History-Liste hat Abstand zum Scrollbar (pr-2)
- Vergleichslogik läuft jetzt im Background Service Worker (Popup kann sich schließen ohne den Vorgang abzubrechen)
- `host_permissions` für alle URLs hinzugefügt (für Hintergrund-Analyse beim Vergleich)

## [1.1.0]

- Score tracking, trend analysis and history
- Badge on extension icon with auto-clear

## [1.0.0]

- Initial release
- GEO analysis with 4 categories
- Top 5 recommendations
- Privacy-first local analysis
