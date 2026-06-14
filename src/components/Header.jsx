import { useCallback, useRef, useEffect } from 'react';
import { useNexus } from '../store/NexusContext';
import {
  recomputeLayout, stripForExport, normalizeTree
} from '../utils/tree';
import { LAYOUTS } from '../utils/constants';
import { sanitizeFilename, downloadFile } from '../utils/helpers';
import {
  Compass, Undo2, LayoutGrid, Maximize, ZoomOut, ZoomIn,
  Download, FileDown, Upload, Trash2, MessageSquare, Search, X
} from 'lucide-react';

export default function Header() {
  const {
    tree, history, canvas, setTree, setCanvas, pushHistory, persist,
    resetProject, addToast, resetArmed, setResetArmed,
    fitView, zoomIn, zoomOut, undo, layout, setLayout,
    searchQuery, setSearchQuery,
  } = useNexus();
  const resetTimer = useRef(null);
  const importRef = useRef(null);
  const searchRef = useRef(null);
  const has = !!tree;

  useEffect(() => {
    document.title = tree ? `${tree.title} — Nexus Architect` : 'Nexus Architect — AI Project Planning Canvas';
  }, [tree]);

  const handleArrange = useCallback(() => {
    if (!tree) return;
    pushHistory();
    recomputeLayout(tree, layout);
    setTree({ ...tree });
    persist();
    addToast('All tidied up');
    }, [tree, layout, pushHistory, setTree, persist, addToast]);

  const handleReset = useCallback(() => {
    if (!has) return;
    if (!resetArmed) {
      setResetArmed(true);
      addToast('Tap "Clear" once more to wipe the slate clean');
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setResetArmed(false), 4000);
    } else {
      clearTimeout(resetTimer.current);
      setResetArmed(false);
      resetProject();
      setCanvas({ scale: 1, x: document.getElementById('canvasWrap')?.clientWidth / 2 || 400, y: 70 });
    }
  }, [has, resetArmed, setResetArmed, addToast, resetProject, setCanvas]);

  const handleExportJSON = useCallback(() => {
    if (!tree) return;
    downloadFile(JSON.stringify(stripForExport(tree), null, 2), sanitizeFilename(tree.title) + '.json', 'application/json');
    addToast('Exported as JSON');
  }, [tree, addToast]);

  const handleExportMD = useCallback(() => {
    if (!tree) return;
    const lines = [];
    (function walk(node, depth) {
      if (depth <= 1) {
        lines.push('#'.repeat(depth + 1) + ' ' + node.title);
        if (node.description) lines.push('\n' + node.description);
      } else {
        const indent = '  '.repeat(depth - 2);
        lines.push(indent + '- **' + node.title + '**' + (node.description ? ' \u2014 ' + node.description : ''));
      }
      (node.children || []).forEach(c => walk(c, depth + 1));
    })(tree, 0);
    downloadFile(lines.join('\n') + '\n', sanitizeFilename(tree.title) + '.md', 'text/markdown');
    addToast('Exported as outline');
  }, [tree, addToast]);

  const handleImport = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data?.title) throw new Error('invalid');
        pushHistory();
        const t = normalizeTree(data, 0);
        setTree(t);
        recomputeLayout(t, layout);
        setTimeout(() => fitView(), 50);
        persist();
        addToast('Project imported');
      } catch {
        addToast('Hmm, couldn\u2019t read that file \u2014 it needs to be a Nexus Architect JSON export.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [layout, pushHistory, setTree, persist, addToast, fitView]);

  const handleSidebarToggle = useCallback(() => {
    if (window.innerWidth <= 1100) {
      document.body.classList.remove('sidebar-hidden');
      document.body.classList.toggle('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
      document.body.classList.toggle('sidebar-hidden');
    }
  }, []);

  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark"><Compass size={19} /></div>
        <div className="brand-text">
          <h1>NEXUS <span>ARCHITECT</span></h1>
          <p>Plan with purpose</p>
        </div>
      </div>
      <div className="header-actions">
        <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!history.length} onClick={undo}>
          <Undo2 size={17} />
        </button>
        <button className="icon-btn" title="Auto-arrange layout" disabled={!has} onClick={handleArrange}>
          <LayoutGrid size={17} />
        </button>
        <select
          className="layout-select"
          value={layout}
          onChange={(e) => setLayout(e.target.value)}
          disabled={!has}
          title="Layout style"
        >
          {LAYOUTS.map(l => (
            <option key={l.id} value={l.id} title={l.desc}>{l.label}</option>
          ))}
        </select>
        <button className="icon-btn" title="Fit to view" disabled={!has} onClick={fitView}>
          <Maximize size={17} />
        </button>
        <div className="zoom-group">
          <button className="icon-btn" title="Zoom out" onClick={zoomOut}>
            <ZoomOut size={17} />
          </button>
          <span id="zoomLevel">{Math.round(canvas.scale * 100)}%</span>
          <button className="icon-btn" title="Zoom in" onClick={zoomIn}>
            <ZoomIn size={17} />
          </button>
        </div>
        <div className={`search-wrap${searchQuery !== '' ? ' active' : ''}`}>
          <input
            ref={searchRef}
            className="search-input"
            type="text"
            placeholder="Search nodes\u2026"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearchQuery('')}
          />
          {searchQuery !== '' && (
            <button className="icon-btn search-clear" title="Clear search" onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}>
              <X size={15} />
            </button>
          )}
        </div>
        <button className={`icon-btn${searchQuery !== '' ? ' active' : ''}`} title="Search nodes" onClick={() => {
          const el = searchRef.current;
          if (el) {
            if (document.activeElement === el) { setSearchQuery(''); }
            else { el.focus(); el.select(); }
          }
        }}>
          <Search size={17} />
        </button>
        <div className="divider" />
        <div className="export-group">
          <button className="btn-ghost" title="Export project as JSON" disabled={!has} onClick={handleExportJSON}>
            <Download size={15} /><span className="btn-label">JSON</span>
          </button>
          <button className="btn-ghost" title="Export as Markdown outline" disabled={!has} onClick={handleExportMD}>
            <FileDown size={15} /><span className="btn-label">Outline</span>
          </button>
          <button className="btn-ghost" title="Import a project JSON file" onClick={() => importRef.current?.click()}>
            <Upload size={15} /><span className="btn-label">Import</span>
          </button>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={handleImport} />
        </div>
        <div className="divider" />
        <button className="btn-danger-ghost" title="Clear this project" disabled={!has} onClick={handleReset}>
          <Trash2 size={15} /><span className="btn-label">Clear</span>
        </button>
        <button className="icon-btn" title="Toggle AI Architect" onClick={handleSidebarToggle}>
          <MessageSquare size={17} />
        </button>
      </div>
    </header>
  );
}
