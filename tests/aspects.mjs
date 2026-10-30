// Every offered size renders, with even dimensions and correct duration.
import { renderClipFile } from '../packages/core/src/pipeline/render.js';
import { probeDuration } from '../packages/core/src/pipeline/ingest.js';
import { ASPECTS } from '../packages/core/src/brand.js';
import { run } from '../packages/core/src/pipeline/ingest.js';

const DIR = '/tmp/claude-0/-home-claude/e72e9a44-0eba-5222-a84e-51923fbc19ad/scratchpad/rendertest';
const words = 'Prayer is not just for needs it is more for communion with the living God every single morning'
  .split(' ').map((w, i) => ({ w, start: 10 + i * 0.6, end: 10 + i * 0.6 + 0.55 }));

let ok = true;
for (const aspect of Object.keys(ASPECTS)) {
  const out = `${DIR}/aspect/${aspect.replace(':', 'x')}.mp4`;
  const t0 = Date.now();
  await renderClipFile({ sourcePath: `${DIR}/source.mp4`, start: 9.7, end: 24.3, words,
    scripture: [{ ref: 'Luke 18:1', at: 3 }], outPath: out, aspect });
  const dims = (await run('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0:s=x', out], { capture: true })).trim();
  const [w, h] = dims.split('x').map(Number);
  const dur = await probeDuration(out);
  const even = w % 2 === 0 && h % 2 === 0;
  const ratio = (w / h).toFixed(3);
  const want = (ASPECTS[aspect].w / ASPECTS[aspect].h).toFixed(3);
  const pass = even && ratio === want && Math.abs(dur - 14.6) < 0.4;
  if (!pass) ok = false;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${aspect.padEnd(5)} ${dims.padEnd(10)} ${dur.toFixed(1)}s  ${((Date.now()-t0)/1000).toFixed(1)}s to render`);
}
console.log(ok ? '\nPASS' : '\nFAIL');
process.exit(ok ? 0 : 1);
