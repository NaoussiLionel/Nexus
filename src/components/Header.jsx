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
  HelpCircle, FileText, History,
  Settings, Pen, KeyRound, Cpu, Trash2, Compass, ChevronRight
} from 'lucide-react';

function countMatchingNodes(node, query) {
  const q = query.toLowerCase();
  let count = (node.title.toLowerCase().includes(q) || (node.description && node.description.toLowerCase().includes(q))) ? 1 : 0;
  if (node.children) node.children.forEach(c => count += countMatchingNodes(c, q));
  return count;
}

function timeAgo(ts, now) {
  if (!ts) return '';
  const diff = now - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function MenuDropdown({ label, icon, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const focusable = ref.current?.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])');
    if (focusable?.length) setTimeout(() => focusable[0].focus(), 50);
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); return; }
      if (e.key === 'Tab' && focusable?.length) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onClick); };
  }, [open]);

  return (
    <div className="menu-dropdown" ref={ref}>
      <button ref={btnRef} className={`menu-bar-btn${open ? ' open' : ''}`} onClick={() => setOpen(!open)} aria-haspopup="true" aria-expanded={open}>
        {icon}<span>{label}</span>
      </button>
      {open && <div className="menu-bar-dropdown">{children}</div>}
    </div>
  );
}

function MenuItem({ onClick, icon, label, right, disabled, danger }) {
  return (
    <button className={`menu-bar-item${disabled ? ' disabled' : ''}${danger ? ' danger' : ''}`} disabled={disabled} onClick={() => { onClick?.(); }}>
      {icon && <span className="mbi-icon">{icon}</span>}
      <span className="mbi-label">{label}</span>
      {right && <span className="mbi-right">{right}</span>}
    </button>
  );
}

function MenuDivider() {
  return <div className="menu-bar-divider" />;
}

function MenuSub({ label, icon, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="menu-bar-sub" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <div className="menu-bar-item sub-trigger">
        {icon && <span className="mbi-icon">{icon}</span>}
        <span className="mbi-label">{label}</span>
        <ChevronRight size={12} className="mbi-right" />
      </div>
      {open && <div className="menu-bar-submenu">{children}</div>}
    </div>
  );
}

