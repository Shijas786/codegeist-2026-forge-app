// Use cases shared by the Jira UI, the Rovo agent actions, the MCP tools and the comment trigger.
import * as store from './store.js';
import * as jira from './jira.js';
import * as graph from './graph.js';
import { rankDecisions, searchDecisions } from './relevance.js';
import { parseExplicitDecision, detectDecisionLanguage, titleFromStatement } from './detect.js';
import { truncate } from './text.js';

const STALE_DAYS = 180;

export function summarize(d) {
  return {
    id: d.id,
    title: d.title,
    statement: d.statement,
    rationale: d.rationale,
    status: d.status,
    project: d.projectKey,
    sourceIssue: d.sourceIssueKey,
    decidedBy: d.decidedByName,
    decidedAt: d.decidedAt,
    supersededBy: d.supersededBy,
    tags: d.tags,
    components: d.components,
  };
}

export async function recordDecision(input, as = 'user') {
  const statement = String(input.statement || '').trim();
  if (statement.length < 8) return { error: 'A decision needs a statement of at least 8 characters.' };
  let issue = null;
  if (input.issueKey) issue = await jira.getIssue(String(input.issueKey).toUpperCase(), as);
  const decidedByName = input.decidedByName || (await jira.getUserName(input.decidedBy, as));
  const decision = await store.createDecision({
    title: (input.title && String(input.title).trim()) || titleFromStatement(statement),
    statement,
    rationale: input.rationale,
    projectKey: issue?.projectKey || input.projectKey || null,
    sourceIssueKey: issue?.key || null,
    sourceCommentId: input.commentId || null,
    components: issue?.components || [],
    tags: [...new Set([...(issue?.labels || []), ...(input.tags || [])])],
    decidedBy: input.decidedBy,
    decidedByName,
    capturedVia: input.capturedVia,
    decidedAt: input.decidedAt,
    supersedes: input.supersedes ? String(input.supersedes).toUpperCase() : null,
  });
  return { decision };
}

// Decisions that bear on one issue, with the reason each one matched and any contradiction.
export async function decisionsForIssue(issueKey, { cloudId, as = 'user', withGraph = true } = {}) {
  const issue = await jira.getIssue(String(issueKey).toUpperCase(), as);
  if (!issue) return { error: `Issue ${issueKey} was not found or is not visible.` };
  const [decisions, context] = await Promise.all([
    store.listDecisions(),
    withGraph && cloudId ? graph.getIssueContext(cloudId, issue.id) : Promise.resolve(null),
  ]);
  const graphText = context ? [...context.goals.map((g) => g.name), ...context.pullRequests.map((p) => p.title)].join('\n') : '';
  const ranked = rankDecisions({ ...issue, text: `${issue.text}\n${graphText}` }, decisions);
  return { issue, context, matches: ranked };
}

// Check a proposal (free text) against the ledger before work starts.
export async function checkProposal(text, projectKey) {
  const decisions = await store.listDecisions();
  const pool = projectKey ? decisions.filter((d) => !d.projectKey || d.projectKey === projectKey) : decisions;
  const ranked = rankDecisions({ key: null, text }, pool, { minScore: 8, limit: 8 });
  return {
    matches: ranked,
    conflicts: ranked.filter((r) => r.conflict),
  };
}

export async function search(query, { projectKey, status } = {}) {
  const decisions = await store.listDecisions({ projectKey, status });
  return searchDecisions(query, decisions, 15);
}

// Called for every new Jira comment: explicit "DECISION:" markers are recorded, decision-sounding ones are queued.
export async function handleComment({ issueKey, commentId }) {
  const settings = await store.getSettings();
  const comment = await jira.getComment(issueKey, commentId, 'app');
  if (!comment || comment.authorType === 'app') return { skipped: true };
  const explicit = parseExplicitDecision(comment.text);
  if (explicit && settings.autoCapture) {
    const { decision } = await recordDecision(
      { ...explicit, issueKey, commentId, decidedBy: comment.authorId, decidedByName: comment.authorName, capturedVia: 'comment', decidedAt: comment.created },
      'app'
    );
    if (decision && settings.acknowledgeInComment) {
      await jira.addComment(issueKey, `Precedent recorded this as ${decision.id}: "${truncate(decision.title, 120)}". It will now surface on related work.`, 'app');
    }
    return { recorded: decision?.id };
  }
  const guess = detectDecisionLanguage(comment.text);
  if (guess) {
    await store.saveCandidate({
      issueKey,
      commentId,
      projectKey: issueKey.split('-')[0],
      statement: guess.statement,
      confidence: guess.confidence,
      authorId: comment.authorId,
      authorName: comment.authorName,
      created: comment.created,
      foundVia: 'comment event',
    });
    return { candidate: true };
  }
  return { skipped: true };
}

