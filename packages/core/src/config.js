import path from 'node:path';

const env = process.env;

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
export function describeProviders() {
  const bits = [];
  bits.push(`transcribe=${config.transcribe.provider}${config.transcribe.provider === 'groq' && !config.transcribe.groqKey ? ' (NO KEY - will fail)' : ''}`);
  bits.push(`llm=${config.llm.provider}${config.llm.provider === 'openrouter' && !config.llm.openrouterKey ? ' (NO KEY - will fail)' : ''}`);
  return bits.join('  ');
}
