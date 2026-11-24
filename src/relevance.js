// Ranks recorded decisions against a piece of work and flags possible contradictions. Pure functions.
import { termFrequencies, tokenize } from './text.js';

const NEGATIONS = ['not', "won't", 'never', 'no', 'avoid', 'drop', 'deprecate', 'remove', 'stop', 'ban', 'without'];
const ADOPTIONS = ['use', 'adopt', 'add', 'introduce', 'migrate', 'switch', 'implement', 'integrate', 'build', 'enable'];

export function decisionText(d) {
  return [d.title, d.statement, d.rationale, (d.tags || []).join(' ')].filter(Boolean).join(' ');
}

function idf(docs) {
  const df = new Map();
  for (const tf of docs) for (const term of tf.keys()) df.set(term, (df.get(term) || 0) + 1);
  const n = docs.length || 1;
  return (term) => Math.log(1 + n / (1 + (df.get(term) || 0)));
}

function cosine(a, b, weight) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [t, f] of a) {
    const w = f * weight(t);
    na += w * w;
    if (b.has(t)) dot += w * b.get(t) * weight(t);
  }
  for (const [t, f] of b) nb += (f * weight(t)) ** 2;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function overlap(a = [], b = []) {
  const set = new Set(a.map((x) => String(x).toLowerCase()));
  return [...new Set(b.map((x) => String(x).toLowerCase()))].filter((x) => set.has(x));
}

// A decision "bans" a term when a negation sits within 4 tokens before it in the decision statement.
export function bannedTerms(statement) {
  const words = String(statement || '').toLowerCase().replace(/[^a-z0-9+#.' -]+/g, ' ').split(/\s+/);
  const banned = new Set();
  words.forEach((w, i) => {
    if (!NEGATIONS.includes(w)) return;
    for (const next of tokenize(words.slice(i + 1, i + 5).join(' '))) {
      if (!ADOPTIONS.includes(next)) banned.add(next);
    }
  });
  return [...banned];
}

export function findConflict(decision, workText) {
  if (decision.status !== 'active') return null;
  const banned = bannedTerms(decision.statement);
  if (!banned.length) return null;
  const words = tokenize(workText);
  const raw = String(workText || '').toLowerCase().split(/\s+/);
  const hits = banned.filter((t) => words.includes(t));
  if (!hits.length) return null;
  const adopting = raw.some((w) => ADOPTIONS.includes(w.replace(/[^a-z]/g, '')));
  const alsoNegated = hits.every((t) => bannedTerms(workText).includes(t));
  if (!adopting || alsoNegated) return null;
  return { terms: hits, reason: `This work mentions ${hits.map((h) => `"${h}"`).join(', ')}, which the decision rules out.` };
}

/**
 * work: { key, text, components[], labels[], linkedKeys[], parentKey, graphKeys[] }
 * Returns decisions with { score 0..100, reasons[], conflict } sorted by score, filtered by minScore.
 */
export function rankDecisions(work, decisions, { minScore = 12, limit = 10 } = {}) {
  const workTf = termFrequencies(work.text);
  const docs = decisions.map((d) => termFrequencies(decisionText(d)));
  const weight = idf([...docs, workTf]);
  const related = new Set([...(work.linkedKeys || []), work.parentKey].filter(Boolean));
  const graphKeys = new Set(work.graphKeys || []);

  const ranked = decisions.map((d, i) => {
    const reasons = [];
    let score = 0;
    const sim = cosine(workTf, docs[i], weight);
    if (sim > 0.04) {
      score += Math.min(55, Math.round(sim * 140));
      const shared = [...docs[i].keys()].filter((t) => workTf.has(t)).sort((x, y) => weight(y) - weight(x)).slice(0, 4);
      reasons.push(`Similar wording: ${shared.join(', ')}`);
    }
    const comps = overlap(work.components, d.components);
    if (comps.length) {
      score += 25;
      reasons.push(`Same component: ${comps.join(', ')}`);
    }
    const tags = overlap(work.labels, d.tags);
    if (tags.length) {
      score += 15;
      reasons.push(`Shared label: ${tags.join(', ')}`);
    }
    if (d.sourceIssueKey && d.sourceIssueKey === work.key) {
      score += 60;
      reasons.push('Decided on this issue');
    } else if (d.sourceIssueKey && related.has(d.sourceIssueKey)) {
      score += 35;
      reasons.push(`Decided on linked issue ${d.sourceIssueKey}`);
    } else if (d.sourceIssueKey && graphKeys.has(d.sourceIssueKey)) {
      score += 20;
      reasons.push(`Connected through Teamwork Graph (${d.sourceIssueKey})`);
    }
    if ((d.appliesTo || []).includes(work.key)) {
      score += 60;
      reasons.push('Explicitly linked to this issue');
    }
    const conflict = findConflict(d, work.text);
    if (conflict) score += 20;
    if (d.status === 'superseded') score = Math.round(score * 0.6);
    return { decision: d, score: Math.min(100, score), reasons, conflict };
  });

  return ranked
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function searchDecisions(query, decisions, limit = 10) {
  if (!query || !String(query).trim()) return decisions.slice(0, limit).map((d) => ({ decision: d, score: 0, reasons: [] }));
  return rankDecisions({ key: null, text: query }, decisions, { minScore: 5, limit });
}