export default function Header() {
  const {
    tree, chat, canvas, setTree, setChat, setCanvas, pushHistory, persist,
    resetProject, addToast, resetArmed, setResetArmed,
    fitView, zoomIn, zoomOut, undo, redo, history, redoStack, layout, setLayout,
    searchQuery, setSearchQuery,
    documents, activeDocId, switchDocument, createDocument,
    model, geminiKey, setGeminiKey, provider, setProvider, customModel, setCustomModel, setModel,
    maxDepth, setMaxDepth,
  } = useNexus();
  const resetTimer = useRef(null);
  const importRef = useRef(null);
  const searchRef = useRef(null);
  const has = !!tree;

  const [helpOpen, setHelpOpen] = useState(false);
  const [sessions, setSessions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus_sessions') || '[]'); } catch { return []; }
  });
  const [keyInput, setKeyInput] = useState('');
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [sessionName, setSessionName] = useState('');
  const [namingSession, setNamingSession] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.title = tree ? `${tree.title} \u2014 Nexus Architect` : 'Nexus Architect \u2014 AI Project Planning Canvas';
  }, [tree]);

  const handleArrange = useCallback((layoutType) => {
    if (!tree) return;
    pushHistory();
    const useLayout = layoutType || layout;
    if (layoutType) setLayout(layoutType);
    recomputeLayout(tree, useLayout);
    setTree({ ...tree });
    persist();
    addToast('Auto-arranged the layout');
  }, [tree, layout, pushHistory, setTree, persist, addToast, setLayout]);

  const handleExportJSON = useCallback(() => {
    if (!tree) return;
    downloadFile(JSON.stringify(stripForExport(tree), null, 2), sanitizeFilename(tree.title) + '.json', 'application/json');
    addToast('Exported as JSON');
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
  }, [tree, addToast]);

  const handleExportBundle = useCallback(() => {
    if (!tree) return;
    let att = [];
    try { att = JSON.parse(localStorage.getItem('nexus_attachments') || '[]'); } catch { /* ignore */ }
    const bundle = { version: 2, exportedAt: Date.now(), type: 'nexus-architect-bundle', tree: stripForExport(tree), chat: chat.slice(-48), attachments: att };
    downloadFile(JSON.stringify(bundle, null, 2), sanitizeFilename(tree.title) + '.nexus', 'application/json');
    addToast('Exported project bundle');
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
  }, [layout, pushHistory, setTree, setChat, persist, addToast, fitView]);

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

  return (
    <header className="app-header">
      <div className="header-left">
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
        </div>

        <nav className="header-menus" role="menubar">
          <MenuDropdown label="File" icon={<FileText size={14} />}>
            <MenuItem icon={<Plus size={13} />} label="New document" right="Ctrl+N" onClick={() => createDocument('')} />
            {documents.map(d => (
              <MenuItem key={d.id} icon={<FileText size={13} />} label={d.name}
                right={d.id === activeDocId ? '\u2713' : undefined}
                onClick={() => switchDocument(d.id)} />
            ))}
            <MenuDivider />
            <MenuSub label="Export" icon={<Download size={13} />}>
              <MenuItem icon={<Download size={13} />} label="JSON data" disabled={!has} onClick={handleExportJSON} />
              <MenuItem icon={<FileDown size={13} />} label="Markdown outline" disabled={!has} onClick={handleExportMD} />
              <MenuItem icon={<Image size={13} />} label="PNG image" disabled={!has} onClick={handleExportImage} />
              <MenuItem icon={<Package size={13} />} label=".nexus bundle" disabled={!has} onClick={handleExportBundle} />
            </MenuSub>
            <MenuItem icon={<Upload size={13} />} label="Import file\u2026" onClick={() => importRef.current?.click()} />
            <input ref={importRef} type="file" accept="application/json,.nexus" hidden onChange={handleImport} />
            <MenuDivider />
            {namingSession ? (
              <div className="menu-bar-item" style={{ padding:'4px 10px', gap:'4px', flexWrap:'wrap' }}>
                <input className="menu-bar-input" type="text" placeholder="Session name\u2026" value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const name = sessionName.trim() || ('Session ' + (sessions.length + 1));
                      const id = generateId('sess');
                      const now = Date.now();
                      const entry = { id, name, createdAt: now, updatedAt: now };
                      const payload = JSON.stringify({ tree, chat: chat.slice(-24), model, layout: null, geminiKey: null, provider: null, customModel: null, attachments: null, savedAt: now });
                      try { localStorage.setItem('nexus_session_' + id, payload); } catch { addToast('Could not save session.', 'error'); return; }
                      const updated = [entry, ...sessions];
                      setSessions(updated);
                      try { localStorage.setItem('nexus_sessions', JSON.stringify(updated)); } catch { /* ignore */ }
                      addToast('Session "' + name + '" saved');
                      setNamingSession(false); setSessionName('');
                    }
                    if (e.key === 'Escape') { setNamingSession(false); setSessionName(''); }
                  }} autoFocus />
                <button className="menu-bar-btn sm" onClick={() => {
                  const name = sessionName.trim() || ('Session ' + (sessions.length + 1));
                  const id = generateId('sess');
                  const now = Date.now();
                  const entry = { id, name, createdAt: now, updatedAt: now };
                  const payload = JSON.stringify({ tree, chat: chat.slice(-24), model, layout: null, geminiKey: null, provider: null, customModel: null, attachments: null, savedAt: now });
                  try { localStorage.setItem('nexus_session_' + id, payload); } catch { addToast('Could not save session.', 'error'); return; }
                  const updated = [entry, ...sessions];
                  setSessions(updated);
                  try { localStorage.setItem('nexus_sessions', JSON.stringify(updated)); } catch { /* ignore */ }
                  addToast('Session "' + name + '" saved');
                  setNamingSession(false); setSessionName('');
                }}>Save</button>
                <button className="menu-bar-btn sm" onClick={() => { setNamingSession(false); setSessionName(''); }}>Cancel</button>
              </div>
            ) : (
              <MenuItem icon={<Compass size={13} />} label="Save session\u2026" right="Ctrl+S" onClick={() => { setNamingSession(true); setSessionName(''); }} />
            )}
            {sessions.length > 0 && (
              <MenuSub label="Load session" icon={<History size={13} />}>
                {[...sessions].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)).map(s => (
                  <MenuItem key={s.id} icon={<FileText size={13} />} label={s.name}
                    right={timeAgo(s.updatedAt || s.createdAt, nowTs)}
                    onClick={() => loadSession(s.id)} />
                ))}
              </MenuSub>
            )}
            <MenuDivider />
            <MenuItem icon={<Trash2 size={13} />} label="Clear project" danger onClick={() => {
              if (!resetArmed) { setResetArmed(true); addToast('Tap "Clear" once more to wipe the slate clean');
                clearTimeout(resetTimer.current); resetTimer.current = setTimeout(() => setResetArmed(false), 4000); }
              else { clearTimeout(resetTimer.current); setResetArmed(false); resetProject();
                setCanvas({ scale: 1, x: document.getElementById('canvasWrap')?.clientWidth / 2 || 400, y: 70 }); }
            }} />
          </MenuDropdown>

          <MenuDropdown label="Edit" icon={<Pen size={14} />}>
            <MenuItem icon={<Undo2 size={13} />} label="Undo" right="Ctrl+Z" disabled={!history.length} onClick={undo} />
            <MenuItem icon={<Redo2 size={13} />} label="Redo" right="Ctrl+Y" disabled={!redoStack.length} onClick={redo} />
            <MenuDivider />
            <MenuItem icon={<LayoutGrid size={13} />} label="Select all" right="Ctrl+A" disabled={!has} />
          </MenuDropdown>

          <MenuDropdown label="View" icon={<LayoutGrid size={14} />}>
            <div className="menu-bar-item" style={{ cursor:'default', padding:'4px 10px' }}>
              <span className="mbi-label" style={{ fontSize:'.65rem', color:'var(--ink-faint)', textTransform:'uppercase', letterSpacing:'.08em' }}>Layout</span>
            </div>
            {LAYOUTS.map(l => (
              <MenuItem key={l.id} label={l.label} right={layout === l.id ? '\u2713' : undefined} onClick={() => handleArrange(l.id)} />
            ))}
            <MenuItem icon={<Maximize size={13} />} label="Fit to view" disabled={!has} onClick={fitView} />
            <MenuDivider />
            <MenuItem icon={<ZoomIn size={13} />} label="Zoom in" onClick={zoomIn} right={Math.round(canvas.scale * 100) + '%'} />
            <MenuItem icon={<ZoomOut size={13} />} label="Zoom out" onClick={zoomOut} />
          </MenuDropdown>

          <MenuDropdown label="Options" icon={<Cpu size={14} />}>
            <div className="menu-bar-item" style={{ cursor:'default', padding:'4px 10px' }}>
              <span className="mbi-label" style={{ fontSize:'.65rem', color:'var(--ink-faint)', textTransform:'uppercase', letterSpacing:'.08em' }}>AI Provider</span>
            </div>
            <MenuItem icon={<Cpu size={13} />} label="Puter.ai" right={provider === 'puter' ? '\u2713' : undefined} onClick={() => setProvider('puter')} />
            <MenuItem icon={<KeyRound size={13} />} label="Custom API" right={provider === 'custom' ? '\u2713' : undefined} onClick={() => setProvider('custom')} />
            <MenuDivider />
            <div className="menu-bar-item" style={{ cursor:'default', padding:'4px 10px' }}>
              <span className="mbi-label" style={{ fontSize:'.65rem', color:'var(--ink-faint)' }}>Model</span>
            </div>
            <div style={{ padding:'4px 10px 8px' }}>
              {provider === 'puter' ? (
                <select className="menu-bar-select" value={model} onChange={(e) => { setModel(e.target.value); persist(); }}>
                  {['gemini-2.0-flash','gpt-4o','claude-3-5-sonnet-20241022'].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input className="menu-bar-input" type="text" placeholder="gemini-2.5-flash, gpt-4o\u2026" value={customModel}
                  onChange={(e) => setCustomModel(e.target.value.trim())} />
              )}
            </div>
            <MenuDivider />
            <div className="menu-bar-item" style={{ cursor:'default', padding:'4px 10px' }}>
              <span className="mbi-label" style={{ fontSize:'.65rem', color:'var(--ink-faint)' }}>API Key</span>
            </div>
            <div style={{ padding:'4px 10px 8px', display:'flex', gap:'6px' }}>
              <input className="menu-bar-input" type="password" placeholder="Paste your API key\u2026"
                value={keyInput} onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setGeminiKey(keyInput.trim()); addToast('API key saved'); } }} />
              <button className="menu-bar-btn sm" disabled={!keyInput.trim()} onClick={() => { setGeminiKey(keyInput.trim()); addToast('API key saved'); }}>Save</button>
            </div>
            {geminiKey && <MenuItem label="Clear saved key" onClick={() => { setGeminiKey(''); setKeyInput(''); }} />}
            <div style={{ padding:'4px 10px 8px', fontSize:'.65rem', color:'var(--ink-faint)', lineHeight:1.5 }}>
              <span style={{ color:'var(--warning, #C8963E)' }}>\u26A0</span> Your API key is stored in plaintext in your browser&apos;s localStorage. Anyone with access to your device can read it. Keep your key secure and never share it.
            </div>
            <MenuDivider />
            <div className="menu-bar-item" style={{ cursor:'default', padding:'4px 10px' }}>
              <span className="mbi-label" style={{ fontSize:'.65rem', color:'var(--ink-faint)', textTransform:'uppercase', letterSpacing:'.08em' }}>Max Depth</span>
            </div>
            <div style={{ padding:'4px 10px 8px', display:'flex', gap:'6px', alignItems:'center' }}>
              {[2,3,4,5].map(d => (
                <button key={d} className={`menu-bar-btn${maxDepth === d ? ' active' : ''}`}
                  onClick={() => setMaxDepth(d)}
                  style={{ minWidth:'28px', fontWeight: maxDepth === d ? 700 : 400, background: maxDepth === d ? 'var(--bp-600)' : 'var(--bp-700)' }}>
                  {d}
                </button>
              ))}
            </div>
          </MenuDropdown>

          <button className="menu-bar-btn help-trigger" onClick={() => setHelpOpen(true)} aria-label="Open help and usage guide">
            <HelpCircle size={14} /><span>Help</span>
          </button>
        </nav>
      </div>

      <div className="header-right">
        <div className={`header-search${searchQuery !== '' ? ' active' : ''}`}>
          <Search size={14} className="header-search-icon" />
          <input ref={searchRef} type="text" placeholder="Find nodes\u2026"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearchQuery('')} />
          {searchQuery !== '' && (
        <>
          <span className="search-badge">{tree ? countMatchingNodes(tree, searchQuery) : 0}</span>
          <button className="header-search-clear" aria-label="Clear search" title="Clear search" onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}>
            <X size={14} />
          </button>
        </>
          )}
        </div>
      </div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </header>
  );
}

