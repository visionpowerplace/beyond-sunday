import sharp from 'sharp';
import { compose } from '../packages/core/src/pipeline/carousel.js';

// Stand-in for a generated photograph: a warm, golden-hour-ish gradient with
// a calm upper third, which is the shape the prompt now asks the model for.
const photo = await sharp({
  create: { width: 1080, height: 1350, channels: 3, background: '#b7935f' },
}).composite([{
  input: Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="#e8dcc0"/><stop offset="45%" stop-color="#c9a36a"/>
      <stop offset="100%" stop-color="#3f3524"/></linearGradient></defs>
    <rect width="1080" height="1350" fill="url(#g)"/>
    <circle cx="820" cy="880" r="260" fill="#8a6a3a" opacity="0.55"/>
    <path d="M0 1350 L380 820 L760 1350 Z" fill="#564river" opacity="0.4"/>
  </svg>`.replace('#564river', '#564a2e')), top: 0, left: 0,
}]).png().toBuffer();

const brand = { name: 'The Empowerment Center', primary: '#1B3A2F', accent: '#C8A24A', logoPath: null };
const slide = {
  eyebrow: 'SPEND TIME WITH THE SOURCE',
  heading: 'Love Is Deeply Spiritual',
  body: 'The more you spend time with God, the more God pours on you. Love is deeply spiritual.',
};

await compose({ slide, index: 1, total: 5, title: 'Love God More Than Church',
                brand, logo: null, photo, out: '/tmp/slides/with-photo.png' });
await compose({ slide, index: 1, total: 5, title: 'Love God More Than Church',
                brand, logo: null, photo: null, out: '/tmp/slides/no-photo.png' });
console.log('rendered both');
