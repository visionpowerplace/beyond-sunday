import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';
import { sql } from '../db.js';
import { brandOf, ASPECTS, readableOn, mix } from '../brand.js';
import { motif, MOTIF_NAMES } from './motifs.js';

/**
 * Carousel slides as real images.
 *
 * A plain text card is something a church already knows how to make badly in
 * Canva. The point of making them here is that they come out looking like the
 * church — its colours and its logo — with a background chosen to match what
 * the slide actually says.
 *
 * Rendered from SVG by sharp, so there is no browser in the worker image.
 */

const SIZE = { w: 1080, h: 1350 };   // 4:5, the shape that fills the most feed

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

  for (const [i, slide] of slides.entries()) {
    const svg = slideSvg({
      slide, index: i, total: slides.length,
      title: item.title, brand, logo,
      motifName: pickMotif(slide, i),
    });
    const out = path.join(dir, `${String(i + 1).padStart(2, '0')}.png`);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
    paths.push(path.relative(config.storageDir, out));
  }

  await sql`
    update items set body = body || ${sql.json({ images: paths })}, updated_at = now()
    where id = ${item.id}`;
  return { slides: paths.length };
}

/**
 * The model names a motif per slide; anything unrecognised falls back to a
 * stable choice so the same slide always looks the same.
 */
function pickMotif(slide, index) {
  const named = String(slide.motif ?? '').toLowerCase().trim();
  if (MOTIF_NAMES.includes(named)) return named;
  const seed = [...String(slide.heading ?? index)].reduce((n, c) => n + c.charCodeAt(0), 0);
  return MOTIF_NAMES[seed % MOTIF_NAMES.length];
}

function slideSvg({ slide, index, total, title, brand, logo, motifName }) {
  const { w, h } = SIZE;
  const { defs, body, ink } = motif(motifName, { w, h, primary: brand.primary, accent: brand.accent, index });
  const quiet = mix(ink, brand.primary, 0.3);
  const scrimColor = ink === '#ffffff' ? mix(brand.primary, '#000000', 0.45) : '#ffffff';

  const pad = 88;
  const headingLines = wrap(slide.heading ?? '', 17);
  const bodyLines = wrap(slide.body ?? '', 34);

  // Text is anchored to the bottom and the art lives above it, with a scrim
  // in between. Centring the text meant the motif drew straight through it —
  // a stem across a sentence, a horizon line through a heading.
  const footer = h - pad - 70;
  const bodyBottom = footer - 40;
  const bodyTop = bodyBottom - (bodyLines.length - 1) * 44;
  const headBottom = bodyTop - (bodyLines.length ? 54 : 0);
  const headTop = headBottom - (headingLines.length - 1) * 68;
  const scrimTop = Math.max(h * 0.3, headTop - 150);

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>${defs}
    <linearGradient id="scrim${index}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${scrimColor}" stop-opacity="0"/>
      <stop offset="45%" stop-color="${scrimColor}" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="${scrimColor}" stop-opacity="0.93"/>
    </linearGradient>
  </defs>
  ${body}
  <rect x="0" y="${scrimTop}" width="${w}" height="${h - scrimTop}" fill="url(#scrim${index})"/>

  <text x="${pad}" y="${pad + 18}" font-family="DejaVu Sans, sans-serif" font-size="26" font-weight="700"
        letter-spacing="3" fill="${brand.accent}">${esc((title ?? '').toUpperCase().slice(0, 34))}</text>

  ${headingLines.map((line, i) => `
  <text x="${pad}" y="${headTop + i * 68}" font-family="DejaVu Sans, sans-serif" font-size="62"
        font-weight="700" fill="${ink}">${esc(line)}</text>`).join('')}

  ${bodyLines.map((line, i) => `
  <text x="${pad}" y="${bodyTop + i * 44}" font-family="DejaVu Sans, sans-serif" font-size="32"
        fill="${quiet}">${esc(line)}</text>`).join('')}

  <rect x="${pad}" y="${h - pad - 46}" width="${Math.max(54, 34 + String(brand.name).length * 15)}" height="4" fill="${brand.accent}" opacity="0.8"/>
  <text x="${pad}" y="${h - pad}" font-family="DejaVu Sans, sans-serif" font-size="27" fill="${quiet}">${esc(brand.name)}</text>

  ${dots({ w, h, pad, index, total, accent: brand.accent, ink })}
  ${logo ? `<image x="${w - pad - 108}" y="${pad - 24}" width="108" height="108"
        preserveAspectRatio="xMidYMid meet" href="${logo}"/>` : ''}
</svg>`;
}

function dots({ w, h, pad, index, total, accent, ink }) {
  const r = 7, gap = 24;
  const startX = w - pad - (total - 1) * gap;
  return Array.from({ length: total }, (_, i) =>
    `<circle cx="${startX + i * gap}" cy="${h - pad - 8}" r="${r}" fill="${i === index ? accent : ink}" opacity="${i === index ? 1 : 0.3}"/>`
  ).join('');
}

/** svg does not wrap text, so lines are broken here by character budget. */
function wrap(text, perLine) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line.length) line = word;
    else if ((line + ' ' + word).length <= perLine) line += ' ' + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.slice(0, 8);
}

/** The logo is embedded as a data URI; sharp will not fetch a file from SVG. */
async function loadLogo(logoPath) {
  if (!logoPath) return null;
  const full = path.join(config.storageDir, logoPath);
  try {
    const png = await sharp(full).resize(216, 216, { fit: 'inside' }).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;   // a missing or broken logo is not a reason to fail the slide
  }
}
