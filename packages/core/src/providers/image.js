import { config } from '../config.js';

/**
 * A photograph for a carousel slide.
 *
 * Generated rather than taken from a stock library: a church posting these
 * should not have to think about who owns the picture or whether the licence
 * covers social media.
 *
 * Every provider returns raw image bytes, or null. Null is not a failure —
 * the carousel falls back to its drawn background and still renders. A slide
 * that cannot be made is worse than a slide without a photograph.
 */

/**
 * One image request at a time, across the whole worker.
 *
 * OpenRouter reserves credit against each in-flight request and refuses a new
 * one that would exceed the balance while others are outstanding — so three
 * carousel jobs running in parallel knocked each other out and came back with
 * two photographs out of five. Generation is slow anyway; queueing costs
 * little and turns a partial deck into a whole one.
 */
let gate = Promise.resolve();
export function oneAtATime(fn) {
  const run = gate.then(fn, fn);
  gate = run.then(() => {}, () => {});
  return run;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** True for the 402 that means "not right now", as opposed to "no money". */
export function isCongestion(message) {
  return /in-flight/i.test(String(message));
}

export async function generateImage(prompt, opts = {}) {
  return oneAtATime(() => generateOnce(prompt, opts));
}

async function generateOnce(prompt, { width = 1080, height = 1350, seed, provider, onProblem, onSpend } = {}) {
  const note = (msg) => { console.error(`[image] ${msg}`); onProblem?.(msg); };
  if (!prompt?.trim()) return null;
  // A church can pick its own; otherwise the deployment's default.
  const chosen = provider || config.image.provider;
  if (chosen === 'pollinations' && !config.image.allowPollinations) {
    // Their free keyless tier now answers 402, which silently cost every
    // slide its photograph. Fail loudly rather than quietly drawing shapes.
    note('Pollinations no longer serves free keyless requests. Set IMAGE_PROVIDER=openrouter.');
    return null;
  }
  try {
    switch (chosen) {
      case 'pollinations': return await pollinations(prompt, { width, height, seed });
      case 'openrouter':   return await withRetry(() => openrouterImage(prompt, { width, height, onSpend }));
      case 'local':        return await localFile();
      case 'none':         return null;
      default:             return null;
    }
  } catch (err) {
    note(err.message);
    return null;
  }
}

/**
 * The provider's own words, not its JSON. A church reading "could not make
 * the photograph" should get a sentence, not a serialised error object with
 * a truncated metadata key hanging off the end.
 */
async function readError(res) {
  const body = await res.text().catch(() => '');
  let message = '';
  try { message = JSON.parse(body)?.error?.message ?? ''; } catch { /* not json */ }
  if (!message) message = body.replace(/\s+/g, ' ').slice(0, 160);

  if (res.status === 402) {
    return /in-flight/i.test(message)
      ? 'OpenRouter is holding credit against requests already running. Add credit, or try again in a moment.'
      : 'OpenRouter has run out of credit. Top it up and generate the carousel again.';
  }
  if (res.status === 401 || res.status === 403) {
    return 'OpenRouter refused the key on this deployment. Check OPENROUTER_API_KEY.';
  }
  if (res.status === 429) return 'OpenRouter is rate limiting. Try again in a minute.';
  return `OpenRouter answered ${res.status}. ${message}`.trim();
}

/**
 * A congestion 402 clears once the other requests settle, so wait and ask
 * again rather than dropping the slide to a drawn background.
 */
export async function withRetry(fn, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts || !isCongestion(err.message)) throw err;
      await sleep(i * 4000);
    }
  }
}

/**
 * A fixed file from disk, for working on the slide layout without calling a
 * generator. IMAGE_LOCAL_PATH points at any image.
 */
async function localFile() {
  const p = config.image.localPath;
  if (!p) throw new Error('IMAGE_LOCAL_PATH is not set');
  return (await import('node:fs')).promises.readFile(p);
}

/** Free, no account, no key. Slow but good enough, and it costs a church nothing. */
async function pollinations(prompt, { width, height, seed }) {
  const q = new URLSearchParams({
    width: String(width),
    height: String(height),
    nologo: 'true',
    model: config.image.model || 'flux',
    ...(seed != null ? { seed: String(seed) } : {}),
  });
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${q}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(config.image.timeoutMs) });
  if (!res.ok) throw new Error(`${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // The service sometimes answers 200 with an error page rather than an image.
  if (buf.length < 5000) throw new Error(`suspiciously small response (${buf.length} bytes)`);
  return buf;
}

/**
 * OpenRouter's image endpoint is /api/v1/images — not the OpenAI-shaped
 * /images/generations, which answers 404 — and it takes an aspect ratio
 * rather than a pixel size. The slide is 1080x1350, so 4:5.
 */
function aspectRatio(width, height) {
  const g = (a, b) => (b ? g(b, a % b) : a);
  const d = g(width, height) || 1;
  return `${Math.round(width / d)}:${Math.round(height / d)}`;
}

async function openrouterImage(prompt, { width, height, onSpend }) {
  if (!config.llm.openrouterKey) throw new Error('OPENROUTER_API_KEY is not set');
  const res = await fetch('https://openrouter.ai/api/v1/images', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.llm.openrouterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.image.model || 'google/gemini-2.5-flash-image',
      prompt,
      aspect_ratio: aspectRatio(width, height),
    }),
    signal: AbortSignal.timeout(config.image.timeoutMs),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();

  // What this photograph actually cost. If the endpoint does not say, fall
  // back to the published per-image rate so the total is never silently zero.
  onSpend?.({
    model: config.image.model || 'google/gemini-2.5-flash-image',
    costUsd: Number(data?.usage?.cost ?? config.image.costPerImage),
    detail: data?.usage?.cost != null ? 'reported by the provider' : 'estimated at the list rate',
  });

  const b64 = data?.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, 'base64');

  const url = data?.data?.[0]?.url;
  if (url) {
    const img = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!img.ok) throw new Error(`fetching the generated image: ${img.status}`);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error('no image in the response');
}

/**
 * Keep the picture about the idea, not about people who can be identified,
 * and keep it out of the uncanny valley a church would never post.
 */
export function photoPrompt(scene) {
  return `A photograph: ${scene}. `
    + `Shot on a full-frame camera with a 35mm lens at f/2, golden-hour daylight, `
    + `soft natural shadows, shallow depth of field, fine grain, realistic skin and `
    + `fabric texture, muted warm colour grade, unposed and documentary. `
    + `Leave the upper third calm and relatively empty so a headline can sit over it. `
    + `Photorealistic, not an illustration, not a painting, not a 3D render, not a collage. `
    + `No text, no words, no lettering, no logos, no watermark, no borders, no frame.`;
}