// Walk the project's recent work through Teamwork Graph and queue decision-sounding comments nobody recorded.
export async function scanProject({ cloudId, projectKey, projectId, since = 'P30D' }) {
  const recorded = new Set((await store.listDecisions()).map((d) => `${d.sourceIssueKey}:${d.sourceCommentId}`));
  let source = 'Teamwork Graph';
  let items = cloudId && projectId ? await graph.getSpaceWorkItems(cloudId, projectId) : null;
  let scannedComments = 0;
  let found = 0;

  const consider = async (issueKey, c) => {
    scannedComments += 1;
    if (!c.text || recorded.has(`${issueKey}:${c.id}`) || parseExplicitDecision(c.text)) return;
    const guess = detectDecisionLanguage(c.text);
    if (!guess) return;
    const saved = await store.saveCandidate({
      issueKey,
      commentId: c.id,
      projectKey,
      statement: guess.statement,
      confidence: guess.confidence,
      authorId: c.authorId || null,
      authorName: c.authorName,
      created: c.created,
      foundVia: source,
    });
    if (saved) found += 1;
  };

  if (items && items.length) {
    for (const item of items.slice(0, 40)) {
      const comments = await graph.getWorkItemComments(item.ari, since);
      for (const c of comments) await consider(item.key, c);
    }
  } else {
    // Graph scopes not granted (or nothing indexed yet): fall back to Jira search so the scan still works.
    source = 'Jira search';
    const issues = await jira.searchIssues(`project = "${projectKey}" AND updated >= -30d ORDER BY updated DESC`, 'user', 40);
    items = issues.map((i) => ({ key: i.key }));
    for (const issue of issues) {
      for (const c of await jira.getComments(issue.key, 'user', 25)) await consider(issue.key, c);
    }
  }
  return { source, scannedIssues: Math.min(items.length, 40), scannedComments, found };
}

// Health of the ledger for one project: what is at risk right now.
export async function projectOverview({ projectKey, cloudId, projectId }) {
  const [decisions, candidates] = await Promise.all([store.listDecisions({ projectKey }), store.listCandidates(projectKey)]);
  const active = decisions.filter((d) => d.status === 'active');
  const now = Date.now();
  const stale = active.filter((d) => now - new Date(d.decidedAt).getTime() > STALE_DAYS * 864e5);

  const open = await jira.searchIssues(`project = "${projectKey}" AND statusCategory != Done ORDER BY updated DESC`, 'user', 50);
  const conflicts = [];
  for (const issue of open) {
    for (const m of rankDecisions(issue, active, { minScore: 20, limit: 5 })) {
      if (m.conflict && m.decision.sourceIssueKey !== issue.key) {
        conflicts.push({ issueKey: issue.key, summary: issue.summary, status: issue.status, decisionId: m.decision.id, decisionTitle: m.decision.title, reason: m.conflict.reason });
      }
    }
  }
  const teams = cloudId && projectId ? await graph.getSpaceTeams(cloudId, projectId) : [];
  const byMonth = {};
  for (const d of decisions) {
    const m = d.decidedAt.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + 1;
  }
  return {
    decisions,
    candidates: candidates.filter((c) => !c.dismissed),
    conflicts,
    teams,
    stats: {
      total: decisions.length,
      active: active.length,
      superseded: decisions.length - active.length,
      stale: stale.length,
      conflicts: conflicts.length,
      openIssuesChecked: open.length,
      byMonth: Object.entries(byMonth).sort().map(([month, count]) => ({ month, count })),
    },
  };
}
