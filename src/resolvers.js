import Resolver from '@forge/resolver';
import * as service from './service.js';
import * as store from './store.js';
import * as graph from './graph.js';
import * as jira from './jira.js';

const resolver = new Resolver();

const ext = (req) => req.context.extension || {};
const who = async (req) => (await jira.getUserName(req.context.accountId, 'user')) || 'unknown';

// Load a decision for a write, refusing ids from projects the caller cannot browse.
const editable = async (id) => {
  const d = await store.getDecision(id);
  return (await service.canSeeDecision(d)) ? d : null;
};
const DENIED = { error: 'That decision does not exist or you do not have access to its project.' };

resolver.define('issuePanel', async (req) => {
  const issueKey = ext(req).issue?.key;
  const res = await service.decisionsForIssue(issueKey, { cloudId: req.context.cloudId });
  if (res.error) return res;
  const candidates = (await store.listCandidates()).filter((c) => c.issueKey === res.issue.key && !c.dismissed);
  return { issue: res.issue, context: res.context, matches: res.matches, candidates };
});

resolver.define('recordDecision', async (req) => {
  const p = req.payload;
  // Only these fields come from the client; author and date are set here, never taken from the payload.
  const input = { title: p.title, statement: p.statement, rationale: p.rationale, supersedes: p.supersedes };
  const candidate = p.candidateId ? await store.getCandidate(p.candidateId) : null;
  if (candidate) {
    // Recording a teammate's comment: the decision is theirs, made when they wrote it.
    Object.assign(input, {
      issueKey: candidate.issueKey,
      commentId: candidate.commentId,
      decidedBy: candidate.authorId,
      decidedByName: candidate.authorName,
      decidedAt: candidate.created || undefined,
      capturedVia: 'review',
    });
  } else {
    Object.assign(input, {
      issueKey: ext(req).issue?.key || p.issueKey,
      projectKey: ext(req).project?.key,
      decidedBy: req.context.accountId,
      capturedVia: 'panel',
    });
  }
  const res = await service.recordDecision(input);
  if (res.decision && candidate) {
    await store.dismissCandidate(candidate.id);
    await store.updateDecision(res.decision.id, {}, await who(req), 'Confirmed from a comment');
  }
  return res;
});

resolver.define('supersede', async (req) => ((await editable(req.payload.id)) ? store.supersedeDecision(req.payload.id, null, await who(req)) : DENIED));

resolver.define('reactivate', async (req) =>
  (await editable(req.payload.id))
    ? store.updateDecision(req.payload.id, { status: 'active', supersededBy: null }, await who(req), 'Reinstated')
    : DENIED
);

resolver.define('linkToIssue', async (req) => {
  const d = await editable(req.payload.id);
  const key = ext(req).issue?.key;
  if (!d || !key) return DENIED;
  return store.updateDecision(d.id, { appliesTo: [...new Set([...(d.appliesTo || []), key])] }, await who(req), `Linked to ${key}`);
});

resolver.define('deleteDecision', async (req) => ((await editable(req.payload.id)) ? store.deleteDecision(req.payload.id) : DENIED));

resolver.define('dismissCandidate', async (req) => store.dismissCandidate(req.payload.id));

resolver.define('overview', async (req) => {
  const project = ext(req).project;
  return service.projectOverview({ projectKey: project.key, projectId: project.id, cloudId: req.context.cloudId });
});

resolver.define('scan', async (req) => {
  const project = ext(req).project;
  return service.scanProject({ projectKey: project.key, projectId: project.id, cloudId: req.context.cloudId });
});

resolver.define('search', async (req) => service.search(req.payload.query, { projectKey: ext(req).project?.key }));

resolver.define('check', async (req) => service.checkProposal(req.payload.text, ext(req).project?.key));

resolver.define('settings', async (req) => {
  const isAdmin = await jira.isJiraAdmin();
  if (req.payload?.patch) {
    // Settings apply to the whole site, so only Jira administrators change them.
    if (!isAdmin) return { ...(await store.getSettings()), isAdmin, error: 'Only Jira administrators can change these settings.' };
    const { autoCapture, acknowledgeInComment } = req.payload.patch;
    const patch = {};
    if (typeof autoCapture === 'boolean') patch.autoCapture = autoCapture;
    if (typeof acknowledgeInComment === 'boolean') patch.acknowledgeInComment = acknowledgeInComment;
    return { ...(await store.saveSettings(patch)), isAdmin };
  }
  return { ...(await store.getSettings()), isAdmin, graphConnected: await graph.ping() };
});

export const handler = resolver.getDefinitions();
