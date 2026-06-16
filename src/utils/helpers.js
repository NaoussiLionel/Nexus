export function generateId(prefix) {
  return (prefix || 'n') + Math.random().toString(36).slice(2, 10);
}

export function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, ch =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])
  );
}

export function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.slice(0, n - 1).trimEnd() + '\u2026' : str;
}

export function hashAngle(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 30) - 15) / 10;
}

export function nodeWidth(depth) { return depth === 0 ? 264 : depth === 1 ? 220 : 196; }
export function nodeHeight(depth) { return depth === 0 ? 130 : depth === 1 ? 104 : 96; }

export function sanitizeFilename(name) {
  return (name || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'project';
}

export function downloadFile(content, filename, mime) {
  const isDataUrl = typeof content === 'string' && content.startsWith('data:');
  const url = isDataUrl ? content : URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { if (!isDataUrl) URL.revokeObjectURL(url); a.remove(); }, 150);
}

export function renderInline(text, msgIdx, checkboxes) {
  let safe = escapeHtml(text);
  let cbIdx = 0;
  safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    if (/^(javascript|data|vbscript):/i.test(url)) url = '#';
    return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
  });
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  safe = safe.replace(/`([^`]+)`/g, '<code style="background:var(--bp-600);padding:1px 4px;border-radius:3px;font-size:.82em">$1</code>');
  safe = safe.replace(/^- (\[.\]) (.+)/gm, (_, box, label) => {
    const idx = cbIdx++;
    const checked = checkboxes?.[idx] ?? (box === '[x]');
    return '<label class="chat-checkbox"><input type="checkbox" data-msg="' + msgIdx + '" data-idx="' + idx + '"' + (checked ? ' checked' : '') + '><span>' + label + '</span></label>';
  });
  safe = safe.replace(/^- (.+)/gm, '<span style="display:block;padding-left:12px;position:relative">&bull; $1</span>');
  safe = safe.replace(/\n/g, '<br>');
  return safe;
}

export function extractResponseText(resp) {
  if (typeof resp === 'string') return resp;
  const content = resp?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(c => c?.text || '').join('');
  if (resp && typeof resp.text === 'string') return resp.text;
  try { return String(resp); } catch { return ''; }
}

const ERROR_LOG_KEY = 'nexus_error_log';
const MAX_ERRORS = 50;

export function logError(context, error) {
  const entry = {
    context,
    message: error?.message || String(error),
    stack: error?.stack || '',
    time: Date.now(),
    url: location.href,
  };
  console.error('[Nexus]', context, error);
  try {
    const log = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]');
    log.push(entry);
    if (log.length > MAX_ERRORS) log.splice(0, log.length - MAX_ERRORS);
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(log));
  } catch { /* storage full */ }
}

export function getErrorLog() {
  try { return JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]'); } catch { return []; }
}

export function clearErrorLog() {
  try { localStorage.removeItem(ERROR_LOG_KEY); } catch { /* ignore */ }
}
