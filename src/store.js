// Decision ledger persisted in Forge KVS. One record per decision, plus a per-site counter and candidate inbox.
import { kvs, WhereConditions } from '@forge/kvs';

const DECISION = 'decision:';
const CANDIDATE = 'candidate:';
const COUNTER = 'meta:counter';

async function listByPrefix(prefix) {
  const out = [];
  let cursor;
  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(100);
    if (cursor) q = q.cursor(cursor);
    const page = await q.getMany();
    out.push(...page.results.map((r) => r.value));
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

export async function listDecisions({ projectKey, status } = {}) {
  const all = await listByPrefix(DECISION);
  return all
    .filter((d) => (!projectKey || d.projectKey === projectKey) && (!status || d.status === status))
    .sort((a, b) => (a.decidedAt < b.decidedAt ? 1 : -1));
}

export async function getDecision(id) {
  return kvs.get(DECISION + String(id).toUpperCase());
}

async function nextId() {
  const n = ((await kvs.get(COUNTER)) || 0) + 1;
  await kvs.set(COUNTER, n);
  return `D-${n}`;
}

export async function createDecision(input) {
  const id = await nextId();
  const now = new Date().toISOString();
  const decision = {
    id,
    title: input.title,
    statement: input.statement,
    rationale: input.rationale || '',
    status: 'active',
    projectKey: input.projectKey || null,
    sourceIssueKey: input.sourceIssueKey || null,
    sourceCommentId: input.sourceCommentId || null,
    sourceUrl: input.sourceUrl || null,
    components: input.components || [],
    tags: input.tags || [],
    appliesTo: input.appliesTo || [],
    decidedBy: input.decidedBy || null,
    decidedByName: input.decidedByName || null,
    capturedVia: input.capturedVia || 'panel',
    decidedAt: input.decidedAt || now,
    createdAt: now,
    updatedAt: now,
    supersededBy: null,
    supersedes: input.supersedes || null,
    history: [{ at: now, by: input.decidedByName || input.decidedBy || 'unknown', event: `Recorded via ${input.capturedVia || 'panel'}` }],
  };
  await kvs.set(DECISION + id, decision);
  if (decision.supersedes) await supersedeDecision(decision.supersedes, id, decision.decidedByName);
  return decision;
}

export async function updateDecision(id, patch, by = 'unknown', event = 'Updated') {
  const current = await getDecision(id);
  if (!current) return null;
  const now = new Date().toISOString();
  const next = { ...current, ...patch, id: current.id, updatedAt: now, history: [...(current.history || []), { at: now, by, event }] };
  await kvs.set(DECISION + current.id, next);
  return next;
}

export function supersedeDecision(id, byDecisionId, by) {
  return updateDecision(id, { status: 'superseded', supersededBy: byDecisionId || null }, by, byDecisionId ? `Superseded by ${byDecisionId}` : 'Marked superseded');
}

export async function deleteDecision(id) {
  await kvs.delete(DECISION + String(id).toUpperCase());
}

// Candidates: comments that sound like a decision but were never recorded.
export async function listCandidates(projectKey) {
  const all = await listByPrefix(CANDIDATE);
  return all.filter((c) => !projectKey || c.projectKey === projectKey).sort((a, b) => b.confidence - a.confidence);
}

export async function saveCandidate(c) {
  const key = `${CANDIDATE}${c.issueKey}:${c.commentId}`;
  if (await kvs.get(key)) return false;
  await kvs.set(key, { ...c, id: `${c.issueKey}:${c.commentId}`, foundAt: new Date().toISOString() });
  return true;
}

export async function getCandidate(id) {
  return kvs.get(CANDIDATE + id);
}

export async function dismissCandidate(id) {
  const c = await kvs.get(CANDIDATE + id);
  if (c) await kvs.set(CANDIDATE + id, { ...c, dismissed: true });
}

export async function getSettings() {
  return { acknowledgeInComment: true, autoCapture: true, ...((await kvs.get('meta:settings')) || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await kvs.set('meta:settings', next);
  return next;
}
