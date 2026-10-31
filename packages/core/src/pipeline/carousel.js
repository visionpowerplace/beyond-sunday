import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';
import { sql } from '../db.js';
import { brandOf, mix } from '../brand.js';
import { motif, MOTIF_NAMES } from './motifs.js';
import { generateImage, photoPrompt } from '../providers/image.js';

/**
 * Carousel slides.
 *
 * A photograph of the idea, a light wash over it, and editorial type on top:
 * the church's colours, a serif headline, its name along the bottom. If the
 * photograph cannot be made the slide still renders on its drawn background,
 * because a missing picture must never cost a church its content.
 */

const W = 1080, H = 1350;              // 4:5, the shape that fills the most feed
const PAD = 88;
const HEAD = 'TeX Gyre Schola, Lora, DejaVu Serif, Georgia, serif';
const BODY = 'DejaVu Sans, sans-serif';

export async function runRenderCarousel(job) {
  const [item] = await sql`select * from items where id = ${job.item_id}`;
  if (!item) throw new Error(`item ${job.item_id} not found`);
  const [church] = await sql`
    select c.* from churches c join sermons s on s.church_id = c.id where s.id = ${item.sermon_id}`;

  const brand = brandOf(church);
  const slides = item.body?.slides ?? [];
  if (!slides.length) throw new Error('this carousel has no slides');

  const dir = path.join(config.storageDir, item.sermon_id, 'carousels', item.id);
  await fs.promises.mkdir(dir, { recursive: true });

  const logo = await loadLogo(brand.logoPath);
  const paths = [];
  let withPhoto = 0;
  let problem = null;

  for (const [i, slide] of slides.entries()) {
    // Photographs are made one at a time rather than in parallel: the free
    // generator rate-limits a burst and returns nothing for half the deck.
    const photo = await backdropFor(slide, i, item.id, church.image_provider,
      (msg) => { if (!problem) problem = msg; });
    if (photo) withPhoto++;

    const out = path.join(dir, `${String(i + 1).padStart(2, '0')}.png`);
    await compose({ slide, index: i, total: slides.length, title: item.title, brand, logo, photo, out });
    paths.push(path.relative(config.storageDir, out));
  }

  await sql`
    update items set body = body || ${sql.json({ images: paths })}, updated_at = now()
    where id = ${item.id}`;
  // A deck of drawn shapes where photographs were meant to be is a failure
  // the church should hear about, not discover by looking at it.
  if (problem) {
    await sql`
      update items set body = body || ${sql.json({ photoProblem: problem })}, updated_at = now()
      where id = ${item.id}`;
  }
  return { slides: paths.length, photos: withPhoto, problem };
}

/** The photograph, resized to fill the frame. Null when there isn't one. */
async function backdropFor(slide, index, itemId, provider, onProblem) {
  const scene = slide.image_prompt || slide.scene;
  if (!scene) return null;

  // A stable seed so re-rendering the same slide does not reshuffle the deck.
  const seed = [...`${itemId}${index}`].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 1e6, 7);
  const bytes = await generateImage(photoPrompt(scene), { width: W, height: H, seed, provider, onProblem });
  if (!bytes) return null;

  try {
    return await sharp(bytes).resize(W, H, { fit: 'cover', position: 'attention' }).png().toBuffer();
  } catch (err) {
    console.error(`[carousel] could not read the generated image: ${err.message}`);
    return null;
  }
}

