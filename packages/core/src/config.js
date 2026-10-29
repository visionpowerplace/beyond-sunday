import path from 'node:path';

// Pasted values pick up stray whitespace and newlines; trim everything once
// here rather than hunting a mystery auth failure later.
const env = new Proxy(process.env, {
  get: (target, name) => (typeof target[name] === 'string' ? target[name].trim() : target[name]),
});

export const config = {
  databaseUrl: env.DATABASE_URL || '',
  storageDir: path.resolve(env.STORAGE_DIR || './storage'),
  workerPort: Number(env.WORKER_PORT || 8080),
  workerPublicUrl: (env.WORKER_PUBLIC_URL || `http://localhost:${env.WORKER_PORT || 8080}`).replace(/\/$/, ''),
  brandName: env.BRAND_NAME || 'Beyond Sunday',
  // libass resolves this through fontconfig. The worker image installs DejaVu;
  // override it if you ship a brand font with the container.
  captionFont: env.CAPTION_FONT || 'DejaVu Sans',
  // 'fit'  = whole frame on a blurred backdrop; nobody is ever cropped out.
  // 'crop' = centre crop, fills the screen, cuts the sides off.
  clipLayout: env.CLIP_LAYOUT || 'fit',

  transcribe: {
    provider: env.TRANSCRIBE_PROVIDER || 'mock',
    groqKey: env.GROQ_API_KEY || '',
    groqModel: env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo',
  },

  llm: {
    provider: env.LLM_PROVIDER || 'mock',
    openrouterKey: env.OPENROUTER_API_KEY || '',
    model: env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.5',
  },
};

// Loud about mock mode: the single biggest source of "why is the output rubbish".
// Never prints a value, only whether it is set and whether it makes sense.
export function describeProviders() {
  return [describe('TRANSCRIBE_PROVIDER', config.transcribe.provider, ['groq', 'mock'], config.transcribe.groqKey, 'GROQ_API_KEY'),
          describe('LLM_PROVIDER', config.llm.provider, ['openrouter', 'mock'], config.llm.openrouterKey, 'OPENROUTER_API_KEY')].join('  |  ');
}

function describe(name, value, allowed, key, keyName) {
  if (!allowed.includes(value)) return `${name}=INVALID (expected ${allowed.join(' or ')}; a key belongs in ${keyName})`;
  if (value === 'mock') return `${name}=mock (placeholder output)`;
  return `${name}=${value}${key ? '' : ` but ${keyName} is empty - will fail`}`;
}
