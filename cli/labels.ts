// Labels of the CLI's own output (terminal, Markdown, tickets). Criterion
// names and recommendation texts come from the extension's i18n in all six
// languages; the frame around them is German for de and English otherwise.
import { getLang } from '../src/utils/i18n';

const de = {
  score: 'Score',
  pages: 'Seiten',
  analyzed: 'analysiert',
  failed: 'fehlgeschlagen',
  average: 'Durchschnitt',
  findings: 'Befunde',
  criteria: 'Kriterien',
  met: 'erfüllt',
  missing: 'fehlt',
  fix: 'Behebung',
  owner_editorial: 'Redaktion',
  owner_dev: 'Entwicklung',
  effort_quick: 'schnell',
  effort_medium: 'mittel',
  effort_project: 'Projekt',
  onPages: 'auf {n} Seiten',
  onPage: 'auf 1 Seite',
  comparison: 'Vergleich',
  before: 'vorher',
  after: 'nachher',
  change: 'Veränderung',
  commonPages: 'Seiten in beiden Läufen',
  pagesAdded: 'Neue Seiten',
  pagesRemoved: 'Weggefallene Seiten',
  pagesFailed: 'Seiten mit Fehler',
  fixed: 'behoben',
  new: 'neu',
  pagesUp: 'Seiten besser',
  pagesDown: 'Seiten schlechter',
  byFinding: 'Befunde nach Empfehlung',
  byPage: 'Seiten mit Veränderung',
  noChanges: 'Keine Veränderung auf den Seiten, die in beiden Läufen analysiert wurden.',
  versionChanged:
    'Die Läufe stammen von verschiedenen Analyzer-Versionen ({from} → {to}). Unterschiede können von geänderten Regeln kommen, nicht nur von der Site.',
  newCriteria: 'Neu geprüfte Kriterien',
  criteriaFixed: 'Kriterien neu erfüllt',
  criteriaRegressed: 'Kriterien neu verfehlt',
  regression: 'Rückschritt gegenüber der Basis.',
  belowMin: 'Score unter {min}.',
  ticketWhat: 'Was zu tun ist',
  ticketPages: 'Betroffene Seiten',
  ticketSnippet: 'Vorlage',
  ticketChange: 'Seit dem letzten Lauf',
  ticketSource:
    'Erstellt vom GEO Analyzer {version}, Lauf vom {date}. Der Befund lässt sich mit `geo <url>` auf jeder der Seiten nachprüfen.',
  ticketResolved: 'Auf keiner der geprüften Seiten mehr gefunden (Lauf vom {date}).',
  morePages: '… und {n} weitere',
};

const en: typeof de = {
  score: 'Score',
  pages: 'pages',
  analyzed: 'analyzed',
  failed: 'failed',
  average: 'Average',
  findings: 'Findings',
  criteria: 'Criteria',
  met: 'met',
  missing: 'missing',
  fix: 'Fix',
  owner_editorial: 'Editorial',
  owner_dev: 'Development',
  effort_quick: 'quick',
  effort_medium: 'medium',
  effort_project: 'project',
  onPages: 'on {n} pages',
  onPage: 'on 1 page',
  comparison: 'Comparison',
  before: 'before',
  after: 'after',
  change: 'Change',
  commonPages: 'Pages in both runs',
  pagesAdded: 'New pages',
  pagesRemoved: 'Pages gone',
  pagesFailed: 'Pages with errors',
  fixed: 'fixed',
  new: 'new',
  pagesUp: 'Pages better',
  pagesDown: 'Pages worse',
  byFinding: 'Findings by recommendation',
  byPage: 'Pages that changed',
  noChanges: 'No change on the pages analyzed in both runs.',
  versionChanged:
    'The runs come from different analyzer versions ({from} → {to}). Differences may come from changed rules, not only from the site.',
  newCriteria: 'Newly checked criteria',
  criteriaFixed: 'Criteria now met',
  criteriaRegressed: 'Criteria now failing',
  regression: 'Regression against the baseline.',
  belowMin: 'Score below {min}.',
  ticketWhat: 'What to do',
  ticketPages: 'Affected pages',
  ticketSnippet: 'Template',
  ticketChange: 'Since the last run',
  ticketSource:
    'Created by GEO Analyzer {version}, run of {date}. Check the finding on any of the pages with `geo <url>`.',
  ticketResolved: 'No longer found on any of the checked pages (run of {date}).',
  morePages: '… and {n} more',
};

export type LabelKey = keyof typeof de;

export function l(key: LabelKey, params?: Record<string, string | number>): string {
  let text = (getLang() === 'de' ? de : en)[key];
  for (const [k, v] of Object.entries(params ?? {})) text = text.split(`{${k}}`).join(String(v));
  return text;
}
