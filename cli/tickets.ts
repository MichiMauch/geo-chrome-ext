// Ticket plan from a snapshot: one ticket per recommendation and site, with
// every affected page, instead of one per page and finding. The plan only says
// what the run found; whether that means "create", "comment" or "reopen"
// depends on the tracker and is decided by whoever executes the plan, by
// looking up the marker. Deterministic: same snapshots, same plan.
import { getFixSnippet } from '../src/utils/fix-snippets';
import { setLang } from '../src/utils/i18n';
import type { Finding, Snapshot } from './snapshot';
import { diffSnapshots, type FindingChange } from './diff';
import { l } from './labels';

export const TICKET_PLAN_FORMAT = 'geo-tickets/1';

// Listed in full up to this many pages, the rest as "… and N more"
const MAX_LISTED_PAGES = 25;

export interface PlannedTicket {
  // Put into the ticket (description or label) and searched for before
  // creating one: geo:<host>:<recommendation key>
  marker: string;
  key: string;
  // open: the finding is on at least one page now. resolved: it was there in
  // the baseline and is gone from every page analyzed in both runs.
  state: 'open' | 'resolved';
  owner: Finding['owner'];
  effort: Finding['effort'];
  priority: number;
  title: string;
  body: string;
  pages: string[];
  change?: { before: number; after: number; newOn: string[]; fixedOn: string[] };
}

export interface TicketPlan {
  format: typeof TICKET_PLAN_FORMAT;
  site: string;
  createdAt: string;
  snapshotCreatedAt: string;
  baselineCreatedAt?: string;
  tickets: PlannedTicket[];
}

export interface TicketOptions {
  baseline?: Snapshot;
  owner?: Finding['owner'];
  // Leave out findings below this priority (see RECOMMENDATION_KEYS)
  minPriority?: number;
}

export const markerOf = (origin: string, key: string): string => `geo:${hostOf(origin)}:${key}`;

function hostOf(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

// "Machen Sie den Autor … sichtbar (E-E-A-T)." → title without the trailing
// period, cut at the first sentence and at 90 characters
export function titleOf(text: string): string {
  const first = text.split(/(?<=[.!?])\s/)[0].replace(/[.!?]$/, '');
  return `GEO: ${first.length > 90 ? `${first.slice(0, 89).trimEnd()}…` : first}`;
}

const dateOf = (iso: string) => iso.slice(0, 10);

function pageList(paths: string[], origin: string): string {
  const shown = paths.slice(0, MAX_LISTED_PAGES).map((p) => `- ${origin}${p}`);
  if (paths.length > MAX_LISTED_PAGES) shown.push(`- ${l('morePages', { n: paths.length - MAX_LISTED_PAGES })}`);
  return shown.join('\n');
}

function bodyOf(
  finding: Finding,
  pages: string[],
  snapshot: Snapshot,
  change: FindingChange | undefined,
  state: PlannedTicket['state']
): string {
  const parts: string[] = [];
  parts.push(`**${l(`owner_${finding.owner}`)}** · ${l(`effort_${finding.effort}`)}`);
  if (state === 'resolved') {
    parts.push(l('ticketResolved', { date: dateOf(snapshot.createdAt) }));
  } else {
    parts.push(`## ${l('ticketWhat')}\n\n${finding.text}`);
    parts.push(`## ${l('ticketPages')} (${pages.length})\n\n${pageList(pages, snapshot.origin)}`);
    const snippet = getFixSnippet(finding.key);
    if (snippet?.type === 'snippet') {
      parts.push(`## ${l('ticketSnippet')}\n\n${snippet.note ? `${snippet.note}\n\n` : ''}\`\`\`\n${snippet.code}\n\`\`\``);
    }
  }
  if (change && (change.newOn.length || change.fixedOn.length)) {
    const lines = [`## ${l('ticketChange')}`, '', `${l('before')}: ${change.before} · ${l('after')}: ${change.after}`];
    if (change.fixedOn.length) lines.push('', `${l('fixed')}:`, pageList(change.fixedOn, snapshot.origin));
    if (change.newOn.length) lines.push('', `${l('new')}:`, pageList(change.newOn, snapshot.origin));
    parts.push(lines.join('\n'));
  }
  parts.push(
    `---\n${l('ticketSource', { version: snapshot.tool.version, date: dateOf(snapshot.createdAt) })}\n\n\`${markerOf(snapshot.origin, finding.key)}\``
  );
  return parts.join('\n\n');
}

export function planTickets(snapshot: Snapshot, options: TicketOptions = {}): TicketPlan {
  setLang(snapshot.lang);
  const diff = options.baseline ? diffSnapshots(options.baseline, snapshot) : undefined;
  const changes = new Map((diff?.findings ?? []).map((c) => [c.key, c]));

  // Pages per finding in this run
  const open = new Map<string, { finding: Finding; pages: string[] }>();
  for (const page of snapshot.pages) {
    for (const f of page.findings ?? []) {
      const entry = open.get(f.key) ?? { finding: f, pages: [] };
      entry.pages.push(page.path);
      open.set(f.key, entry);
    }
  }

  const keep = (f: Pick<Finding, 'owner' | 'priority'>) =>
    (!options.owner || f.owner === options.owner) && f.priority >= (options.minPriority ?? 0);

  const tickets: PlannedTicket[] = [];
  for (const { finding, pages } of open.values()) {
    if (!keep(finding)) continue;
    const change = changes.get(finding.key);
    tickets.push(ticketOf(finding, pages, snapshot, change, 'open'));
  }
  // Gone from every common page: only worth a ticket action if it was there
  for (const change of changes.values()) {
    if (open.has(change.key) || change.before === 0 || !keep(change)) continue;
    const finding: Finding = { ...change, fingerprint: '' };
    tickets.push(ticketOf(finding, [], snapshot, change, 'resolved'));
  }

  tickets.sort(
    (a, b) =>
      (a.state === b.state ? 0 : a.state === 'open' ? -1 : 1) ||
      b.priority - a.priority ||
      b.pages.length - a.pages.length ||
      a.key.localeCompare(b.key)
  );

  return {
    format: TICKET_PLAN_FORMAT,
    site: hostOf(snapshot.origin),
    createdAt: new Date().toISOString(),
    snapshotCreatedAt: snapshot.createdAt,
    ...(options.baseline ? { baselineCreatedAt: options.baseline.createdAt } : {}),
    tickets,
  };
}

function ticketOf(
  finding: Finding,
  pages: string[],
  snapshot: Snapshot,
  change: FindingChange | undefined,
  state: PlannedTicket['state']
): PlannedTicket {
  return {
    marker: markerOf(snapshot.origin, finding.key),
    key: finding.key,
    state,
    owner: finding.owner,
    effort: finding.effort,
    priority: finding.priority,
    title: titleOf(finding.text),
    body: bodyOf(finding, pages, snapshot, change, state),
    pages,
    ...(change
      ? { change: { before: change.before, after: change.after, newOn: change.newOn, fixedOn: change.fixedOn } }
      : {}),
  };
}
