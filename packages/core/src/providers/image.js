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

export async function generateImage(prompt, { width = 1080, height = 1350, seed, provider, onProblem } = {}) {
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
      case 'openrouter':   return await openrouterImage(prompt, { width, height });
      case 'local':        return await localFile();
      case 'none':         return null;
      default:             return null;
    }
  } catch (err) {
    note(`${chosen} could not make the photograph — ${err.message}`);
    return null;
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

async function openrouterImage(prompt, { width, height }) {
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
  // The body can carry a key in an echoed header, so only the status and a
  // short, quoted snippet go to the log — never the request we sent.
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();

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
