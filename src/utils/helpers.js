export function generateId() {
  return 'n' + Math.random().toString(36).slice(2, 10);
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
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 150);
}

export function renderInline(text) {
  let safe = escapeHtml(text);
  safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    if (/^(javascript|data|vbscript):/i.test(url)) url = '#';
    return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
  });
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  safe = safe.replace(/`([^`]+)`/g, '<code style="background:var(--bp-600);padding:1px 4px;border-radius:3px;font-size:.82em">$1</code>');
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
