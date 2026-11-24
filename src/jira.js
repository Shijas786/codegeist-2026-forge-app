// Thin Jira REST helpers. `as` is 'user' or 'app'; user calls fall back to the app when no user session exists
// (for example a tool call arriving through MCP or an automation rule).
import api, { route } from '@forge/api';
import { adfToText } from './text.js';

async function request(as, path, options) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  const opts = { ...options, headers };
  if (as === 'user') {
    try {
      const res = await api.asUser().requestJira(path, opts);
      if (res.status !== 401 && res.status !== 403) return res;
    } catch (e) {
      // no user context: fall through to the app
    }
  }
  return api.asApp().requestJira(path, opts);
}

const FIELDS = 'summary,description,components,labels,issuelinks,parent,project,status,issuetype';

export function shapeIssue(issue) {
  const f = issue.fields || {};
  const linkedKeys = (f.issuelinks || []).map((l) => (l.inwardIssue || l.outwardIssue || {}).key).filter(Boolean);
  const description = adfToText(f.description);
  return {
    id: issue.id,
    key: issue.key,
    summary: f.summary || '',
    description,
    text: `${f.summary || ''}\n${description}`,
    components: (f.components || []).map((c) => c.name),
    labels: f.labels || [],
    linkedKeys,
    parentKey: f.parent?.key || null,
    projectKey: f.project?.key || issue.key.split('-')[0],
    projectId: f.project?.id || null,
    status: f.status?.name || '',
    statusCategory: f.status?.statusCategory?.key || '',
    type: f.issuetype?.name || '',
  };
}

export async function getIssue(issueKey, as = 'user') {
  const res = await request(as, route`/rest/api/3/issue/${issueKey}?fields=${FIELDS}`);
  if (!res.ok) return null;
  return shapeIssue(await res.json());
}

export async function getComment(issueKey, commentId, as = 'app') {
  const res = await request(as, route`/rest/api/3/issue/${issueKey}/comment/${commentId}`);
  if (!res.ok) return null;
  const c = await res.json();
  return { id: c.id, text: adfToText(c.body), authorId: c.author?.accountId, authorName: c.author?.displayName, authorType: c.author?.accountType, created: c.created };
}

export async function getComments(issueKey, as = 'user', max = 50) {
  const res = await request(as, route`/rest/api/3/issue/${issueKey}/comment?maxResults=${max}&orderBy=-created`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.comments || []).map((c) => ({ id: c.id, text: adfToText(c.body), authorId: c.author?.accountId, authorName: c.author?.displayName, authorType: c.author?.accountType, created: c.created }));
}

export async function addComment(issueKey, text, as = 'app') {
  const body = { body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } };
  const res = await request(as, route`/rest/api/3/issue/${issueKey}/comment`, { method: 'POST', body: JSON.stringify(body) });
  return res.ok;
}

export async function searchIssues(jql, as = 'user', max = 50) {
  const res = await request(as, route`/rest/api/3/search/jql`, {
    method: 'POST',
    body: JSON.stringify({ jql, maxResults: max, fields: FIELDS.split(',') }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.issues || []).map(shapeIssue);
}

export async function getUserName(accountId, as = 'app') {
  if (!accountId) return null;
  const res = await request(as, route`/rest/api/3/user?accountId=${accountId}`);
  if (!res.ok) return null;
  return (await res.json()).displayName || null;
}
