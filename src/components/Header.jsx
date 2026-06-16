import { useCallback, useRef, useEffect, useState } from 'react';
import { useNexus } from '../store/NexusContext';
import {
  recomputeLayout, stripForExport, normalizeTree
} from '../utils/tree';
import { LAYOUTS } from '../utils/constants';
import { sanitizeFilename, downloadFile, generateId } from '../utils/helpers';
import { toPng } from 'html-to-image';
import {
  Undo2, Redo2, LayoutGrid, Maximize, ZoomOut, ZoomIn,
  Download, FileDown, Upload, Image, Package, Search, X, Plus,
  Menu, HelpCircle, MessageSquare, FileText, History, Paperclip,
  Settings, KeyRound, Cpu, Trash2, Compass
} from 'lucide-react';

function timeAgo(ts, now) {
  if (!ts) return '';
  const diff = now - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

export default function Header() {
  const {
    tree, chat, canvas, setTree, setChat, setCanvas, pushHistory, persist,
    resetProject, addToast, resetArmed, setResetArmed,
    fitView, zoomIn, zoomOut, undo, redo, history, redoStack, layout, setLayout,
    searchQuery, setSearchQuery,
    documents, activeDocId, switchDocument, createDocument, deleteDocument,
    geminiKey, setGeminiKey, provider, setProvider, customModel, setCustomModel,
  } = useNexus();
  const resetTimer = useRef(null);
  const importRef = useRef(null);
  const searchRef = useRef(null);
  const has = !!tree;

  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const [attachments, setAttachments] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus_attachments') || '[]'); } catch { return []; }
  });
  const [sessions, setSessions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus_sessions') || '[]'); } catch { return []; }
  });
  const [sessionName, setSessionName] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [menuTab, setMenuTab] = useState('docs');
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.title = tree ? `${tree.title} \u2014 Nexus Architect` : 'Nexus Architect \u2014 AI Project Planning Canvas';
  }, [tree]);

  useEffect(() => {
    if (!menuOpen) setMenuTab('docs');
  }, [menuOpen]);

  const closeMenus = useCallback(() => {
    setMenuOpen(false); setExportOpen(false); setHelpOpen(false);
  }, []);

  const handleArrange = useCallback(() => {
    if (!tree) return;
    pushHistory();
    recomputeLayout(tree, layout);
    setTree({ ...tree });
    persist();
    addToast('Auto-arranged the layout');
  }, [tree, layout, pushHistory, setTree, persist, addToast]);

  const handleExportJSON = useCallback(() => {
    if (!tree) return;
    downloadFile(JSON.stringify(stripForExport(tree), null, 2), sanitizeFilename(tree.title) + '.json', 'application/json');
    addToast('Exported as JSON');
    setExportOpen(false);
  }, [tree, addToast]);

  const handleExportMD = useCallback(() => {
    if (!tree) return;
    const lines = [];
    (function walk(node, depth) {
      if (depth <= 1) { lines.push('#'.repeat(depth + 1) + ' ' + node.title); if (node.description) lines.push('\n' + node.description); }
      else { const indent = '  '.repeat(depth - 2); lines.push(indent + '- **' + node.title + '**' + (node.description ? ' \u2014 ' + node.description : '')); }
      (node.children || []).forEach(c => walk(c, depth + 1));
    })(tree, 0);
    downloadFile(lines.join('\n') + '\n', sanitizeFilename(tree.title) + '.md', 'text/markdown');
    addToast('Exported as outline');
    setExportOpen(false);
  }, [tree, addToast]);

  const handleExportImage = useCallback(async () => {
    if (!tree) return;
    const el = document.getElementById('zoomSpace');
    if (!el) return;
    addToast('Generating image\u2026');
    try {
      const dataUrl = await toPng(el, { backgroundColor: '#0A1722', pixelRatio: 2 });
      downloadFile(dataUrl, sanitizeFilename(tree.title) + '.png', 'image/png');
      addToast('Exported as PNG');
    } catch { addToast('Could not render the canvas as an image. Try a different browser.', 'error'); }
    setExportOpen(false);
  }, [tree, addToast]);

  const handleExportBundle = useCallback(() => {
    if (!tree) return;
    let att = [];
    try { att = JSON.parse(localStorage.getItem('nexus_attachments') || '[]'); } catch { /* ignore */ }
    const bundle = { version: 2, exportedAt: Date.now(), type: 'nexus-architect-bundle', tree: stripForExport(tree), chat: chat.slice(-48), attachments: att };
    downloadFile(JSON.stringify(bundle, null, 2), sanitizeFilename(tree.title) + '.nexus', 'application/json');
    addToast('Exported project bundle');
    setExportOpen(false);
  }, [tree, chat, addToast]);

  const handleImport = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data?.type === 'nexus-architect-bundle') {
          pushHistory(); const t = normalizeTree(data.tree, 0); setTree(t); recomputeLayout(t, layout);
          if (Array.isArray(data.chat)) setChat(data.chat);
          if (Array.isArray(data.attachments)) { try { localStorage.setItem('nexus_attachments', JSON.stringify(data.attachments)); } catch { /* quota */ } }
          setTimeout(() => fitView(), 50); persist(); addToast('Project bundle imported');
        } else if (data?.title) {
          pushHistory(); const t = normalizeTree(data, 0); setTree(t); recomputeLayout(t, layout);
          setTimeout(() => fitView(), 50); persist(); addToast('Project imported');
        } else throw new Error('invalid');
      } catch { addToast('Hmm, couldn\u2019t read that file \u2014 it needs to be a Nexus Architect JSON export or .nexus bundle.', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
    setExportOpen(false);
  }, [layout, pushHistory, setTree, setChat, persist, addToast, fitView]);

  const handleSidebarToggle = useCallback(() => {
    if (window.innerWidth <= 1100) {
      document.body.classList.remove('sidebar-hidden');
      document.body.classList.toggle('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
      document.body.classList.toggle('sidebar-hidden');
    }
  }, []);

  const saveSession = useCallback(() => {
    const name = sessionName.trim() || ('Session ' + (sessions.length + 1));
    const id = generateId('sess');
    const now = Date.now();
    const entry = { id, name, createdAt: now, updatedAt: now };
    const payload = JSON.stringify({ tree, chat: chat.slice(-24), model, layout: null, geminiKey: null, provider: null, customModel: null, attachments: null, savedAt: now });
    try { localStorage.setItem('nexus_session_' + id, payload); } catch { addToast('Could not save session.', 'error'); return; }
    const updated = [entry, ...sessions];
    setSessions(updated);
    try { localStorage.setItem('nexus_sessions', JSON.stringify(updated)); } catch { /* ignore */ }
    setSessionName('');
    addToast('Session "' + name + '" saved');
  }, [sessions, sessionName, tree, chat, addToast]);

  const loadSession = useCallback((id) => {
    try {
      const raw = localStorage.getItem('nexus_session_' + id);
      if (!raw) { addToast('Session data not found.', 'error'); return; }
      const data = JSON.parse(raw);
      if (data.tree) setTree(data.tree);
      if (Array.isArray(data.chat)) setChat(data.chat);
      addToast('Loaded session');
    } catch { addToast('Could not load session.', 'error'); }
  }, [setTree, setChat, addToast]);

  const deleteSession = useCallback((id) => {
    try { localStorage.removeItem('nexus_session_' + id); } catch { /* ignore */ }
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    try { localStorage.setItem('nexus_sessions', JSON.stringify(updated)); } catch { /* ignore */ }
  }, [sessions]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { closeMenus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeMenus]);

  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark">
          <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="8" fill="currentColor" stroke="currentColor" strokeWidth="2" opacity="0.9"/>
            <circle cx="24" cy="24" r="3" fill="var(--bp-800)"/>
            <line x1="32" y1="24" x2="43" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6"/>
            <line x1="32" y1="24" x2="43" y2="29" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6"/>
            <line x1="16" y1="24" x2="5" y2="19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6"/>
            <line x1="16" y1="24" x2="5" y2="29" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6"/>
            <line x1="24" y1="32" x2="24" y2="43" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6"/>
            <line x1="24" y1="16" x2="24" y2="5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6"/>
            <circle cx="43" cy="19" r="3" fill="currentColor" opacity="0.4"/>
            <circle cx="43" cy="29" r="3" fill="currentColor" opacity="0.4"/>
            <circle cx="5" cy="19" r="3" fill="currentColor" opacity="0.4"/>
            <circle cx="5" cy="29" r="3" fill="currentColor" opacity="0.4"/>
            <circle cx="24" cy="43" r="3" fill="currentColor" opacity="0.4"/>
            <circle cx="24" cy="5" r="3" fill="currentColor" opacity="0.4"/>
          </svg>
        </div>
        <div className="brand-text">
          <h1>NEXUS <span>ARCHITECT</span></h1>
          <p>Plan with purpose</p>
        </div>
      </div>

      <div className="header-actions">
        <div className="toolbar-group" role="group" aria-label="Edit tools">
          <button className="icon-btn" aria-label="Undo (Ctrl+Z)" title="Undo last change" disabled={!history.length} onClick={undo}>
            <Undo2 size={16} />
          </button>
          <button className="icon-btn" aria-label="Redo (Ctrl+Y)" title="Redo undone change" disabled={!redoStack.length} onClick={redo}>
            <Redo2 size={16} />
          </button>
        </div>

        <div className="toolbar-group" role="group" aria-label="View tools">
          <button className="icon-btn" aria-label="Auto-arrange layout" title="Re-layout the whole tree" disabled={!has} onClick={handleArrange}>
            <LayoutGrid size={16} />
          </button>
          <select className="layout-select" aria-label="Layout style" value={layout} onChange={(e) => setLayout(e.target.value)} disabled={!has}>
            {LAYOUTS.map(l => <option key={l.id} value={l.id} title={l.desc}>{l.label}</option>)}
          </select>
          <button className="icon-btn" aria-label="Fit to view" title="Zoom to fit all nodes" disabled={!has} onClick={fitView}>
            <Maximize size={16} />
          </button>
          <div className="zoom-group" role="group" aria-label="Zoom controls">
            <button className="icon-btn" aria-label="Zoom out" title="Zoom out" onClick={zoomOut}><ZoomOut size={15} /></button>
            <span id="zoomLevel" role="status" aria-live="polite">{Math.round(canvas.scale * 100)}%</span>
            <button className="icon-btn" aria-label="Zoom in" title="Zoom in" onClick={zoomIn}><ZoomIn size={15} /></button>
          </div>
        </div>

        <div className={`search-wrap${searchQuery !== '' ? ' active' : ''}`}>
          <input ref={searchRef} className="search-input" type="text" placeholder="Search nodes\u2026" title="Search nodes by title or notes"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearchQuery('')} />
          {searchQuery !== '' && (
            <button className="icon-btn search-clear" aria-label="Clear search" onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}>
              <X size={15} />
            </button>
          )}
        </div>
        <button className={`icon-btn${searchQuery !== '' ? ' active' : ''}`} aria-label="Toggle search" title="Search nodes"
          onClick={() => { const el = searchRef.current; if (el) { if (document.activeElement === el) { setSearchQuery(''); } else { el.focus(); el.select(); } } }}>
          <Search size={16} />
        </button>

        <div className="toolbar-group export-group">
          <button className="btn-ghost export-trigger" disabled={!has} onClick={() => setExportOpen(!exportOpen)}
            title="Export or import your project">
            <Download size={14} /><span className="btn-label">Export</span>
          </button>
          {exportOpen && (
            <div className="header-dropdown export-dropdown">
              <button className="dropdown-item" onClick={handleExportJSON}><Download size={13} /> JSON data</button>
              <button className="dropdown-item" onClick={handleExportMD}><FileDown size={13} /> Markdown outline</button>
              <button className="dropdown-item" onClick={handleExportImage}><Image size={13} /> PNG image</button>
              <button className="dropdown-item" onClick={handleExportBundle}><Package size={13} /> .nexus bundle</button>
              <div className="dropdown-divider" />
              <button className="dropdown-item" onClick={() => importRef.current?.click()}><Upload size={13} /> Import file\u2026</button>
              <input ref={importRef} type="file" accept="application/json,.nexus" hidden onChange={handleImport} />
            </div>
          )}
        </div>

        <button className="icon-btn" aria-label="Help and shortcuts" title="Keyboard shortcuts & tips" onClick={() => { setHelpOpen(!helpOpen); setMenuOpen(false); }}>
          {helpOpen ? <X size={17} /> : <HelpCircle size={17} />}
        </button>

        <button className="icon-btn hamburger-btn" aria-label="Menu" title="Documents, history, settings and more" onClick={() => { setMenuOpen(!menuOpen); setHelpOpen(false); }}>
          {menuOpen ? <X size={17} /> : <Menu size={17} />}
        </button>

        <button className="icon-btn" aria-label="Toggle AI chat" title="Show or hide the AI chat panel" onClick={handleSidebarToggle}>
          <MessageSquare size={17} />
        </button>
      </div>

      {helpOpen && (
        <div className="header-overlay-panel help-panel">
          <div className="panel-header"><HelpCircle size={14} /> Help &amp; Shortcuts</div>
          <div className="help-content">
            <div className="help-section">
              <div className="help-section-title">Keyboard shortcuts</div>
              <div className="help-shortcuts">
                <div><kbd>Ctrl+Z</kbd> <span>Undo</span></div>
                <div><kbd>Ctrl+Y</kbd> <span>Redo</span></div>
                <div><kbd>Ctrl+S</kbd> <span>Save project</span></div>
                <div><kbd>Ctrl+N</kbd> <span>New node / New project</span></div>
                <div><kbd>Ctrl+A</kbd> <span>Select all visible nodes</span></div>
                <div><kbd>Delete</kbd> <span>Remove selected nodes</span></div>
                <div><kbd>Escape</kbd> <span>Close panel / Deselect</span></div>
                <div><kbd>Shift</kbd>+drag <span>Box-select multiple nodes</span></div>
              </div>
            </div>
            <div className="help-section">
              <div className="help-section-title">Getting started</div>
              <ul className="help-tips">
                <li>Describe your project in the AI chat panel to generate a structured mind map</li>
                <li>Click a node to edit its title and notes in the details drawer</li>
                <li>Drag nodes to reposition them manually</li>
                <li>Use the <strong>Export</strong> menu to save your work as JSON, Markdown, or an image</li>
                <li>Create multiple documents for different projects using the <strong>Menu</strong> button</li>
                <li>Sessions auto-save every 30 seconds for quick recovery</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="header-overlay-panel menu-panel">
          <div className="menu-tabs">
            <button className={`menu-tab${menuTab === 'docs' ? ' active' : ''}`} onClick={() => setMenuTab('docs')}>
              <FileText size={13} /> Docs
            </button>
            <button className={`menu-tab${menuTab === 'history' ? ' active' : ''}`} onClick={() => setMenuTab('history')}>
              <History size={13} /> History
            </button>
            <button className={`menu-tab${menuTab === 'sessions' ? ' active' : ''}`} onClick={() => setMenuTab('sessions')}>
              <Compass size={13} /> Sessions
            </button>
            <button className={`menu-tab${menuTab === 'attachments' ? ' active' : ''}`} onClick={() => setMenuTab('attachments')}>
              <Paperclip size={13} /> Files
            </button>
            <button className={`menu-tab${menuTab === 'settings' ? ' active' : ''}`} onClick={() => setMenuTab('settings')}>
              <Settings size={13} /> Settings
            </button>
          </div>

          <div className="menu-content">
            {menuTab === 'docs' && (
              <div className="menu-section">
                <div className="menu-section-title">Documents</div>
                <div className="menu-doc-list">
                  {documents.map(d => (
                    <div key={d.id} className={`menu-doc-item${d.id === activeDocId ? ' active' : ''}`}>
                      <button className="menu-doc-name" onClick={() => { switchDocument(d.id); setMenuOpen(false); }}>
                        <FileText size={13} />
                        <span>{d.name}</span>
                        {d.id === activeDocId && <span className="menu-doc-check">{'\u2713'}</span>}
                      </button>
                      {d.id !== activeDocId && (
                        <button className="menu-doc-del" aria-label="Delete document" onClick={(e) => { e.stopPropagation(); deleteDocument(d.id); }}>
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button className="menu-action-btn" onClick={() => { createDocument(''); setMenuOpen(false); }}>
                  <Plus size={13} /> New document
                </button>
              </div>
            )}

            {menuTab === 'history' && (
              <div className="menu-section">
                <div className="menu-section-title">Undo / Redo</div>
                <div className="menu-history-actions">
                  <button className={`menu-action-btn${!history.length ? ' disabled' : ''}`} disabled={!history.length} onClick={() => { undo(); }}>
                    <Undo2 size={13} /> Undo <span className="menu-count">{history.length}</span>
                  </button>
                  <button className={`menu-action-btn${!redoStack.length ? ' disabled' : ''}`} disabled={!redoStack.length} onClick={() => { redo(); }}>
                    <Redo2 size={13} /> Redo <span className="menu-count">{redoStack.length}</span>
                  </button>
                </div>
                <div className="menu-hint">Each action creates a snapshot. Max 20 undo steps.</div>
              </div>
            )}

            {menuTab === 'sessions' && (
              <div className="menu-section">
                <div className="menu-section-title">Sessions</div>
                <div className="menu-session-save">
                  <input className="settings-input" type="text" placeholder="Session name\u2026" value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveSession(); }} />
                  <button className="menu-action-btn" onClick={saveSession}><Plus size={13} /> Save</button>
                </div>
                <div className="menu-session-list">
                  {sessions.length === 0 && <div className="menu-empty">No sessions yet. Sessions auto-save every 30s.</div>}
                  {[...sessions].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)).map(s => (
                    <div key={s.id} className="menu-session-item">
                      <button className="menu-session-name" onClick={() => { loadSession(s.id); setMenuOpen(false); }}>
                        <FileText size={12} />
                        <span>{s.name}</span>
                        <span className="menu-meta">{timeAgo(s.updatedAt || s.createdAt, nowTs)}</span>
                      </button>
                      {!s.auto && (
                        <button className="menu-session-del" aria-label="Delete session" onClick={() => deleteSession(s.id)}>
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {menuTab === 'attachments' && (
              <div className="menu-section">
                <div className="menu-section-title">Attachments</div>
                <div className="menu-attachments-list">
                  {attachments.length === 0 && <div className="menu-empty">No files attached yet.</div>}
                  {attachments.map(a => (
                    <div key={a.id} className="menu-attachment-item">
                      {a.thumbnail ? <img src={a.thumbnail} alt={a.name} className="menu-attachment-thumb" />
                        : <div className="menu-attachment-icon"><FileText size={14} /></div>}
                      <div className="menu-attachment-info">
                        <div className="menu-attachment-name">{a.name}</div>
                        <div className="menu-meta">{a.type || 'unknown'} &middot; {a.size > 1024 ? Math.round(a.size / 1024) + 'KB' : a.size + 'B'}</div>
                      </div>
                      <button className="menu-attachment-del" aria-label="Remove file"
                        onClick={() => { const updated = attachments.filter(x => x.id !== a.id); setAttachments(updated); try { localStorage.setItem('nexus_attachments', JSON.stringify(updated)); } catch { /* ignore */ } }}>
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
                <button className="menu-action-btn" onClick={() => document.getElementById('menuFileInput')?.click()}>
                  <Upload size={13} /> Add files
                </button>
                <input id="menuFileInput" type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (!files.length) return;
                    const newFiles = [];
                    for (const file of files) {
                      const entry = { id: generateId('file'), name: file.name, type: file.type, size: file.size };
                      if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        const dataUrl = await new Promise(res => { reader.onload = (e) => res(e.target.result); reader.readAsDataURL(file); });
                        const img = new Image();
                        await new Promise(res => { img.onload = res; img.src = dataUrl; });
                        const c = document.createElement('canvas');
                        const max = 150;
                        c.width = Math.min(img.width, max);
                        c.height = Math.min(img.height, max) * (Math.min(img.width, max) / img.width);
                        const ctx = c.getContext('2d');
                        ctx.drawImage(img, 0, 0, c.width, c.height);
                        entry.thumbnail = c.toDataURL('image/jpeg', 0.5);
                      }
                      newFiles.push(entry);
                    }
                    const updated = [...attachments, ...newFiles];
                    setAttachments(updated);
                    try { localStorage.setItem('nexus_attachments', JSON.stringify(updated)); } catch { /* ignore */ }
                    addToast('Added ' + files.length + ' file(s)');
                    e.target.value = '';
                  }} />
              </div>
            )}

            {menuTab === 'settings' && (
              <div className="menu-section">
                <div className="menu-section-title">AI Provider</div>
                <div className="menu-settings-row">
                  <button className={`menu-toggle-btn${provider === 'puter' ? ' active' : ''}`} onClick={() => setProvider('puter')}>
                    <Cpu size={13} /> Puter.ai
                  </button>
                  <button className={`menu-toggle-btn${provider === 'custom' ? ' active' : ''}`} onClick={() => setProvider('custom')}>
                    <KeyRound size={13} /> Custom API
                  </button>
                </div>
                {provider === 'custom' && (
                  <div className="menu-settings-row">
                    <label className="menu-label">Model</label>
                    <input className="settings-input" type="text" placeholder="gemini-2.5-flash, gpt-4o, \u2026" value={customModel}
                      onChange={(e) => setCustomModel(e.target.value.trim())} />
                  </div>
                )}
                <div className="menu-settings-row">
                  <label className="menu-label">API Key {provider === 'custom' ? '(required)' : '(fallback)'}</label>
                  <div className="menu-key-row">
                    <input className="settings-input" type="password" placeholder={provider === 'custom' ? 'Paste your API key\u2026' : 'Paste your Gemini API key\u2026'}
                      value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
                    <button className="menu-action-btn" disabled={!keyInput.trim()} onClick={() => { setGeminiKey(keyInput.trim()); addToast('API key saved'); }}>Save</button>
                  </div>
                </div>
                {geminiKey && <button className="menu-link-btn" onClick={() => { setGeminiKey(''); setKeyInput(''); }}>Clear saved key</button>}
                <div className="menu-divider" />
                <div className="menu-section-title">Project</div>
                <button className="menu-action-btn danger" onClick={() => {
                  if (!resetArmed) { setResetArmed(true); addToast('Tap "Clear" once more to wipe the slate clean');
                    clearTimeout(resetTimer.current); resetTimer.current = setTimeout(() => setResetArmed(false), 4000); }
                  else { clearTimeout(resetTimer.current); setResetArmed(false); resetProject();
                    setCanvas({ scale: 1, x: document.getElementById('canvasWrap')?.clientWidth / 2 || 400, y: 70 }); setMenuOpen(false); }
                }}>
                  <Trash2 size={13} /> {resetArmed ? 'Confirm clear' : 'Clear current project'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
