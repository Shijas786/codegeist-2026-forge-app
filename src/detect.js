// Finds decisions in free text: explicit markers ("DECISION: ...") and decision language ("we agreed to ...").
import { truncate } from './text.js';

const MARKER = /^[ \t]*(?:\/decision|decision|decided|adr)[ \t]*(?::|[\-–](?=\s))[ \t]*/im;
const RATIONALE = /^[ \t]*(?:why|because|rationale|reason)[ \t]*[:\-–][ \t]*/i;

// A dash only counts as a marker separator before whitespace, so "ADR-123" is a reference, not a marker.
// Text after a marker up to the next blank line or the next marker line; continuation lines are joined.
function block(text, re) {
  const m = re.exec(text);
  if (!m) return null;
  const lines = [];
  for (const line of text.slice(m.index + m[0].length).split('\n')) {
    if (lines.length && !line.trim()) break;
    if (RATIONALE.test(line) || MARKER.test(line)) break;
    if (line.trim()) lines.push(line.trim());
    else if (!lines.length && lines.push('') > 3) break;
  }
  return lines.filter(Boolean).join(' ');
}

const PHRASES = [
  [/\bwe(?:'ve| have)? (?:decided|agreed|chosen|settled)\b/i, 0.9],
  [/\b(?:final|team) decision\b/i, 0.9],
  [/\b(?:let's|lets|we(?:'ll| will| are)?) go(?:ing)? with\b/i, 0.8],
  [/\bgoing forward,? we\b/i, 0.7],
  [/\bwe(?:'re| are) (?:standardi[sz]ing|sticking|moving) (?:on|with|to)\b/i, 0.8],
  [/\bwe (?:will|won't|will not|should) (?:not )?(?:use|adopt|support|migrate|drop|deprecate|keep)\b/i, 0.6],
  [/\bapproved\b.*\b(?:approach|option|proposal|design)\b/i, 0.6],
  [/\b(?:instead of|rather than)\b/i, 0.2],
];

export function parseExplicitDecision(text) {
  const body = String(text || '').replace(/\r/g, '');
  const statement = block(body, MARKER);
  if (!statement || statement.length < 8) return null;
  return { statement, rationale: block(body, new RegExp(RATIONALE.source, 'im')) || '' };
}

// Returns { confidence 0..1, statement } for the sentence that most looks like a decision, or null.
export function detectDecisionLanguage(text) {
  if (!text) return null;
  const sentences = String(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 500 && !s.endsWith('?'));
  let best = null;
  for (const sentence of sentences) {
    let score = 0;
    for (const [re, weight] of PHRASES) if (re.test(sentence)) score += weight;
    score = Math.min(1, score);
    if (score >= 0.6 && (!best || score > best.confidence)) best = { confidence: score, statement: truncate(sentence, 400) };
  }
  return best;
}

export function titleFromStatement(statement) {
  const first = String(statement).split(/(?<=[.!?])\s/)[0].replace(/[.!]+$/, '');
  return truncate(first, 90);
}
