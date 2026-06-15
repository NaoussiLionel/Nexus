export const STORAGE_KEY = 'nexus-architect-project';
export const REPLY_MARK = '@@REPLY@@';
export const ACTIONS_MARK = '@@ACTIONS@@';
export const SEARCH_MARK = '@@SEARCH@@';

export const MODELS = [
  { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6 \u2014 Balanced' },
  { id: 'openai/gpt-5.4', label: 'GPT-5.4 \u2014 Powerful' },
  { id: 'openai/gpt-5.4-nano', label: 'GPT-5.4 Nano \u2014 Fast' },
  { id: 'google/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash \u2014 Quick' },
  { id: 'deepseek/deepseek-r1-0528', label: 'DeepSeek R1 \u2014 Reasoning' },
];
export const DEFAULT_MODEL = MODELS[0].id;

export const SUGGESTIONS = [
  'I want to launch a mobile app \u2014 where do I start?',
  'Help me build a brand identity from scratch',
  'Plan a community event with me',
  'Walk me through opening a small restaurant',
];

export const H_GAP = 40;
export const ROW_GAP = 72;
export const MAX_VISIBLE_DEPTH = 3;

export const LAYOUTS = [
  { id: 'tree', label: 'Tree \u2193', desc: 'Top-down hierarchy' },
  { id: 'root', label: 'Root \u2192', desc: 'Right-branching outline' },
  { id: 'two-sided', label: '2-Sided \u2194', desc: 'Balanced mind map' },
  { id: 'star', label: 'Star \u2606', desc: 'Radial burst' },
];
export const DEFAULT_LAYOUT = LAYOUTS[0].id;
