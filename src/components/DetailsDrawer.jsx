import { useState, useCallback, useEffect } from 'react';
import { useNexus } from '../store/NexusContext';
import { useAI } from '../hooks/useAI';
import { findNode, ancestorPath } from '../utils/tree';
import { Sparkles, LoaderCircle, X } from 'lucide-react';

function DrawerForm({ node, tree, onSave, onElaborate, busy }) {
  const [title, setTitle] = useState(() => node?.title ?? '');
  const [content, setContent] = useState(() => node?.description ?? '');

  const handleSave = useCallback(() => {
    onSave(title.trim() || node.title, content.trim());
  }, [title, content, node, onSave]);

  const path = node ? ancestorPath(tree, node).join(' \u203A ') : '\u2014';

  return (
    <div className="drawer-inner">
      <div className="drawer-header">
        <span className="drawer-path" id="drawerPath">{path}</span>
        <button className="icon-btn" id="closeDrawerBtn" aria-label="Close drawer" onClick={() => onSave(null, null)}>
          <X size={17} />
        </button>
      </div>
      <div className="drawer-body">
        <div>
          <label htmlFor="detailsTitle">Title</label>
          <input
            type="text"
            id="detailsTitle"
            className="drawer-title-input"
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
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
      </div>
      <div className="drawer-footer">
        <button className={`btn-ghost${busy ? ' btn-loading' : ''}`} id="elaborateBtn" type="button" aria-label="Elaborate with AI" disabled={busy} onClick={onElaborate}>
          {busy ? <LoaderCircle size={15} className="spinner" /> : <Sparkles size={15} />}Elaborate with AI
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
    pushHistory, persist, busy
  } = useNexus();
  const { elaborateNodeAI } = useAI();

  const node = drawerNodeId ? findNode(tree, drawerNodeId) : null;

  useEffect(() => {
    if (drawerNodeId) {
      const el = document.getElementById('detailsTitle');
      if (el) setTimeout(() => el.focus(), 150);
    }
  }, [drawerNodeId]);

  const handleSave = useCallback((title, description) => {
    if (!drawerNodeId && title === null) { closeDrawer(); return; }
    const n = findNode(tree, drawerNodeId);
    if (!n || !drawerNodeId) return;
    pushHistory();
    if (title !== null && title !== undefined) n.title = title;
    if (description !== null && description !== undefined) n.description = description;
    setTree({ ...tree });
    persist();
  }, [drawerNodeId, tree, setTree, pushHistory, persist, closeDrawer]);

  const handleElaborate = useCallback(() => {
    if (!drawerNodeId) return;
    handleSave(null, null);
    elaborateNodeAI(drawerNodeId, (text) => {
      const n = findNode(tree, drawerNodeId);
      if (n) { n.description = text; setTree({ ...tree }); }
    });
  }, [drawerNodeId, handleSave, elaborateNodeAI, tree, setTree]);

  return (
    <div className={`details-drawer${drawerNodeId ? ' open' : ''}`} id="detailsDrawer">
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
