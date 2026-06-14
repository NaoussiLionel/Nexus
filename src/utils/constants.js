export const STORAGE_KEY = 'nexus-architect-project';
export const REPLY_MARK = '@@REPLY@@';
export const ACTIONS_MARK = '@@ACTIONS@@';

export const MODELS = [
  { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6 \u2014 Balanced' },
  { id: 'openai/gpt-5.4', label: 'GPT-5.4 \u2014 Powerful' },
  { id: 'openai/gpt-5.4-nano', label: 'GPT-5.4 Nano \u2014 Fast' },
  { id: 'google/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash \u2014 Quick' },
  { id: 'deepseek/deepseek-r1-0528', label: 'DeepSeek R1 \u2014 Reasoning' },
];
export const DEFAULT_MODEL = MODELS[0].id;

export const SUGGESTIONS = [
  'Launch a mobile app from scratch',
  'Build a brand identity system',
  'Plan a community event',
  'Open a small restaurant',
];

export const H_GAP = 40;
export const ROW_GAP = 72;
