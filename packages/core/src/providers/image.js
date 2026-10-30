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

export async function generateImage(prompt, { width = 1080, height = 1350, seed } = {}) {
  if (!prompt?.trim()) return null;
  try {
    switch (config.image.provider) {
      case 'pollinations': return await pollinations(prompt, { width, height, seed });
      case 'openrouter':   return await openrouterImage(prompt, { width, height });
      case 'local':        return await localFile();
      case 'none':         return null;
      default:             return null;
    }
  } catch (err) {
    console.error(`[image] ${config.image.provider} failed: ${err.message}`);
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

async function openrouterImage(prompt, { width, height }) {
  if (!config.llm.openrouterKey) throw new Error('OPENROUTER_API_KEY is not set');
  const res = await fetch('https://openrouter.ai/api/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.llm.openrouterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.image.model || 'google/gemini-2.5-flash-image',
      prompt,
      size: `${width}x${height}`,
    }),
    signal: AbortSignal.timeout(config.image.timeoutMs),
  });
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
  return `${scene}. Documentary photograph, natural available light, shallow depth of field, `
    + `warm and hopeful, muted natural colour, photorealistic, high detail. `
    + `No text, no words, no lettering, no logos, no watermark, no collage, no borders.`;
}
