# Precedent

**Decision memory for Jira, Rovo and coding agents.** Built on Atlassian Forge for Codegeist 2026.

Teams make decisions in Jira comments, then lose them. Six months later someone (or some coding agent) proposes the thing the team already ruled out, and nobody remembers why. Precedent keeps a ledger of what was decided, why and by whom, and puts each decision in front of the people and agents whose work it affects, at the moment it affects them.

## What it does

| Where | What you get |
| --- | --- |
| **Jira issue panel** | The decisions that bear on this issue, ranked, each with the reason it matched. A red contradiction card when the issue adopts something an active decision ruled out. One-click recording. |
| **Jira comments** | Start a comment with `DECISION:` (and optionally `WHY:`) and it is recorded automatically. Comments that only *sound* like a decision ("we agreed to go with...") are queued for review. |
| **Live guard** | When an issue is created or edited and adopts something an active decision in its project ruled out, Precedent comments on it once, naming the decision, who made it and where. Admins can turn this off. |
| **Project page: Decision log** | The ledger, search, a drift view of open work contradicting decisions, a review queue of unrecorded decisions, and a "check a plan" box. |
| **Rovo agent** | "What have we decided that affects this issue?", "Does this plan contradict anything?", "Record this as a decision." |
| **MCP tools** | The same five actions exposed through the Atlassian Rovo MCP server, so Claude Code, Cursor and other coding agents check the ledger before they write code. A ready-made agent skill is in `skills/precedent/SKILL.md`. |
| **Teamwork Graph** | Goals, pull requests and deployments connected to an issue feed relevance matching; recent comments across the space are scanned for unrecorded decisions; teams working in the space are shown. |

## How it works

- `src/detect.js`: finds explicit decision markers and decision-sounding language.
- `src/relevance.js`: ranks decisions against a work item (weighted term similarity, shared components and labels, issue links, graph connections) and detects contradictions by extracting what a decision rules out ("not Redis", "instead of REST", "drop Mongo") and looking for the work item adopting it.
- `src/store.js`: the ledger in Forge KVS, with supersession and history.
- `src/graph.js`: Teamwork Graph curated queries. Best effort: without the scopes the app runs on Jira data alone.
- `src/service.js`: use cases shared by the UI, the agent, MCP and the comment trigger.
- `src/actions.js`: Rovo actions, used by both `rovo:agent` and `rovo:mcp`.
- `src/frontend/`: UI Kit issue panel and project page.

No external services and no data egress: everything runs on Forge and is stored in Forge storage.

## Develop

```bash
npm install
npm test          # logic tests, no Atlassian account needed
forge register    # once, to get your own app id in manifest.yml
forge deploy -e development
forge install -e development --product jira --site <your-site>.atlassian.net
```

Teamwork Graph scopes need an organization admin to install. Requires Node 22 and Forge CLI 12 or later.

## License

MIT
