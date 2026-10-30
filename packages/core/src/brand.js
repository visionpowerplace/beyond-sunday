/**
 * How a church's content should look.
 *
 * One place, so a clip, a carousel slide and the UI cannot drift apart.
 */

export const ASPECTS = {
  '9:16': { w: 1080, h: 1920, label: 'Reel / TikTok / Shorts' },
  '4:5':  { w: 1080, h: 1350, label: 'Instagram portrait' },
  '1:1':  { w: 1080, h: 1080, label: 'Square' },
  '16:9': { w: 1920, h: 1080, label: 'YouTube / Facebook landscape' },
};

export const NETWORKS = ['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'threads'];

const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULTS = { primary: '#16140f', accent: '#a9802f' };

export function brandOf(church = {}) {
  return {
    primary: HEX.test(church.brand_primary ?? '') ? church.brand_primary : DEFAULTS.primary,
    accent:  HEX.test(church.brand_accent ?? '')  ? church.brand_accent  : DEFAULTS.accent,
    logoPath: church.logo_path ?? null,
    handles: church.handles ?? {},
    name: church.name ?? '',
    aspect: ASPECTS[church.default_aspect] ? church.default_aspect : '9:16',
  };
}

/** Readable text on a given background, by perceived luminance. */
export function readableOn(hex) {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? '#13110c' : '#ffffff';
}

export function mix(hex, withHex, amount) {
  const parse = h => [0, 2, 4].map(i => parseInt(h.replace('#', '').slice(i, i + 2), 16));
  const [a, b] = [parse(hex), parse(withHex)];
  const out = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('');
}
