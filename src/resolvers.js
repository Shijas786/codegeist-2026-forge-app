import Resolver from '@forge/resolver';
import * as service from './service.js';
import * as store from './store.js';
import * as graph from './graph.js';
import * as jira from './jira.js';

const resolver = new Resolver();

const ext = (req) => req.context.extension || {};
const who = async (req) => (await jira.getUserName(req.context.accountId, 'user')) || 'unknown';

resolver.define('issuePanel', async (req) => {
  const issueKey = ext(req).issue?.key;
  const res = await service.decisionsForIssue(issueKey, { cloudId: req.context.cloudId });
  if (res.error) return res;
  const candidates = (await store.listCandidates()).filter((c) => c.issueKey === issueKey && !c.dismissed);
  return { issue: res.issue, context: res.context, matches: res.matches, candidates };
});

resolver.define('recordDecision', async (req) => {
  const p = req.payload;
  const res = await service.recordDecision({
    ...p,
    issueKey: p.issueKey || ext(req).issue?.key,
    projectKey: p.projectKey || ext(req).project?.key,
    decidedBy: req.context.accountId,
    capturedVia: p.capturedVia || 'panel',
  });
  if (res.decision && p.candidateId) await store.dismissCandidate(p.candidateId);
  return res;
});

resolver.define('supersede', async (req) => store.supersedeDecision(req.payload.id, null, await who(req)));

resolver.define('reactivate', async (req) =>
  store.updateDecision(req.payload.id, { status: 'active', supersededBy: null }, await who(req), 'Reinstated')
);

resolver.define('linkToIssue', async (req) => {
  const d = await store.getDecision(req.payload.id);
  if (!d) return null;
  const key = req.payload.issueKey || ext(req).issue?.key;
  return store.updateDecision(d.id, { appliesTo: [...new Set([...(d.appliesTo || []), key])] }, await who(req), `Linked to ${key}`);
});

resolver.define('deleteDecision', async (req) => store.deleteDecision(req.payload.id));

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
  if (req.payload?.patch) return store.saveSettings(req.payload.patch);
  return { ...(await store.getSettings()), graphConnected: await graph.ping() };
});

export const handler = resolver.getDefinitions();