export async function compose({ slide, index, total, title, brand, logo, photo, out }) {
  const layers = [];

  if (photo) {
    layers.push({ input: photo, top: 0, left: 0 });
  } else {
    // No photograph: fall back to the drawn background, which at least
    // carries the church's colours and the idea of the slide.
    const name = MOTIF_NAMES.includes(String(slide.motif).toLowerCase())
      ? String(slide.motif).toLowerCase()
      : MOTIF_NAMES[index % MOTIF_NAMES.length];
    const { defs, body } = motif(name, { w: W, h: H, primary: brand.primary, accent: brand.accent, index });
    layers.push({
      input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${defs}</defs>${body}</svg>`),
      top: 0, left: 0,
    });
  }

  layers.push({ input: Buffer.from(typeLayer({ slide, index, total, title, brand, photo: Boolean(photo) })), top: 0, left: 0 });
  if (logo) layers.push({ input: logo, top: PAD - 20, left: W - PAD - 96 });

  await sharp({ create: { width: W, height: H, channels: 3, background: brand.primary } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toFile(out);
}

/**
 * The wash and the words.
 *
 * Over a photograph the wash is a pale paper tone and the text is the
 * church's dark colour; on the drawn background it inverts. Either way the
 * words sit on something solid rather than on whatever the picture happens
 * to contain.
 */
function typeLayer({ slide, index, total, title, brand, photo }) {
  const onPhoto = photo;
  const paper = '#f7f4ec';
  const ink = onPhoto ? darken(brand.primary) : '#ffffff';
  const quiet = onPhoto ? mix(ink, paper, 0.25) : mix('#ffffff', brand.primary, 0.3);
  const wash = onPhoto ? paper : mix(brand.primary, '#000000', 0.5);

  const eyebrow = String(title ?? '').toUpperCase().slice(0, 42);
  // The headline is the slide. Break it narrow so it stacks into two or three
  // big lines rather than running quietly across the top.
  const headLines = wrapByWidth(slide.heading ?? '', 11.5, 4);
  const bodyLines = wrapByWidth(slide.body ?? '', 30, 5);

  const headSize = headLines.length >= 4 ? 84 : headLines.length === 3 ? 104 : 126;
  const headLead = headSize * 0.92;

  const top = PAD + 18;
  const ruleY = top + 26;
  const headTop = ruleY + 56 + headSize * 0.74;
  const bodyTop = headTop + (headLines.length - 1) * headLead + 68;
  const washBottom = Math.min(H - PAD - 90, bodyTop + bodyLines.length * 46 + 70);

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${wash}" stop-opacity="1"/>
      <stop offset="${Math.round((washBottom / H) * 88)}%" stop-color="${wash}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${wash}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="foot" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="${onPhoto ? '#0e0c08' : wash}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${onPhoto ? '#0e0c08' : wash}" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="${W}" height="${Math.round(washBottom * 1.22)}" fill="url(#wash)"/>
  <rect x="0" y="${H - 240}" width="${W}" height="240" fill="url(#foot)"/>

  <text x="${PAD}" y="${top}" font-family="${BODY}" font-size="25" font-weight="700"
        letter-spacing="4.2" fill="${brand.accent}">${esc(eyebrow)}</text>
  <rect x="${PAD}" y="${ruleY}" width="${Math.min(W - PAD * 2, 190 + eyebrow.length * 11)}" height="3" fill="${brand.accent}"/>

  ${headLines.map((line, i) => `
  <text x="${PAD}" y="${headTop + i * headLead}" font-family="${HEAD}" font-size="${headSize}"
        font-weight="700" fill="${ink}">${esc(line)}</text>`).join('')}

  ${bodyLines.map((line, i) => `
  <text x="${PAD}" y="${bodyTop + i * 46}" font-family="${BODY}" font-size="35"
        fill="${quiet}">${esc(line)}</text>`).join('')}

  <rect x="${PAD}" y="${H - PAD - 48}" width="104" height="3" fill="${brand.accent}"/>
  <text x="${PAD}" y="${H - PAD}" font-family="${BODY}" font-size="28" font-weight="600"
        fill="${onPhoto ? '#ffffff' : '#ffffff'}">${esc(brand.name)}</text>

  ${Array.from({ length: total }, (_, i) =>
    `<circle cx="${W - PAD - (total - 1 - i) * 26}" cy="${H - PAD - 9}" r="7.5"
             fill="${i === index ? brand.accent : '#ffffff'}" opacity="${i === index ? 1 : 0.45}"/>`).join('')}
</svg>`;
}

/** A dark, readable version of the brand colour for text on a pale wash. */
function darken(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255);
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.3 ? mix(hex, '#000000', 0.62) : hex;
}

/**
 * svg does not wrap, so lines are broken here. Measured by approximate glyph
 * width rather than character count, because "Illuminating" and "WOW WOW" are
 * not the same width at the same length.
 */
function wrapByWidth(text, perLine, maxLines) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (width(candidate) <= perLine || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

const NARROW = new Set([...`ijltfrI .,;:!'`]);
const WIDE = new Set([...'mwMW']);
const width = s => [...s].reduce((n, c) => n + (NARROW.has(c) ? 0.46 : WIDE.has(c) ? 1.42 : 1), 0);

async function loadLogo(logoPath) {
  if (!logoPath) return null;
  try {
    return await sharp(path.join(config.storageDir, logoPath))
      .resize(96, 96, { fit: 'inside' }).png().toBuffer();
  } catch {
    return null;   // a missing or broken logo is not a reason to fail the slide
  }
}
