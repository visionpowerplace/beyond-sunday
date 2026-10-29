import { sql } from '../db.js';
import { enqueue } from '../queue.js';
import { transcribe } from '../providers/transcribe.js';
import { findScripture } from '../scripture.js';

/** Stage 2 — words, timings and the scripture references the preacher spoke. */
export async function runTranscribe(job) {
  const [sermon] = await sql`select * from sermons where id = ${job.sermon_id}`;
  if (!sermon?.audio_path) throw new Error('sermon has no audio_path; ingest must run first');

  const result = await transcribe(sermon.audio_path);
  if (!result.text?.trim()) {
    throw new Error('transcription came back empty — check the audio actually has speech in it');
  }

  const scripture = findScripture(result.text, result.words);

  await sql`
    update sermons set
      transcript = ${sql.json({ ...result, scripture })},
      status     = 'generating',
      updated_at = now()
    where id = ${sermon.id}`;

  await enqueue({ type: 'generate', sermonId: sermon.id });
  return { words: result.words.length, scripture: scripture.length };
}
