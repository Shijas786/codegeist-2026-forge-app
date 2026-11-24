// Rovo actions. The same functions back the Precedent agent and the tools exposed through the Rovo MCP server.
import * as service from './service.js';
import * as store from './store.js';

const issueKeyFrom = (payload) => {
  const fromInput = String(payload.issueKey || '').toUpperCase().match(/[A-Z][A-Z0-9_]+-\d+/);
  if (fromInput) return fromInput[0];
  const ctx = payload.context?.jira;
  if (ctx?.issueKey && /-\d+$/.test(String(ctx.issueKey))) return String(ctx.issueKey);
  const fromUrl = String(ctx?.url || '').match(/browse\/([A-Z][A-Z0-9_]+-\d+)/);
  return fromUrl ? fromUrl[1] : null;
};

const shapeMatch = (m) => ({
  ...service.summarize(m.decision),
  relevance: m.score,
  whyRelevant: m.reasons,
  contradiction: m.conflict ? m.conflict.reason : null,
});

export async function searchDecisions(payload) {
  const matches = await service.search(payload.query, { projectKey: payload.projectKey?.toUpperCase(), status: payload.status });
  return { count: matches.length, decisions: matches.map(shapeMatch) };
}

export async function getDecisionsForIssue(payload) {
  const issueKey = issueKeyFrom(payload);
  if (!issueKey) return { error: 'Provide an issue key such as PAY-12.' };
  const res = await service.decisionsForIssue(issueKey, { cloudId: payload.context?.cloudId });
  if (res.error) return res;
  return {
    issue: { key: res.issue.key, summary: res.issue.summary, status: res.issue.status },
    connectedContext: res.context,
    decisions: res.matches.map(shapeMatch),
    contradictions: res.matches.filter((m) => m.conflict).map((m) => ({ decision: m.decision.id, reason: m.conflict.reason })),
  };
}

export async function checkProposal(payload) {
  const res = await service.checkProposal(payload.proposal, payload.projectKey?.toUpperCase());
  return {
    verdict: res.conflicts.length ? 'CONTRADICTS_EXISTING_DECISION' : res.matches.length ? 'RELATED_DECISIONS_EXIST' : 'NO_PRIOR_DECISION',
    contradictions: res.conflicts.map(shapeMatch),
    related: res.matches.filter((m) => !m.conflict).map(shapeMatch),
  };
}

export async function recordDecision(payload, context) {
  const res = await service.recordDecision({
    title: payload.title,
    statement: payload.statement,
    rationale: payload.rationale,
    issueKey: issueKeyFrom(payload),
    projectKey: payload.projectKey?.toUpperCase() || payload.context?.jira?.projectKey,
    supersedes: payload.supersedes,
    decidedBy: context?.accountId || context?.principal?.accountId,
    capturedVia: 'agent',
  });
  return res.error ? res : { recorded: service.summarize(res.decision) };
}

export async function supersedeDecision(payload, context) {
  const id = String(payload.decisionId || '').toUpperCase();
  const existing = await store.getDecision(id);
  if (!(await service.canSeeDecision(existing))) return { error: `Decision ${id} does not exist.` };
  if (payload.newStatement) {
    const res = await service.recordDecision({
      statement: payload.newStatement,
      rationale: payload.rationale,
      issueKey: issueKeyFrom(payload) || existing.sourceIssueKey,
      projectKey: existing.projectKey,
      supersedes: id,
      decidedBy: context?.accountId,
      capturedVia: 'agent',
    });
    return res.error ? res : { superseded: id, replacedBy: service.summarize(res.decision) };
  }
  await store.supersedeDecision(id, null, context?.accountId);
  return { superseded: id };
}
