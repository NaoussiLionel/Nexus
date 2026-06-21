import { useState, useCallback, useEffect, useRef } from 'react';
import { useNexus } from '../store/NexusContext';
import { useAI } from '../hooks/useAI';
import { findNode, ancestorPath } from '../utils/tree';
import { generateId } from '../utils/helpers';
import { Sparkles, LoaderCircle, X, Plus, CheckSquare } from 'lucide-react';

function DrawerForm({ node, tree, onSave, onElaborate, busy }) {
  const [title, setTitle] = useState(() => node?.title ?? '');
  const [content, setContent] = useState(() => node?.description ?? '');
  const [checklist, setChecklist] = useState(() => (node?.checklist || []).map(c => ({ ...c })));
  const [newItem, setNewItem] = useState('');
  const listRef = useRef(null);

  const handleSave = useCallback(() => {
    onSave(title.trim() || node.title, content.trim(), checklist);
  }, [title, content, node, onSave, checklist]);

  const handleCheckToggle = useCallback((itemId) => {
    setChecklist(prev => prev.map(c => c.id === itemId ? { ...c, checked: !c.checked } : c));
  }, []);

  const handleAddItem = useCallback(() => {
    const text = newItem.trim();
    if (!text) return;
    setChecklist(prev => [...prev, { id: generateId('cl'), text, checked: false }]);
    setNewItem('');
  }, [newItem]);

  const handleRemoveItem = useCallback((itemId) => {
    setChecklist(prev => prev.filter(c => c.id !== itemId));
  }, []);

  const handleItemKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddItem(); }
  }, [handleAddItem]);

  const progress = checklist.length ? Math.round(checklist.filter(c => c.checked).length / checklist.length * 100) : null;

  const path = node ? ancestorPath(tree, node).join(' \u203A ') : '\u2014';

  return (
    <div className="drawer-inner">
      <div className="drawer-header">
        <span className="drawer-path" id="drawerPath">{path}</span>
        <button className="icon-btn" id="closeDrawerBtn" aria-label="Close drawer" onClick={() => onSave(null, null, null)}>
          <X size={17} />
        </button>
      </div>
      <div className="drawer-body">
        <div>
          <label htmlFor="detailsTitle">Title</label>
          <div className="drawer-title-wrap">
            <input
              type="text"
              id="detailsTitle"
              className="drawer-title-input"
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <span className="char-counter">{title.length}/80</span>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <label htmlFor="detailsContent">Notes</label>
          <textarea
            id="detailsContent"
            placeholder="Notes, ideas, or questions about this node\u2026"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
        <div className="drawer-checklist">
          <div className="checklist-header">
            <CheckSquare size={13} />
            <span>Checklist</span>
            {progress != null && <span className="checklist-progress">{checklist.filter(c => c.checked).length}/{checklist.length}</span>}
          </div>
          {progress != null && (
            <div className="checklist-bar-wrap">
              <div className="checklist-bar" style={{ width: progress + '%' }} />
            </div>
          )}
          <div className="checklist-items" ref={listRef}>
            {checklist.length === 0 && <div className="checklist-empty">No items yet</div>}
            {checklist.map(item => (
              <div key={item.id} className="checklist-item">
                <input type="checkbox" className="checklist-cb" checked={item.checked} onChange={() => handleCheckToggle(item.id)} />
                <span className={`checklist-text${item.checked ? ' done' : ''}`}>{item.text}</span>
                <button className="checklist-del" aria-label="Remove item" onClick={() => handleRemoveItem(item.id)}>
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
          <div className="checklist-add">
            <input
              type="text" className="checklist-input" placeholder="Add an item\u2026"
              value={newItem} onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={handleItemKeyDown}
            />
            <button className="checklist-add-btn" aria-label="Add checklist item" onClick={handleAddItem}>
              <Plus size={13} />
            </button>
          </div>
        </div>
      </div>
      <div className="drawer-footer">
        <button className={`btn-ghost${busy ? ' btn-loading' : ''}`} id="elaborateBtn" type="button" aria-label="Add detail with AI" disabled={busy} onClick={onElaborate}>
          {busy ? <LoaderCircle size={15} className="spinner" /> : <Sparkles size={15} />}Add detail with AI
        </button>
        <button className="btn-primary" id="saveDetailsBtn" type="button" aria-label="Save changes" onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  );
}

export default function DetailsDrawer() {
  const {
    tree, setTree, drawerNodeId, closeDrawer,
    pushHistory, persist, busy, drawerWidth, setDrawerWidth
  } = useNexus();
  const { elaborateNodeAI } = useAI();
  const treeRef = useRef(tree);
  useEffect(() => { treeRef.current = tree; });

  const node = drawerNodeId ? findNode(tree, drawerNodeId) : null;

  useEffect(() => {
    if (drawerNodeId) {
      const el = document.getElementById('detailsTitle');
      if (el) {
        const t = setTimeout(() => el.focus(), 150);
        return () => clearTimeout(t);
      }
    }
  }, [drawerNodeId]);

  const handleSave = useCallback((title, description, checklist) => {
    if (!drawerNodeId && title === null) { closeDrawer(); return; }
    const n = findNode(tree, drawerNodeId);
    if (!n || !drawerNodeId) return;
    pushHistory();
    if (title !== null && title !== undefined) n.title = title;
    if (description !== null && description !== undefined) n.description = description;
    if (Array.isArray(checklist)) n.checklist = checklist;
    setTree({ ...tree });
    persist();
  }, [drawerNodeId, tree, setTree, pushHistory, persist, closeDrawer]);

  const handleElaborate = useCallback(() => {
    if (!drawerNodeId) return;
    handleSave(null, null);
    elaborateNodeAI(drawerNodeId, (text) => {
      const current = treeRef.current;
      const n = findNode(current, drawerNodeId);
      if (n) { n.description = text; setTree({ ...current }); }
    });
  }, [drawerNodeId, handleSave, elaborateNodeAI, setTree]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = drawerWidth;
    const onMove = (ev) => {
      const newW = Math.max(260, Math.min(500, startW + (ev.clientX - startX)));
      setDrawerWidth(newW);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [drawerWidth, setDrawerWidth]);

  return (
    <div className={`details-drawer${drawerNodeId ? ' open' : ''}`} id="detailsDrawer" style={{ width: drawerWidth + 'px' }}>
      <div className="drawer-resize-handle" onPointerDown={handleResizeStart} />
      {node && (
        <DrawerForm
          key={drawerNodeId}
          node={node}
          tree={tree}
          onSave={handleSave}
          onElaborate={handleElaborate}
          busy={busy}
        />
      )}
    </div>
  );
}
