// Teamwork Graph (curated queries). Everything here is best effort: a site without the scopes granted,
// or without connected tools, returns empty context and the app keeps working on Jira data alone.
import api from '@forge/api';

async function twg(query, variables) {
  try {
    const res = await api.asUser().requestTeamworkGraph(query, variables);
    const json = await res.json();
    if (json.errors?.length) console.warn('TWG errors', JSON.stringify(json.errors).slice(0, 500));
    return json.data || null;
  } catch (e) {
    console.warn('TWG request failed', e.message);
    return null;
  }
}

const nodes = (conn) => (conn?.edges || []).map((e) => e.node).filter(Boolean);

export const issueAri = (cloudId, issueId) => `ari:cloud:jira:${cloudId}:issue/${issueId}`;
export const projectAri = (cloudId, projectId) => `ari:cloud:jira:${cloudId}:project/${projectId}`;

const ISSUE_CONTEXT = `
query precedent_issueContext($id: ID!) {
  goals: jiraWorkItemGoals(id: $id, first: 10) {
    edges { node { __typename ... on AtlassianGoal { id name url } } }
  }
  pullRequests: jiraWorkItemLinkedExternalPullRequests(id: $id, first: 10) {
    edges { node { __typename ... on ExternalPullRequest { id title url status } } }
  }
  deployments: jiraWorkItemLinkedExternalDeployments(id: $id, first: 10) {
    edges { node { __typename ... on ExternalDeployment { id displayName url state } } }
  }
}`;

// What is this issue connected to across the graph: goals it serves, pull requests and deployments carrying it.
export async function getIssueContext(cloudId, issueId) {
  const data = await twg(ISSUE_CONTEXT, { id: issueAri(cloudId, issueId) });
  if (!data) return { available: false, goals: [], pullRequests: [], deployments: [] };
  return {
    available: true,
    goals: nodes(data.goals).map((g) => ({ id: g.id, name: g.name, url: g.url })),
    pullRequests: nodes(data.pullRequests).map((p) => ({ id: p.id, title: p.title, url: p.url, status: p.status })),
    deployments: nodes(data.deployments).map((d) => ({ id: d.id, name: d.displayName, url: d.url, state: d.state })),
  };
}

const SPACE_ITEMS = `
query precedent_spaceWorkItems($spaceAri: ID!, $after: String) {
  jiraSpaceWorkItems(spaceAri: $spaceAri, first: 25, after: $after) {
    edges { node { __typename ... on JiraWorkItem { id key title } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const ITEM_COMMENTS = `
query precedent_itemComments($id: ID!, $since: String!) {
  jiraWorkItemComments(id: $id, since: $since, first: 25) {
    edges { node { __typename ... on JiraWorkItemComment { id text author { id name } createdAt } } }
  }
}`;

const SPACE_TEAMS = `
query precedent_spaceTeams($spaceAri: ID!) {
  atlassianTeamsBySpace(spaceAri: $spaceAri, first: 10) {
    edges { node { __typename ... on AtlassianTeam { id displayName } } }
  }
}`;

// Recently updated work items in a Jira space, most recent first (up to `pages` x 25).
export async function getSpaceWorkItems(cloudId, projectId, pages = 2) {
  const items = [];
  let after = null;
  for (let i = 0; i < pages; i += 1) {
    const data = await twg(SPACE_ITEMS, { spaceAri: projectAri(cloudId, projectId), after });
    const conn = data?.jiraSpaceWorkItems;
    if (!conn) return i === 0 ? null : items;
    items.push(...nodes(conn).map((n) => ({ ari: n.id, key: n.key, title: n.title })));
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return items;
}

export async function getWorkItemComments(ari, since = 'P30D') {
  const data = await twg(ITEM_COMMENTS, { id: ari, since });
  return nodes(data?.jiraWorkItemComments).map((c) => ({
    id: String(c.id).split('/').pop(),
    text: c.text || '',
    authorName: c.author?.name || null,
    created: c.createdAt || null,
  }));
}

export async function getSpaceTeams(cloudId, projectId) {
  const data = await twg(SPACE_TEAMS, { spaceAri: projectAri(cloudId, projectId) });
  return nodes(data?.atlassianTeamsBySpace).map((t) => ({ id: t.id, name: t.displayName }));
}

export async function ping() {
  const data = await twg('query { echo(myString: "precedent") }');
  return data?.echo === 'precedent';
}
