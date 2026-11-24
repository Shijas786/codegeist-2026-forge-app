import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExplicitDecision, detectDecisionLanguage, titleFromStatement } from '../src/detect.js';
import { rankDecisions, findConflict, bannedTerms, searchDecisions } from '../src/relevance.js';
import { adfToText } from '../src/text.js';

const decisions = [
  { id: 'd1', title: 'No Redis for session storage', statement: 'We will not use Redis for session storage; sessions live in Postgres.', rationale: 'One less system to run.', status: 'active', tags: ['sessions'], components: ['auth'], sourceIssueKey: 'PAY-1' },
  { id: 'd2', title: 'REST over GraphQL for public API', statement: 'Public API stays REST. We will not adopt GraphQL for external clients.', status: 'active', tags: ['api'], components: ['gateway'], sourceIssueKey: 'PAY-2' },
  { id: 'd3', title: 'Feature flags via LaunchDarkly', statement: 'All new features ship behind LaunchDarkly flags.', status: 'active', tags: [], components: [], sourceIssueKey: 'PAY-3' },
];

test('explicit marker is parsed with rationale', () => {
  const d = parseExplicitDecision('Thanks all.\nDECISION: Sessions live in Postgres, not Redis\nWhy: one less system to run');
  assert.equal(d.statement, 'Sessions live in Postgres, not Redis');
  assert.equal(d.rationale, 'one less system to run');
  assert.equal(parseExplicitDecision('no decision here'), null);
});

test('decision language is detected, questions are not', () => {
  assert.ok(detectDecisionLanguage('After the review we decided to keep the public API on REST for this year.').confidence >= 0.6);
  assert.equal(detectDecisionLanguage('Have we decided whether to use Redis for this?'), null);
  assert.equal(detectDecisionLanguage('Fixed the typo in the header component today.'), null);
});

test('ranking finds the relevant decision and flags a contradiction', () => {
  const work = { key: 'PAY-9', text: 'Add Redis cache to store user sessions for faster login', components: ['auth'], labels: [] };
  const ranked = rankDecisions(work, decisions);
  assert.equal(ranked[0].decision.id, 'd1');
  assert.ok(ranked[0].conflict);
  assert.ok(ranked[0].conflict.terms.includes('redi'));
  assert.ok(!ranked.find((r) => r.decision.id === 'd3'));
});

test('no conflict when the work agrees with the decision', () => {
  assert.deepEqual(bannedTerms('We will not use Redis for sessions').includes('redi'), true);
  assert.equal(findConflict(decisions[0], 'Remove Redis; do not use Redis for sessions'), null);
  assert.equal(findConflict({ ...decisions[0], status: 'superseded' }, 'Add Redis for sessions'), null);
});

test('linked issue and search', () => {
  const ranked = rankDecisions({ key: 'PAY-10', text: 'Unrelated copy change', linkedKeys: ['PAY-3'] }, decisions);
  assert.equal(ranked[0].decision.id, 'd3');
  assert.equal(searchDecisions('graphql public api', decisions)[0].decision.id, 'd2');
});

test('adf to text and titles', () => {
  const adf = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'DECISION: use REST.' }] }] };
  assert.equal(adfToText(adf).trim(), 'DECISION: use REST.');
  assert.equal(titleFromStatement('Use REST. It is simpler.'), 'Use REST');
});

test('multi-line markers keep the continuation and never take WHY as the statement', () => {
  const d = parseExplicitDecision('DECISION: We will use Postgres for sessions\nand drop the Redis cluster.\nWHY: one fewer system\nto operate.\n\nunrelated');
  assert.equal(d.statement, 'We will use Postgres for sessions and drop the Redis cluster.');
  assert.equal(d.rationale, 'one fewer system to operate.');
  assert.equal(parseExplicitDecision('DECISION:\nWHY: because it is cheaper overall'), null);
});

test('a contradiction is kept even when the limit is full', () => {
  const filler = Array.from({ length: 6 }, (_, i) => ({ id: `F-${i}`, title: 'Cache sessions', statement: 'Cache user sessions in the checkout service aggressively', status: 'active', appliesTo: ['X-1'] }));
  const ruling = { id: 'D-9', title: 'No Redis', statement: 'We will not use Redis anywhere.', status: 'active' };
  const out = rankDecisions({ key: 'X-1', text: 'Add Redis to cache user sessions in the checkout service' }, [...filler, ruling], { limit: 3 });
  assert.ok(out.some((r) => r.decision.id === 'D-9' && r.conflict));
});

test('a statement that starts with an ADR reference is kept', () => {
  const d = parseExplicitDecision('DECISION: ADR-123 stands, we keep Postgres for sessions\nWHY: it works');
  assert.equal(d.statement, 'ADR-123 stands, we keep Postgres for sessions');
  assert.equal(parseExplicitDecision('ADR-123 is worth a read before the meeting'), null);
});

test('a marker line that ends with a dash still starts a new decision', () => {
  const d = parseExplicitDecision('DECISION: We keep Postgres for sessions\nDECISION -\nWe drop the Redis cluster');
  assert.equal(d.statement, 'We keep Postgres for sessions');
});
