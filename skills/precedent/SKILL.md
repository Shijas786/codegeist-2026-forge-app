---
name: precedent
description: Check a team's recorded decisions before making an architectural, dependency or API choice, and record new decisions. Use when planning or reviewing a change in a codebase whose team tracks work in Jira with the Precedent app installed.
---

# Precedent: check decisions before you build

The team keeps a decision ledger in Jira (the Precedent Forge app). Its tools are exposed through the Atlassian Rovo MCP server. Connect that server to your agent, then follow this procedure.

## Before implementing

1. Write one plain sentence describing the choice you are about to make ("Add Redis to cache user sessions").
2. Call `check-proposal` with that sentence (and `projectKey` if you know the Jira project).
3. Read `verdict`:
   - `CONTRADICTS_EXISTING_DECISION`: stop. Tell the user which decision (id, statement, rationale) the plan breaks. Offer two options: follow the decision, or supersede it. Do not proceed until they choose.
   - `RELATED_DECISIONS_EXIST`: follow the related decisions, and mention their ids in your plan or PR description.
   - `NO_PRIOR_DECISION`: proceed. If the choice is significant, offer to record it.

## When working on a Jira issue

Call `get-decisions-for-issue` with the issue key first. It returns the decisions that bear on the issue, any contradiction, and connected goals, pull requests and deployments.

## Answering "why is it built this way?"

Call `search-decisions` with the topic and cite the decision ids in your answer.

## Recording

After the user confirms the wording, call `record-decision` with `statement`, `rationale`, and `issueKey`. Pass `supersedes` when it replaces an earlier decision. Use `supersede-decision` to retire one.

Never record or supersede without explicit confirmation.
