import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, { Box, Button, Heading, Inline, Link, Lozenge, SectionMessage, Spinner, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';
import { cardStyle, DecisionCard, DecisionForm } from './shared.jsx';

function Panel() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => setData(await invoke('issuePanel')), []);
  useEffect(() => { load(); }, [load]);

  if (!data) return <Spinner label="Checking past decisions" />;
  if (data.error) return <SectionMessage appearance="warning"><Text>{data.error}</Text></SectionMessage>;

  const act = async (name, payload, message) => {
    await invoke(name, payload);
    setNotice(message);
    await load();
  };
  const record = async (values) => {
    const res = await invoke('recordDecision', { ...values, candidateId: form?.candidateId });
    if (res.error) return setNotice(res.error);
    setForm(null);
    setNotice(`Recorded ${res.decision.id}. It will surface on related work from now on.`);
    await load();
  };

  const conflicts = data.matches.filter((m) => m.conflict);
  const others = data.matches.filter((m) => !m.conflict);
  const ctx = data.context;
  const hasCtx = ctx?.available && (ctx.goals.length || ctx.pullRequests.length || ctx.deployments.length);

  return (
    <Stack space="space.200">
      {notice && <SectionMessage appearance="success"><Text>{notice}</Text></SectionMessage>}

      {conflicts.length > 0 && (
        <SectionMessage appearance="error" title={`This work contradicts ${conflicts.length === 1 ? 'a past decision' : `${conflicts.length} past decisions`}`}>
          <Text>Change the plan to fit, or supersede the decision if the team has moved on.</Text>
        </SectionMessage>
      )}
      {conflicts.map((m) => (
        <DecisionCard key={m.decision.id} {...m} actions={[
          <Button key="s" onClick={() => setForm({ supersedes: m.decision.id })}>Replace this decision</Button>,
          <Button key="r" appearance="subtle" onClick={() => act('supersede', { id: m.decision.id }, `${m.decision.id} marked superseded.`)}>Mark superseded</Button>,
        ]} />
      ))}

      {data.candidates.map((c) => (
        <SectionMessage key={c.id} appearance="discovery" title="This sounds like a decision" actions={[
          <Button key="y" appearance="link" onClick={() => setForm({ statement: c.statement, candidateId: c.id, commentId: c.commentId })}>Record it</Button>,
          <Button key="n" appearance="link" onClick={() => act('dismissCandidate', { id: c.id }, null)}>Not a decision</Button>,
        ]}>
          <Text>{`"${c.statement}" (${c.authorName || 'a teammate'})`}</Text>
        </SectionMessage>
      ))}

      <Inline spread="space-between" alignBlock="center">
        <Heading as="h3">{others.length ? `${others.length} relevant decision${others.length === 1 ? '' : 's'}` : 'No earlier decisions bear on this issue'}</Heading>
        {!form && <Button appearance="primary" onClick={() => setForm({})}>Record a decision</Button>}
      </Inline>

      {form && (
        <Box xcss={cardStyle}>
          <DecisionForm key={form.candidateId || form.supersedes || 'new'} initial={form} onSubmit={record} onCancel={() => setForm(null)} />
        </Box>
      )}

      {others.map((m) => (
        <DecisionCard key={m.decision.id} {...m} actions={
          m.decision.appliesTo?.includes(data.issue.key) || m.decision.sourceIssueKey === data.issue.key
            ? null
            : [<Button key="l" appearance="subtle" onClick={() => act('linkToIssue', { id: m.decision.id }, `${m.decision.id} linked to this issue.`)}>Applies to this issue</Button>]
        } />
      ))}

      {hasCtx ? (
        <Box xcss={cardStyle}>
          <Stack space="space.075">
            <Inline space="space.100" alignBlock="center">
              <Heading as="h5">Connected work</Heading>
              <Lozenge>Teamwork Graph</Lozenge>
            </Inline>
            {ctx.goals.map((g) => <Text key={g.id}>Goal: <Link href={g.url} openNewTab>{g.name}</Link></Text>)}
            {ctx.pullRequests.map((p) => <Text key={p.id}>Pull request: <Link href={p.url} openNewTab>{p.title}</Link>{p.status ? ` (${p.status})` : ''}</Text>)}
            {ctx.deployments.map((d) => <Text key={d.id}>Deployment: <Link href={d.url} openNewTab>{d.name}</Link>{d.state ? ` (${d.state})` : ''}</Text>)}
          </Stack>
        </Box>
      ) : null}

      <Text size="small" color="color.text.subtlest">Tip: start a comment with "DECISION:" (and a "WHY:" line) and Precedent records it automatically.</Text>
    </Stack>
  );
}

ForgeReconciler.render(<React.StrictMode><Panel /></React.StrictMode>);
