import { useState, useCallback } from 'react';
import { useNexus } from '../store/NexusContext';
import { useAI } from '../hooks/useAI';
import { findNode, ancestorPath } from '../utils/tree';
import { Sparkles, X } from 'lucide-react';

export default function DetailsDrawer() {
  const {
    tree, setTree, drawerNodeId, closeDrawer,
    pushHistory, persist, busy
  } = useNexus();
  const { elaborateNodeAI } = useAI();

  const node = drawerNodeId ? findNode(tree, drawerNodeId) : null;
  const path = node ? ancestorPath(tree, node).join(' \u203A ') : '\u2014';

  const [title, setTitle] = useState(node?.title || '');
  const [content, setContent] = useState(node?.description || '');

  const handleSave = useCallback(() => {
    const n = findNode(tree, drawerNodeId);
    if (!n || !drawerNodeId) return;
    pushHistory();
    n.title = title.trim() || n.title;
    n.description = content.trim();
    setTree({ ...tree });
    persist();
  }, [drawerNodeId, title, content, tree, setTree, pushHistory, persist]);

  const handleElaborate = useCallback(() => {
    if (!drawerNodeId) return;
    handleSave();
    elaborateNodeAI(drawerNodeId, (text) => {
      setContent(text);
      const n = findNode(tree, drawerNodeId);
      if (n) n.description = text;
    });
  }, [drawerNodeId, handleSave, elaborateNodeAI, tree]);

  return (
    <div className={`details-drawer${drawerNodeId ? ' open' : ''}`} id="detailsDrawer">
      <div className="drawer-header">
        <span className="drawer-path" id="drawerPath">{path}</span>
        <button className="icon-btn" id="closeDrawerBtn" title="Close" onClick={closeDrawer}>
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
        <button className="btn-ghost" id="elaborateBtn" type="button" disabled={busy} onClick={handleElaborate}>
          <Sparkles size={15} />Elaborate with AI
        </button>
        <button className="btn-primary" id="saveDetailsBtn" type="button" onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  );
}
