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
  Settings, KeyRound, Cpu, Trash2, Compass, ChevronRight
} from 'lucide-react';

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onClick); };
  }, [open]);

  return (
    <div className="menu-dropdown" ref={ref}>
      <button className={`menu-bar-btn${open ? ' open' : ''}`} onClick={() => setOpen(!open)} aria-haspopup="true" aria-expanded={open}>
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
            <MenuItem icon={<Plus size={13} />} label="New document" onClick={() => createDocument('')} />
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
            <MenuItem icon={<Compass size={13} />} label="Save session\u2026" onClick={() => {
              const name = prompt('Session name:') || ('Session ' + (sessions.length + 1));
              const id = generateId('sess');
              const now = Date.now();
              const entry = { id, name, createdAt: now, updatedAt: now };
              const payload = JSON.stringify({ tree, chat: chat.slice(-24), model, layout: null, geminiKey: null, provider: null, customModel: null, attachments: null, savedAt: now });
              try { localStorage.setItem('nexus_session_' + id, payload); } catch { addToast('Could not save session.', 'error'); return; }
              const updated = [entry, ...sessions];
              setSessions(updated);
              try { localStorage.setItem('nexus_sessions', JSON.stringify(updated)); } catch { /* ignore */ }
              addToast('Session "' + name + '" saved');
            }} />
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

          <MenuDropdown label="Edit" icon={<Settings size={14} />}>
            <MenuItem icon={<Undo2 size={13} />} label="Undo" right="Ctrl+Z" disabled={!history.length} onClick={undo} />
            <MenuItem icon={<Redo2 size={13} />} label="Redo" right="Ctrl+Y" disabled={!redoStack.length} onClick={redo} />
            <MenuDivider />
            <MenuItem icon={<KeyRound size={13} />} label="Preferences\u2026" onClick={() => {
              const k = prompt('Enter Gemini API key:', geminiKey || '');
              if (k !== null) setGeminiKey(k.trim());
            }} />
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
            <MenuDivider />
            <div className="menu-bar-item" style={{ cursor:'default', padding:'4px 10px' }}>
              <span className="mbi-label" style={{ fontSize:'.65rem', color:'var(--ink-faint)' }}>Max depth: {maxDepth}</span>
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
            <MenuDivider />
            <div className="menu-bar-item" style={{ cursor:'default', padding:'4px 10px' }}>
              <span className="mbi-label" style={{ fontSize:'.65rem', color:'var(--ink-faint)' }}>Search nodes</span>
            </div>
            <div style={{ padding:'4px 10px 8px' }}>
              <div className="menu-bar-search">
                <input type="text" placeholder="Find nodes\u2026" value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setSearchQuery('')} />
              </div>
            </div>
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
            <button className="header-search-clear" onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}>
              <X size={14} />
            </button>
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
          <h2>Nexus Architect Guide</h2>
          <button className="icon-btn" aria-label="Close help" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="help-modal-body">
          <section>
            <h3>Getting started</h3>
            <p>Nexus Architect turns project ideas into structured mind maps with AI. Describe what you want to build in the chat panel, and the AI will generate a hierarchical plan you can refine interactively.</p>
            <ul>
              <li>Type a project idea in the AI chat on the left panel and press <kbd>Enter</kbd></li>
              <li>The AI will suggest a tree structure with nodes you can expand, edit, and reorganize</li>
              <li>Click any node to open the inspector on the right and edit details</li>
              <li>Drag nodes to rearrange them freely on the canvas</li>
            </ul>
          </section>

          <section>
            <h3>Interface overview</h3>
            <div className="help-grid">
              <div className="help-card">
                <div className="help-card-icon"><FileText size={16} /></div>
                <div className="help-card-title">File menu</div>
                <p>Create and switch between documents, export your project (JSON, Markdown, PNG, .nexus bundle), import existing projects, save and load sessions, and clear the current project.</p>
              </div>
              <div className="help-card">
                <div className="help-card-icon"><Settings size={16} /></div>
                <div className="help-card-title">Edit menu</div>
                <p>Undo and redo changes. Access preferences to set your Gemini API key for AI features.</p>
              </div>
              <div className="help-card">
                <div className="help-card-icon"><LayoutGrid size={16} /></div>
                <div className="help-card-title">View menu</div>
                <p>Choose a layout style (Tree, Root-left, Two-sided, Star), fit the canvas to show all nodes, zoom in and out, and search for specific nodes by title or notes.</p>
              </div>
              <div className="help-card">
                <div className="help-card-icon"><Cpu size={16} /></div>
                <div className="help-card-title">Options menu</div>
                <p>Configure your AI provider: use Puter.ai (built-in) or connect a custom API key for Gemini or OpenAI models.</p>
              </div>
            </div>
          </section>

          <section>
            <h3>Working with nodes</h3>
            <ul>
              <li><strong>Select</strong> — Click a node to select it and open the inspector panel on the right</li>
              <li><strong>Multi-select</strong> — Hold <kbd>Shift</kbd> and drag to box-select multiple nodes</li>
              <li><strong>Drag</strong> — Click and drag any node to move it. Multi-drag moves all selected nodes together</li>
              <li><strong>Delete</strong> — Select a node and press <kbd>Delete</kbd> to remove it</li>
              <li><strong>Isolate</strong> — Hover a node and click the focus icon to isolate its branch</li>
              <li><strong>Collapse</strong> — Hover a node and click the collapse icon to hide its children</li>
              <li><strong>Checklists</strong> — Open a node in the inspector to add checklists with progress tracking</li>
            </ul>
          </section>

          <section>
            <h3>AI interaction</h3>
            <ul>
              <li><strong>Chat</strong> — Describe features, ask for changes, or request new branches in natural language</li>
              <li><strong>Expand</strong> — Hover a node and click the expand icon to have the AI generate sub-nodes</li>
              <li><strong>Elaborate</strong> — Open a node and click "Elaborate with AI" to enrich its description</li>
              <li><strong>Confirm</strong> — AI actions that modify the tree show a confirmation dialog before applying</li>
              <li><strong>Web research</strong> — The AI can perform live web searches when needed (indicated by @@SEARCH@@)</li>
            </ul>
          </section>

          <section>
            <h3>Shortcuts</h3>
            <div className="help-shortcuts-grid">
              <div><kbd>Ctrl+Z</kbd> <span>Undo</span></div>
              <div><kbd>Ctrl+Y</kbd> <span>Redo</span></div>
              <div><kbd>Ctrl+S</kbd> <span>Save project</span></div>
              <div><kbd>Ctrl+N</kbd> <span>New node / New project</span></div>
              <div><kbd>Ctrl+A</kbd> <span>Select all visible nodes</span></div>
              <div><kbd>Delete</kbd> <span>Remove selected nodes</span></div>
              <div><kbd>Escape</kbd> <span>Close panel / Deselect</span></div>
              <div><kbd>Shift</kbd>+drag <span>Box-select multiple nodes</span></div>
            </div>
          </section>

          <section>
            <h3>Export &amp; sharing</h3>
            <ul>
              <li><strong>JSON</strong> — Full project data (tree, nodes, positions, metadata)</li>
              <li><strong>Markdown</strong> — Hierarchical outline formatted as Markdown</li>
              <li><strong>PNG image</strong> — Canvas screenshot (renders at 2x resolution)</li>
              <li><strong>.nexus bundle</strong> — Complete project bundle including tree, chat history, and attachments</li>
              <li><strong>Import</strong> — Load a .json or .nexus file into the current workspace</li>
            </ul>
          </section>

          <section>
            <h3>Canvas navigation</h3>
            <ul>
              <li><strong>Pan</strong> — Click and drag on empty canvas space to pan the view</li>
              <li><strong>Zoom</strong> — Scroll to zoom in and out, or use View &gt; Zoom controls</li>
              <li><strong>Fit</strong> — Use View &gt; Fit to view to automatically frame all nodes</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
