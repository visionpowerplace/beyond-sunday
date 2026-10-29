import { config } from '../config.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * One chat call that must come back as JSON.
 *
 * Scriptvale taught this the hard way: models truncate long JSON arrays at the
 * token limit and the parse blows up three stages later. So: a generous
 * max_tokens, a repair pass over the common truncation shapes, and exactly one
 * retry on a parse failure before giving up honestly.
 */
export async function completeJson({ system, user, maxTokens = 8000, temperature = 0.4 }) {
  if (config.llm.provider === 'mock') return null;
  if (!config.llm.openrouterKey) throw new Error('OPENROUTER_API_KEY is not set');

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.llm.openrouterKey}`,
        'Content-Type': 'application/json',
        'X-Title': config.brandName,
      },
      body: JSON.stringify({
        model: config.llm.model,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? '';

    try {
      return JSON.parse(stripFence(raw));
    } catch (err) {
      const repaired = repairJson(stripFence(raw));
      if (repaired) return repaired;
      if (attempt === 2) throw new Error(`model did not return valid JSON: ${String(err).slice(0, 200)}`);
    }
  }
  return null;
}

function stripFence(s) {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
}

// Closes the brackets a truncated response left open and drops a trailing
// half-written object. Recovers most over-length responses without a re-call.
function repairJson(s) {
  let text = s.replace(/,\s*$/, '');
  const lastClose = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (lastClose === -1) return null;
  text = text.slice(0, lastClose + 1);

  const stack = [];
  let inString = false, escaped = false;
  for (const ch of text) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}' || ch === ']') stack.pop();
  }
  const tail = stack.reverse().map(c => (c === '{' ? '}' : ']')).join('');
  try { return JSON.parse(text + tail); } catch { return null; }
}
