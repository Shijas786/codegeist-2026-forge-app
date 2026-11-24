import React, { useState } from 'react';
import { Box, Button, ButtonGroup, Form, FormFooter, FormSection, Heading, Inline, Label, Lozenge, Stack, Tag, TagGroup, Text, TextArea, Textfield, xcss } from '@forge/react';

export const cardStyle = xcss({
  padding: 'space.150',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius.200',
  backgroundColor: 'elevation.surface.raised',
});

export const conflictStyle = xcss({
  padding: 'space.150',
  borderColor: 'color.border.danger',
  borderWidth: 'border.width.outline',
  borderStyle: 'solid',
  borderRadius: 'border.radius.200',
  backgroundColor: 'color.background.danger',
});

export const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');

export function StatusLozenge({ status }) {
  return <Lozenge appearance={status === 'active' ? 'success' : 'default'}>{status}</Lozenge>;
}

export function DecisionCard({ decision: d, score, reasons, conflict, actions }) {
  return (
    <Box xcss={conflict ? conflictStyle : cardStyle}>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Lozenge appearance="inprogress" isBold>{d.id}</Lozenge>
          <Heading as="h4">{d.title}</Heading>
          <StatusLozenge status={d.status} />
          {conflict && <Lozenge appearance="removed" isBold>Contradiction</Lozenge>}
          {typeof score === 'number' && <Lozenge appearance="new">{`${score}% relevant`}</Lozenge>}
        </Inline>
        {conflict && <Text weight="bold">{conflict.reason}</Text>}
        <Text>{d.statement}</Text>
        {d.rationale ? <Text color="color.text.subtle">{`Why: ${d.rationale}`}</Text> : null}
        <Text size="small" color="color.text.subtlest">
          {[d.decidedByName && `Decided by ${d.decidedByName}`, day(d.decidedAt), d.recordedByName && d.recordedByName !== d.decidedByName && `recorded by ${d.recordedByName}`, d.sourceIssueKey && `on ${d.sourceIssueKey}`, d.supersededBy && `superseded by ${d.supersededBy}`]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {reasons?.length ? <Text size="small" color="color.text.subtle">{`Matched because: ${reasons.join('; ')}`}</Text> : null}
        {(d.components?.length || d.tags?.length) ? (
          <TagGroup>
            {[...(d.components || []), ...(d.tags || [])].map((t) => <Tag key={t} text={t} />)}
          </TagGroup>
        ) : null}
        {actions ? <ButtonGroup>{actions}</ButtonGroup> : null}
      </Stack>
    </Box>
  );
}

export function DecisionForm({ initial = {}, onSubmit, onCancel, submitLabel = 'Record decision' }) {
  const [statement, setStatement] = useState(initial.statement || '');
  const [rationale, setRationale] = useState(initial.rationale || '');
  const [title, setTitle] = useState(initial.title || '');
  const [supersedes, setSupersedes] = useState(initial.supersedes || '');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit({ statement, rationale, title, supersedes: supersedes.trim() || undefined });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Form onSubmit={submit}>
      <FormSection>
        <Label labelFor="statement">What did the team decide?</Label>
        <TextArea id="statement" value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="We will use Postgres for session storage, not Redis." />
        <Label labelFor="rationale">Why?</Label>
        <TextArea id="rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="One fewer system to run; session volume is low." />
        <Label labelFor="title">Short title (optional)</Label>
        <Textfield id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Label labelFor="supersedes">Replaces decision (optional, e.g. D-3)</Label>
        <Textfield id="supersedes" value={supersedes} onChange={(e) => setSupersedes(e.target.value)} />
      </FormSection>
      <FormFooter>
        <ButtonGroup>
          {onCancel && <Button onClick={onCancel}>Cancel</Button>}
          <Button appearance="primary" type="submit" isDisabled={busy || statement.trim().length < 8} isLoading={busy}>{submitLabel}</Button>
        </ButtonGroup>
      </FormFooter>
    </Form>
  );
}
