import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  BarChart, Box, Button, DynamicTable, EmptyState, Heading, Inline, Lozenge, SectionMessage, Spinner, Stack, Tab, TabList, TabPanel, Tabs, Text, TextArea, Textfield, Toggle, Label, xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { cardStyle, day, DecisionCard, DecisionForm, StatusLozenge } from './shared.jsx';

const statStyle = xcss({
  padding: 'space.200',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius.200',
  backgroundColor: 'elevation.surface.raised',
  minWidth: '150px',
});

function Stat({ label, value, appearance }) {
  return (
    <Box xcss={statStyle}>
      <Stack space="space.050">
        <Heading as="h2">{String(value)}</Heading>
        <Inline space="space.050"><Lozenge appearance={appearance || 'default'}>{label}</Lozenge></Inline>
      </Stack>
    </Box>
  );
}

function Log() {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [proposal, setProposal] = useState('');
  const [verdict, setVerdict] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => setData(await invoke('overview')), []);
  useEffect(() => { load(); invoke('settings').then(setSettings); }, [load]);

  if (!data) return <Spinner label="Loading the decision log" />;

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  };
  const act = (name, payload, message) => run(name, async () => {
    await invoke(name, payload);
    if (message) setNotice(message);
    await load();
  });
  const record = async (values) => {
    const res = await invoke('recordDecision', { ...values, candidateId: form?.candidateId });
    if (res.error) return setNotice(res.error);
    setForm(null);
    setNotice(`Recorded ${res.decision.id}.`);
    await load();
  };
  const scan = () => run('scan', async () => {
    const r = await invoke('scan');
    setNotice(`Scanned ${r.scannedComments} comments on ${r.scannedIssues} recent work items through ${r.source}: ${r.found} unrecorded decision${r.found === 1 ? '' : 's'} found.`);
    await load();
  });

  const { stats, decisions, conflicts, candidates, teams } = data;
  const shown = results ? results.map((r) => r.decision) : decisions;
  const selected = open && decisions.find((d) => d.id === open);

  const rows = shown.map((d) => ({
    key: d.id,
    cells: [
      { key: 'id', content: <Button appearance="link" spacing="none" onClick={() => setOpen(d.id)}>{d.id}</Button> },
      { key: 'title', content: <Text>{d.title}</Text> },
      { key: 'status', content: <StatusLozenge status={d.status} /> },
      { key: 'source', content: <Text>{d.sourceIssueKey || '-'}</Text> },
      { key: 'by', content: <Text>{d.decidedByName || '-'}</Text> },
      { key: 'at', content: <Text>{day(d.decidedAt)}</Text> },
      { key: 'via', content: <Lozenge>{d.capturedVia}</Lozenge> },
    ],
  }));

  return (
    <Stack space="space.300">
      <Inline spread="space-between" alignBlock="center">
        <Stack space="space.050">
          <Heading as="h1">Decision log</Heading>
          <Text color="color.text.subtle">
            {`What this team decided, why, and where current work drifts from it.${teams.length ? ` Teams here: ${teams.map((t) => t.name).join(', ')}.` : ''}`}
          </Text>
        </Stack>
        <Inline space="space.100">
          <Button onClick={scan} isLoading={busy === 'scan'}>Scan for unrecorded decisions</Button>
          <Button appearance="primary" onClick={() => setForm({})}>Record a decision</Button>
        </Inline>
      </Inline>

      {notice && <SectionMessage appearance="success"><Text>{notice}</Text></SectionMessage>}

      <Inline space="space.200" shouldWrap>
        <Stat label="Active decisions" value={stats.active} appearance="success" />
        <Stat label="Open work contradicting one" value={stats.conflicts} appearance={stats.conflicts ? 'removed' : 'default'} />
        <Stat label="Unrecorded, awaiting review" value={candidates.length} appearance={candidates.length ? 'new' : 'default'} />
        <Stat label="Older than 6 months" value={stats.stale} appearance={stats.stale ? 'moved' : 'default'} />
        <Stat label="Superseded" value={stats.superseded} />
      </Inline>

      {form && (
        <Box xcss={cardStyle}>
          <DecisionForm key={form.candidateId || form.supersedes || 'new'} initial={form} onSubmit={record} onCancel={() => setForm(null)} />
        </Box>
      )}

      <Tabs id="precedent-tabs">
        <TabList>
          <Tab>{`Ledger (${stats.total})`}</Tab>
          <Tab>{`Drift (${conflicts.length})`}</Tab>
          <Tab>{`Review (${candidates.length})`}</Tab>
          <Tab>Check a plan</Tab>
          <Tab>Agents and settings</Tab>
        </TabList>

        <TabPanel>
          <Box paddingBlockStart="space.200">
            <Stack space="space.200">
              <Inline space="space.100" alignBlock="center">
                <Box xcss={xcss({ width: '360px' })}>
                  <Textfield value={query} placeholder="Search decisions, e.g. session storage" onChange={(e) => setQuery(e.target.value)} />
                </Box>
                <Button isLoading={busy === 'search'} onClick={() => run('search', async () => setResults(query.trim() ? await invoke('search', { query }) : null))}>Search</Button>
                {results && <Button appearance="subtle" onClick={() => { setResults(null); setQuery(''); }}>Clear</Button>}
              </Inline>
              {selected && (
                <DecisionCard decision={selected} actions={[
                  selected.status === 'active'
                    ? <Button key="s" onClick={() => act('supersede', { id: selected.id }, `${selected.id} marked superseded.`)}>Mark superseded</Button>
                    : <Button key="r" onClick={() => act('reactivate', { id: selected.id }, `${selected.id} reinstated.`)}>Reinstate</Button>,
                  <Button key="n" onClick={() => setForm({ supersedes: selected.id })}>Replace with a new decision</Button>,
                  <Button key="d" appearance="danger" onClick={() => { setOpen(null); act('deleteDecision', { id: selected.id }, `${selected.id} deleted.`); }}>Delete</Button>,
                  <Button key="c" appearance="subtle" onClick={() => setOpen(null)}>Close</Button>,
                ]} />
              )}
              {selected?.history?.length ? (
                <Box xcss={cardStyle}>
                  <Stack space="space.050">
                    <Heading as="h5">History</Heading>
                    {selected.history.map((h, i) => <Text key={i} size="small">{`${day(h.at)} · ${h.event} · ${h.by}`}</Text>)}
                  </Stack>
                </Box>
              ) : null}
              {rows.length ? (
                <DynamicTable
                  head={{ cells: ['Id', 'Decision', 'Status', 'Source', 'Decided by', 'Date', 'Captured via'].map((c) => ({ key: c, content: c })) }}
                  rows={rows}
                  rowsPerPage={15}
                />
              ) : (
                <EmptyState
                  header={results ? 'Nothing matches that search' : 'No decisions recorded yet'}
                  description='Record one here, start a Jira comment with "DECISION:", or ask the Precedent agent in Rovo.'
                  primaryAction={results ? undefined : (
                    <Button isLoading={busy === 'loadSamples'} onClick={() => act('loadSamples', {}, 'Loaded five example decisions. Open "Check a plan" and try "Add Redis to cache sessions".')}>Load example decisions</Button>
                  )}
                />
              )}
              {stats.byMonth.length > 1 && (
                <Box xcss={cardStyle}>
                  <BarChart data={stats.byMonth} xAccessor="month" yAccessor="count" title="Decisions recorded per month" height={220} />
                </Box>
              )}
            </Stack>
          </Box>
        </TabPanel>

        <TabPanel>
          <Box paddingBlockStart="space.200">
            <Stack space="space.150">
              <Text color="color.text.subtle">{`Open work items whose wording adopts something an active decision ruled out. ${stats.openIssuesChecked} open items checked.`}</Text>
              {conflicts.length === 0 && <SectionMessage appearance="success"><Text>No open work contradicts an active decision.</Text></SectionMessage>}
              {conflicts.map((c) => (
                <SectionMessage key={`${c.issueKey}-${c.decisionId}`} appearance="error" title={`${c.issueKey}: ${c.summary}`} actions={[
                  <Button key="o" appearance="link" onClick={() => setOpen(c.decisionId)}>{`Open ${c.decisionId} in the ledger`}</Button>,
                ]}>
                  <Text>{`Contradicts ${c.decisionId} (${c.decisionTitle}). ${c.reason}`}</Text>
                </SectionMessage>
              ))}
            </Stack>
          </Box>
        </TabPanel>

        <TabPanel>
          <Box paddingBlockStart="space.200">
            <Stack space="space.150">
              <Text color="color.text.subtle">Comments that read like a decision but were never recorded. Found from live comment events and from scanning recent work through Teamwork Graph.</Text>
              {candidates.length === 0 && <SectionMessage><Text>Nothing waiting. Run a scan to look through the last 30 days.</Text></SectionMessage>}
              {candidates.map((c) => (
                <Box key={c.id} xcss={cardStyle}>
                  <Stack space="space.075">
                    <Inline space="space.100" alignBlock="center">
                      <Lozenge appearance="new">{`${Math.round(c.confidence * 100)}% likely`}</Lozenge>
                      <Text weight="bold">{c.issueKey}</Text>
                      <Text size="small" color="color.text.subtlest">{[c.authorName, day(c.created), `found via ${c.foundVia}`].filter(Boolean).join(' · ')}</Text>
                    </Inline>
                    <Text>{c.statement}</Text>
                    <Inline space="space.100">
                      <Button appearance="primary" onClick={() => setForm({ statement: c.statement, issueKey: c.issueKey, commentId: c.commentId, candidateId: c.id })}>Record</Button>
                      <Button appearance="subtle" onClick={() => act('dismissCandidate', { id: c.id })}>Dismiss</Button>
                    </Inline>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>
        </TabPanel>

        <TabPanel>
          <Box paddingBlockStart="space.200">
            <Stack space="space.150">
              <Text color="color.text.subtle">Describe what you are about to build. Precedent checks it against the ledger, the same check coding agents run over MCP.</Text>
              <TextArea value={proposal} onChange={(e) => setProposal(e.target.value)} placeholder="Add Redis to cache user sessions in the checkout service" />
              <Inline><Button appearance="primary" isDisabled={proposal.trim().length < 8} isLoading={busy === 'check'} onClick={() => run('check', async () => setVerdict(await invoke('check', { text: proposal })))}>Check against decisions</Button></Inline>
              {verdict && verdict.conflicts.length > 0 && <SectionMessage appearance="error" title="This plan contradicts a past decision"><Text>Follow the decision, or replace it if the team has moved on.</Text></SectionMessage>}
              {verdict && verdict.conflicts.length === 0 && verdict.matches.length > 0 && <SectionMessage appearance="information" title="Related decisions exist"><Text>Nothing contradicts them, but read them first.</Text></SectionMessage>}
              {verdict && verdict.matches.length === 0 && <SectionMessage appearance="success" title="Nothing decided about this yet"><Text>You are clear to proceed. Consider recording the choice.</Text></SectionMessage>}
              {verdict?.matches.map((m) => <DecisionCard key={m.decision.id} {...m} />)}
            </Stack>
          </Box>
        </TabPanel>

        <TabPanel>
          <Box paddingBlockStart="space.200">
            <Stack space="space.200">
              <Box xcss={cardStyle}>
                <Stack space="space.100">
                  <Heading as="h4">Capture</Heading>
                  {settings && !settings.isAdmin && <Text size="small" color="color.text.subtlest">These apply to the whole site; a Jira administrator can change them.</Text>}
                  <Inline space="space.100" alignBlock="center">
                    <Toggle id="auto" isDisabled={!settings?.isAdmin} isChecked={!!settings?.autoCapture} onChange={async () => setSettings({ ...settings, ...(await invoke('settings', { patch: { autoCapture: !settings.autoCapture } })) })} />
                    <Label labelFor="auto">Record comments that start with "DECISION:" automatically</Label>
                  </Inline>
                  <Inline space="space.100" alignBlock="center">
                    <Toggle id="ack" isDisabled={!settings?.isAdmin} isChecked={!!settings?.acknowledgeInComment} onChange={async () => setSettings({ ...settings, ...(await invoke('settings', { patch: { acknowledgeInComment: !settings.acknowledgeInComment } })) })} />
                    <Label labelFor="ack">Reply on the issue when a decision is recorded</Label>
                  </Inline>
                </Stack>
              </Box>
              <Box xcss={cardStyle}>
                <Stack space="space.100">
                  <Inline space="space.100" alignBlock="center">
                    <Heading as="h4">Teamwork Graph</Heading>
                    <Lozenge appearance={settings?.graphConnected ? 'success' : 'moved'}>{settings ? (settings.graphConnected ? 'Connected' : 'Not granted, using Jira only') : 'Checking'}</Lozenge>
                  </Inline>
                  <Text>Used to pull the goals, pull requests and deployments around an issue into relevance matching, to scan recent comments across the space, and to show which teams work here.</Text>
                </Stack>
              </Box>
              <Box xcss={cardStyle}>
                <Stack space="space.100">
                  <Heading as="h4">Rovo agent</Heading>
                  <Text>Open Rovo chat and pick the Precedent agent. Ask "What have we decided that affects this issue?" or "Does this plan contradict anything?"</Text>
                </Stack>
              </Box>
              <Box xcss={cardStyle}>
                <Stack space="space.100">
                  <Heading as="h4">Coding agents (MCP)</Heading>
                  <Text>The ledger is exposed as tools on the Atlassian Rovo MCP server: search-decisions, get-decisions-for-issue, check-proposal, record-decision, supersede-decision. Connect Claude Code, Cursor or any MCP client to the Rovo MCP server and add the Precedent skill from the repository so the agent checks decisions before it writes code.</Text>
                </Stack>
              </Box>
            </Stack>
          </Box>
        </TabPanel>
      </Tabs>
    </Stack>
  );
}

ForgeReconciler.render(<React.StrictMode><Log /></React.StrictMode>);
