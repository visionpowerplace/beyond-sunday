import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Transcription provider.
 *
 * Returns a normalised shape regardless of provider:
 *   { text, words: [{ w, start, end }], segments: [{ text, start, end }] }
 *
 * Word-level timings are not optional here — burnt captions and accurate clip
 * boundaries both depend on them.
 */
export async function transcribe(audioPath, { language } = {}) {
  switch (config.transcribe.provider) {
    case 'groq':  return groqTranscribe(audioPath, { language });
    case 'mock':  return mockTranscribe(audioPath);
    default:      throw new Error(`unknown TRANSCRIBE_PROVIDER: ${config.transcribe.provider}`);
  }
}

// Groq caps uploads at 25MB on the free tier, so the ingest stage downmixes to
// 16kHz mono opus first; a 60-minute sermon lands around 10-15MB.
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

async function groqTranscribe(audioPath, { language }) {
  if (!config.transcribe.groqKey) throw new Error('GROQ_API_KEY is not set');

  const form = new FormData();
  const buf = await fs.promises.readFile(audioPath);
  form.append('file', new Blob([buf]), path.basename(audioPath));
  form.append('model', config.transcribe.groqModel);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  if (language) form.append('language', language);
  // Nudges the model toward church vocabulary. The single cheapest accuracy win
  // available: without it, "Ephesians" comes back as "a fee shins".
  form.append('prompt', 'A Christian sermon. Expect book names of the Bible, chapter and verse references, and words such as Ephesians, Corinthians, Deuteronomy, righteousness, covenant, hallelujah, amen.');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.transcribe.groqKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();

  return {
    text: data.text ?? '',
    words: (data.words ?? []).map(w => ({ w: w.word, start: w.start, end: w.end })),
    segments: (data.segments ?? []).map(s => ({ text: s.text, start: s.start, end: s.end })),
    language: data.language ?? language ?? null,
    provider: 'groq',
  };
}

// Lets the whole pipeline run with no account and no card. Useful for building
// the UI and for CI; never for judging output quality.
async function mockTranscribe(audioPath) {
  const fixture = new URL('../../fixtures/transcript.json', import.meta.url);
  if (fs.existsSync(fixture)) {
    const t = JSON.parse(await fs.promises.readFile(fixture, 'utf8'));
    return { ...t, provider: 'mock' };
  }
  return { text: '', words: [], segments: [], provider: 'mock' };
}