function HelpModal({ onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement;
    const focusable = el.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
    if (focusable.length) focusable[0].focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab') {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);

  return (
    <div className="help-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label="Help and usage guide">
      <div className="help-modal" ref={ref}>
        <div className="help-modal-header">
          <h2>Nexus Architect \u2014 Full Documentation</h2>
          <button className="icon-btn" aria-label="Close help" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="help-modal-body">
          <section>
            <h3>1. Getting started</h3>
            <p>Nexus Architect is an AI-powered visual mind-mapping canvas for project planning. It turns rough ideas into structured, actionable plans using hierarchical trees, AI suggestions, and a freeform canvas.</p>
            <ol>
              <li><strong>Describe your project</strong> \u2014 Type what you want to build in the AI chat panel on the left and press Enter. The AI analyzes your input and generates a structured tree.</li>
              <li><strong>Explore the map</strong> \u2014 The tree appears on the canvas. Click any node to inspect and edit it in the right-side details drawer.</li>
              <li><strong>Refine with AI</strong> \u2014 Hover a node and click the sparkle icon to expand it into sub-items, or ask the chat for changes in natural language.</li>
              <li><strong>Rearrange freely</strong> \u2014 Drag nodes to reposition them. Use <kbd>Shift</kbd>+drag to box-select multiple nodes and move them together.</li>
              <li><strong>Save automatically</strong> \u2014 Your work is saved to localStorage every 30 seconds. Use File &gt; New document or Save session for snapshots.</li>
            </ol>
          </section>

          <section>
            <h3>2. Menu bar reference</h3>
            <div className="help-grid">
              <div className="help-card">
                <div className="help-card-icon"><FileText size={16} /></div>
                <div className="help-card-title">File</div>
                <p>Document management (create, switch, rename), import/export (JSON, Markdown, PNG, .nexus bundle), session save/load, and clear project. Keyboard: <kbd>Ctrl+N</kbd> new document.</p>
              </div>
              <div className="help-card">
                <div className="help-card-icon"><Settings size={16} /></div>
                <div className="help-card-title">Edit</div>
                <p>Undo (<kbd>Ctrl+Z</kbd>) and redo (<kbd>Ctrl+Y</kbd>). Preferences to configure Gemini API key for custom AI provider.</p>
              </div>
              <div className="help-card">
                <div className="help-card-icon"><LayoutGrid size={16} /></div>
                <div className="help-card-title">View</div>
                <p>Layout selector (Tree, Root, Two-sided, Star), Fit to view, Zoom in/out, Search nodes, and Max depth control (2\u20135 levels).</p>
              </div>
              <div className="help-card">
                <div className="help-card-icon"><Cpu size={16} /></div>
                <div className="help-card-title">Options</div>
                <p>AI Provider toggle between Puter.ai (built-in, no key required) and Custom API (bring your own Gemini or OpenAI key). Model selection and API key input.</p>
              </div>
            </div>
          </section>

          <section>
            <h3>3. Layout types</h3>
            <table className="help-table">
              <thead><tr><th>Layout</th><th>Best for</th><th>Description</th></tr></thead>
              <tbody>
                <tr><td><strong>Tree \u2193</strong></td><td>WBS, org charts</td><td>Top-down hierarchy, root at top, children below. Classic breakdown structure.</td></tr>
                <tr><td><strong>Root \u2192</strong></td><td>Outlines, roadmaps</td><td>Root on the left, branches extend rightward. Good for linear reading.</td></tr>
                <tr><td><strong>2-Sided \u2194</strong></td><td>Mind maps, brainstorming</td><td>Root centered, children alternate left/right. Maximizes horizontal space.</td></tr>
                <tr><td><strong>Star \u2606</strong></td><td>Radial, concept maps</td><td>Radial burst from center. Use for brainstorming around a core idea.</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h3>4. Working with nodes</h3>
            <ul>
              <li><strong>Click</strong> \u2014 Select a node and open the details drawer on the right. Edit its title, notes, and checklist.</li>
              <li><strong>Drag</strong> \u2014 Click and drag any node to reposition it. The canvas auto-pans if you drag near the edges.</li>
              <li><strong>Multi-select</strong> \u2014 Hold <kbd>Shift</kbd> and drag to draw a selection box around multiple nodes. Drag any selected node to move them all.</li>
              <li><strong>Delete</strong> \u2014 Select a node (or multiple) and press <kbd>Delete</kbd> or <kbd>Backspace</kbd>. An Undo toast lets you revert.</li>
              <li><strong>Isolate</strong> \u2014 Click the focus icon on a node toolbar to view only that branch. Click again to show the full tree.</li>
              <li><strong>Collapse</strong> \u2014 Click the chevron on a parent node to hide its children. The collapse count shows how many nodes are hidden.</li>
              <li><strong>Depth control</strong> \u2014 In View menu, set Max depth (2\u20135). Nodes beyond this depth auto-isolate their parent when expanded.</li>
            </ul>
          </section>

          <section>
            <h3>5. Checklists / To-do items</h3>
            <p>Each node supports a built-in checklist for tracking sub-tasks, requirements, or action items.</p>
            <ul>
              <li><strong>Quick-add from node</strong> \u2014 Hover any node and click the checklist icon (checkbox) on the toolbar. Type an item and press Enter. Existing items appear inline with checkboxes you can toggle.</li>
              <li><strong>Full editor in drawer</strong> \u2014 Open a node and scroll to the Checklist section. Add, check off, or remove items. A progress bar shows completion percentage.</li>
              <li><strong>AI-generated checklists</strong> \u2014 Ask the AI for "a to-do list" or "next steps" and it will render checkable items in the chat response.</li>
            </ul>
          </section>

          <section>
            <h3>6. AI interaction guide</h3>
            <table className="help-table">
              <thead><tr><th>Action</th><th>How</th><th>What it does</th></tr></thead>
              <tbody>
                <tr><td><strong>Chat</strong></td><td>Type in the left panel, press Enter</td><td>Describes your project, requests changes, asks for expansions. Uses the full system prompt with WBS/Agile/Waterfall/etc. methodologies.</td></tr>
                <tr><td><strong>Expand node</strong></td><td>Hover a node \u2192 click sparkle icon</td><td>AI generates 3\u20135 sub-items for that node as concrete, actionable children.</td></tr>
                <tr><td><strong>Elaborate</strong></td><td>Open a node \u2192 click "Elaborate with AI"</td><td>AI writes a detailed description with bullet points for the node's notes field.</td></tr>
                <tr><td><strong>Confirm</strong></td><td>AI actions show a dialog before applying</td><td>Review what the AI wants to change (add/update/delete nodes) and Approve or Cancel.</td></tr>
                <tr><td><strong>Web research</strong></td><td>AI requests it via @@SEARCH@@ marker</td><td>The app fetches DuckDuckGo results and re-runs the prompt with context. No API key needed.</td></tr>
              </tbody>
            </table>
            <p><strong>Providers:</strong> Puter.ai works out of the box (no setup). For Custom API, enter a Gemini or OpenAI model name and API key in Options menu. The app never sends your key anywhere except directly to the provider.</p>
            <p><strong>Language:</strong> The AI detects and replies in the same language you write in. System prompts include recent user messages as language hints.</p>
          </section>

          <section>
            <h3>7. Keyboard shortcuts</h3>
            <div className="help-shortcuts-grid">
              <div><kbd>Ctrl+Z</kbd> <span>Undo last change</span></div>
              <div><kbd>Ctrl+Y</kbd> <span>Redo undone change</span></div>
              <div><kbd>Ctrl+Shift+Z</kbd> <span>Redo (alternative)</span></div>
              <div><kbd>Delete</kbd> / <kbd>Backspace</kbd> <span>Remove selected node(s)</span></div>
              <div><kbd>Escape</kbd> <span>Close drawer / deselect</span></div>
              <div><kbd>\u2191</kbd> <kbd>\u2193</kbd> <span>Navigate nodes up/down</span></div>
              <div><kbd>\u2190</kbd> <span>Go to parent node</span></div>
              <div><kbd>\u2192</kbd> <span>Go to first child node</span></div>
              <div><kbd>Shift</kbd>+drag <span>Box-select multiple nodes</span></div>
              <div><kbd>Enter</kbd> (in chat) <span>Send message</span></div>
              <div><kbd>Shift+Enter</kbd> (in chat) <span>New line in message</span></div>
              <div>Scroll wheel <span>Zoom in/out on canvas</span></div>
            </div>
          </section>

          <section>
            <h3>8. Documents &amp; sessions</h3>
            <ul>
              <li><strong>Documents</strong> \u2014 Multiple independent projects. Use File &gt; New document to create one, File &gt; [document name] to switch. Each is stored separately in localStorage.</li>
              <li><strong>Sessions</strong> \u2014 Named snapshots of your current tree + chat. File &gt; Save session creates one; File &gt; Load session restores it. Useful for tracking weekly progress.</li>
              <li><strong>Auto-save</strong> \u2014 The current document is persisted to localStorage every 30 seconds. Closing and reopening the app restores your last state.</li>
            </ul>
          </section>

          <section>
            <h3>9. Canvas navigation</h3>
            <ul>
              <li><strong>Pan</strong> \u2014 Click and drag on empty canvas space. The cursor changes to a grab hand.</li>
              <li><strong>Zoom</strong> \u2014 Scroll up/down to zoom in/out. The zoom centers on your cursor position. Current zoom level is shown at bottom-right.</li>
              <li><strong>Fit to view</strong> \u2014 View &gt; Fit to view or click the title block at bottom-right. Automatically scales and centers all visible nodes.</li>
              <li><strong>Hide sidebar</strong> \u2014 Click the arrow button at bottom-left to collapse/expand the AI chat panel.</li>
              <li><strong>Resize panels</strong> \u2014 Drag the resize handles on the right edge of the sidebar or the left edge of the details drawer.</li>
            </ul>
          </section>

          <section>
            <h3>10. Export formats</h3>
            <table className="help-table">
              <thead><tr><th>Format</th><th>Extension</th><th>What's included</th></tr></thead>
              <tbody>
                <tr><td>JSON</td><td><code>.json</code></td><td>Full tree structure with titles, descriptions, checklists. Portable data format.</td></tr>
                <tr><td>Markdown</td><td><code>.md</code></td><td>Hierarchical outline (headings + bullet points). Great for docs.</td></tr>
                <tr><td>PNG</td><td><code>.png</code></td><td>Canvas screenshot at 2x resolution. Ready for presentations.</td></tr>
                <tr><td>.nexus bundle</td><td><code>.nexus</code></td><td>Tree + chat history + attachments in one file. Share with collaborators.</td></tr>
              </tbody>
            </table>
          </section>

          <section>
            <h3>11. Troubleshooting</h3>
            <table className="help-table">
              <thead><tr><th>Problem</th><th>Solution</th></tr></thead>
              <tbody>
                <tr><td>AI not responding</td><td>Check your internet connection. If using Custom API, verify the API key and model name in Options &gt; Custom API.</td></tr>
                <tr><td>"No AI available" error</td><td>For Puter.ai, ensure the site can load the Puter script (no ad blocker blocking it). For Custom, add an API key.</td></tr>
                <tr><td>Canvas is empty or zoomed out</td><td>Use View &gt; Fit to view or click the project title at bottom-right. If still empty, check the sidebar is not hidden.</td></tr>
                <tr><td>Data not loading on refresh</td><td>Check localStorage in browser DevTools &gt; Application &gt; Local Storage for <code>nexus_*</code> keys. If missing, import a backup.</td></tr>
                <tr><td>Export image is blank</td><td>Some browsers block canvas-to-image rendering. Try a different browser (Chrome or Firefox recommended).</td></tr>
                <tr><td>AI language doesn't match</td><td>The AI uses your last few messages as language hints. Write a message in your preferred language to reset it.</td></tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
