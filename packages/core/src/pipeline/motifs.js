/**
 * Backgrounds for carousel slides.
 *
 * Each motif is drawn from shapes, in the church's own colours. Nothing here
 * is a photograph or anyone else's artwork, so a church can post these without
 * wondering who owns the image.
 *
 * The model picks a motif per slide from this vocabulary, so a slide about
 * growth gets the seed, a slide about protection gets the shield, and the
 * deck does not read as five identical cards.
 */

import { mix, readableOn } from '../brand.js';

export const MOTIF_NAMES = [
  'light', 'path', 'water', 'mountain', 'seed', 'fire',
  'anchor', 'door', 'crown', 'shield', 'bread', 'dawn',
];

/**
 * @returns {{ defs: string, body: string, ink: string }}
 */
export function motif(name, { w, h, primary, accent, index = 0 }) {
  const base = mix(primary, '#000000', 0.12);
  const deep = mix(primary, '#000000', 0.38);
  const glow = mix(accent, '#ffffff', 0.25);
  const ink = readableOn(base);
  const faint = o => `${accent}${Math.round(o * 255).toString(16).padStart(2, '0')}`;

  const g = `grad${index}`;
  const defs = `
    <linearGradient id="${g}" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="${mix(base, accent, 0.10)}"/>
      <stop offset="100%" stop-color="${deep}"/>
    </linearGradient>
    <radialGradient id="halo${index}" cx="0.5" cy="0.32" r="0.62">
      <stop offset="0%" stop-color="${glow}" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="${glow}" stop-opacity="0"/>
    </radialGradient>`;

  const backdrop = `<rect width="${w}" height="${h}" fill="url(#${g})"/>`;
  const cx = w / 2;

  const shapes = {
    // A sun breaking through: rays from a high centre.
    light: () => `
      <rect width="${w}" height="${h}" fill="url(#halo${index})"/>
      ${Array.from({ length: 14 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 14 - Math.PI / 2;
        return `<path d="M${cx} ${h * 0.3} L${cx + Math.cos(a) * w} ${h * 0.3 + Math.sin(a) * w} L${cx + Math.cos(a + 0.06) * w} ${h * 0.3 + Math.sin(a + 0.06) * w} Z" fill="${faint(0.07)}"/>`;
      }).join('')}
      <circle cx="${cx}" cy="${h * 0.3}" r="${w * 0.1}" fill="none" stroke="${accent}" stroke-width="3" opacity="0.5"/>`,

    // A road narrowing toward the horizon.
    path: () => `
      <path d="M${w * 0.1} ${h} L${cx - w * 0.04} ${h * 0.42} L${cx + w * 0.04} ${h * 0.42} L${w * 0.9} ${h} Z" fill="${faint(0.1)}"/>
      ${[0.55, 0.68, 0.81, 0.94].map(t => `<rect x="${cx - w * 0.012}" y="${h * t}" width="${w * 0.024}" height="${h * 0.035}" rx="4" fill="${faint(0.35)}"/>`).join('')}
      <line x1="0" y1="${h * 0.42}" x2="${w}" y2="${h * 0.42}" stroke="${accent}" stroke-width="2" opacity="0.4"/>`,

    water: () => `
      ${[0.56, 0.64, 0.72, 0.8, 0.88].map((t, i) =>
        `<path d="M0 ${h * t} Q ${w * 0.25} ${h * (t - 0.035)} ${cx} ${h * t} T ${w} ${h * t} V${h} H0 Z" fill="${faint(0.07 + i * 0.015)}"/>`).join('')}`,

    mountain: () => `
      <path d="M0 ${h} L${w * 0.3} ${h * 0.46} L${w * 0.52} ${h * 0.72} L${w * 0.74} ${h * 0.38} L${w} ${h} Z" fill="${faint(0.12)}"/>
      <path d="M${w * 0.74} ${h * 0.38} L${w * 0.82} ${h * 0.52} L${w * 0.66} ${h * 0.52} Z" fill="${faint(0.3)}"/>
      <circle cx="${w * 0.2}" cy="${h * 0.24}" r="${w * 0.055}" fill="${faint(0.35)}"/>`,

    seed: () => `
      <circle cx="${cx}" cy="${h * 0.68}" r="${w * 0.22}" fill="${faint(0.07)}"/>
      <path d="M${cx} ${h * 0.72} V${h * 0.45}" stroke="${accent}" stroke-width="4" opacity="0.55" fill="none"/>
      <path d="M${cx} ${h * 0.56} Q ${cx - w * 0.13} ${h * 0.5} ${cx - w * 0.04} ${h * 0.44}" fill="${faint(0.3)}"/>
      <path d="M${cx} ${h * 0.52} Q ${cx + w * 0.13} ${h * 0.46} ${cx + w * 0.04} ${h * 0.4}" fill="${faint(0.3)}"/>`,

    fire: () => `
      <rect width="${w}" height="${h}" fill="url(#halo${index})"/>
      ${[0, 1, 2].map(i => {
        const s = 1 - i * 0.26, y = h * 0.74;
        return `<path d="M${cx} ${y - h * 0.3 * s} Q ${cx + w * 0.14 * s} ${y - h * 0.12 * s} ${cx} ${y} Q ${cx - w * 0.14 * s} ${y - h * 0.12 * s} ${cx} ${y - h * 0.3 * s} Z" fill="${faint(0.12 + i * 0.1)}"/>`;
      }).join('')}`,

    anchor: () => `
      <circle cx="${cx}" cy="${h * 0.6}" r="${w * 0.2}" fill="none" stroke="${faint(0.25)}" stroke-width="3"/>
      <path d="M${cx} ${h * 0.44} V${h * 0.76}" stroke="${accent}" stroke-width="6" opacity="0.5"/>
      <path d="M${cx - w * 0.1} ${h * 0.5} H${cx + w * 0.1}" stroke="${accent}" stroke-width="6" opacity="0.5"/>
      <path d="M${cx - w * 0.16} ${h * 0.68} Q ${cx} ${h * 0.84} ${cx + w * 0.16} ${h * 0.68}" fill="none" stroke="${accent}" stroke-width="6" opacity="0.5"/>`,

    door: () => `
      <rect x="${cx - w * 0.18}" y="${h * 0.38}" width="${w * 0.36}" height="${h * 0.44}" rx="${w * 0.18}" fill="${faint(0.1)}" stroke="${faint(0.4)}" stroke-width="3"/>
      <rect x="${cx - w * 0.06}" y="${h * 0.46}" width="${w * 0.12}" height="${h * 0.36}" fill="${faint(0.22)}"/>`,

    crown: () => `
      <path d="M${cx - w * 0.2} ${h * 0.66} L${cx - w * 0.2} ${h * 0.44} L${cx - w * 0.08} ${h * 0.56} L${cx} ${h * 0.4} L${cx + w * 0.08} ${h * 0.56} L${cx + w * 0.2} ${h * 0.44} L${cx + w * 0.2} ${h * 0.66} Z" fill="${faint(0.18)}" stroke="${accent}" stroke-width="3" stroke-opacity="0.5"/>
      ${[-0.2, 0, 0.2].map(d => `<circle cx="${cx + w * d}" cy="${h * 0.42}" r="${w * 0.018}" fill="${faint(0.5)}"/>`).join('')}`,

    shield: () => `
      <path d="M${cx} ${h * 0.38} L${cx + w * 0.19} ${h * 0.47} V${h * 0.66} Q ${cx} ${h * 0.84} ${cx - w * 0.19} ${h * 0.66} V${h * 0.47} Z" fill="${faint(0.12)}" stroke="${accent}" stroke-width="3" stroke-opacity="0.5"/>
      <path d="M${cx} ${h * 0.46} V${h * 0.72} M${cx - w * 0.08} ${h * 0.56} H${cx + w * 0.08}" stroke="${faint(0.45)}" stroke-width="5"/>`,

    bread: () => `
      <ellipse cx="${cx}" cy="${h * 0.62}" rx="${w * 0.22}" ry="${h * 0.1}" fill="${faint(0.14)}"/>
      ${[-0.07, 0, 0.07].map(d => `<path d="M${cx + w * d - w * 0.03} ${h * 0.57} q ${w * 0.03} ${-h * 0.02} ${w * 0.06} 0" fill="none" stroke="${faint(0.4)}" stroke-width="3"/>`).join('')}`,

    dawn: () => `
      <rect width="${w}" height="${h}" fill="url(#halo${index})"/>
      <path d="M0 ${h * 0.62} H${w}" stroke="${accent}" stroke-width="2" opacity="0.45"/>
      <path d="M${cx - w * 0.17} ${h * 0.62} a ${w * 0.17} ${w * 0.17} 0 0 1 ${w * 0.34} 0 Z" fill="${faint(0.3)}"/>
      ${[0.12, 0.2, 0.28].map(t => `<line x1="${w * 0.1}" y1="${h * t}" x2="${w * 0.9}" y2="${h * t}" stroke="${faint(0.08)}" stroke-width="2"/>`).join('')}`,
  };

  const draw = shapes[name] ?? shapes.light;
  return { defs, body: backdrop + draw(), ink };
}
