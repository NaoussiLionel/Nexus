import { useCallback, useState } from 'react';
import { useNexus } from '../store/NexusContext';
import { useAI } from '../hooks/useAI';
import {
  makeNode, findNode, removeNodeFromTree,
  recomputeLayout, countDescendants
} from '../utils/tree';
import { hashAngle, truncate, renderInline, generateId } from '../utils/helpers';
import {
  Sparkles, LoaderCircle, FileText, Plus, Crosshair, Minimize2, Trash2,
  ChevronDown, ChevronRight, CheckSquare
} from 'lucide-react';

export default function MindNode({ node }) {
  const {
    tree, setTree, isolatedId, setIsolatedId, selectedId, setSelectedId,
    selectedIds,
    recentlyAddedIds, pushHistory, openDrawer, persist, addToast, fitView, undo, layout,
    searchQuery,
  } = useNexus();
  const { expandNodeAI } = useAI();
  const [showChecklist, setShowChecklist] = useState(false);
  const [clInput, setClInput] = useState('');

  const hasChildren = node.children?.length > 0;
  const depthClass = node.depth === 0 ? 'depth-0' : node.depth === 1 ? 'depth-1' : 'leaf';
  const checklist = node.checklist || [];
  const checkedCount = checklist.filter(c => c.checked).length;
  const hasChecklist = checklist.length > 0;
  const angle = node.depth >= 2 ? hashAngle(node.id) : 0;
  const codeLabel = node.depth === 0 ? 'CORE' : ('NO. ' + (node.code || ''));
  const kindLabel = node.depth === 0 ? 'PROJECT' : node.depth === 1 ? 'BRANCH' : 'ITEM';
  const descMax = node.depth === 0 ? 170 : 110;

  const q = searchQuery.toLowerCase().trim();
  const isMatch = q && (
    node.title.toLowerCase().includes(q) ||
    (node.description && node.description.toLowerCase().includes(q))
  );
  const classes = ['mind-node', depthClass];
  if (isMatch) classes.push('matched');
  if (recentlyAddedIds.has(node.id)) classes.push('is-new');
  if (node.expanding) classes.push('is-busy');
  if (selectedId === node.id || selectedIds.has(node.id)) classes.push('selected');

  const style = {
    left: node.x + 'px',
    top: node.y + 'px',
    ...(angle ? { transform: `translate(-50%,0) rotate(${angle}deg)` } : {})
  };

  const handleExpand = useCallback((e) => {
    e.stopPropagation();
    expandNodeAI(node.id);
  }, [node.id, expandNodeAI]);

  const handleAddChild = useCallback((e) => {
    e.stopPropagation();
    if (node.depth >= 2) {
      setIsolatedId(node.id);
      setTimeout(fitView, 50);
    }
    pushHistory();
    const t = JSON.parse(JSON.stringify(tree));
    const n = findNode(t, node.id);
    if (!n) return;
    const child = makeNode('New item', '', n.depth + 1);
    n.children = n.children || [];
    n.children.push(child);
    n.collapsed = false;
    recomputeLayout(t, layout);
    setTree(t);
    persist();
    openDrawer(child.id);
    setTimeout(() => {
      const el = document.getElementById('detailsTitle');
      el?.focus();
      el?.select();
    }, 100);
  }, [node.id, node.depth, tree, setTree, pushHistory, persist, openDrawer, layout, setIsolatedId, fitView]);

  const handleToggleCollapse = useCallback((e) => {
    e.stopPropagation();
    if (!hasChildren) return;
    const t = JSON.parse(JSON.stringify(tree));
    const n = findNode(t, node.id);
    if (!n) return;
    n.collapsed = !n.collapsed;
    recomputeLayout(t, layout);
    setTree(t);
    persist();
  }, [node.id, hasChildren, tree, setTree, persist, layout]);

  const handleIsolate = useCallback((e) => {
    e.stopPropagation();
    const newId = isolatedId === node.id ? null : node.id;
    setIsolatedId(newId);
    setTimeout(fitView, 50);
  }, [node.id, isolatedId, setIsolatedId, fitView]);

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    if (node.id === tree?.id) return;
    pushHistory();
    const t = JSON.parse(JSON.stringify(tree));
    removeNodeFromTree(t, node.id);
    setTree(t);
    persist();
    addToast('Removed "' + node.title + '"', null, { label: 'Undo', onClick: () => undo() });
  }, [node.id, node.title, tree, setTree, pushHistory, persist, addToast, undo]);

  const handleClToggle = useCallback((e) => {
    e.stopPropagation();
    setShowChecklist(prev => !prev);
    setClInput('');
  }, []);

  const handleClAdd = useCallback((e) => {
    e.stopPropagation();
    const text = clInput.trim();
    if (!text) return;
    const t = JSON.parse(JSON.stringify(tree));
    const n = findNode(t, node.id);
    if (!n) return;
    n.checklist = n.checklist || [];
    n.checklist.push({ id: generateId('cl'), text, checked: false });
    setTree(t);
    persist();
    setClInput('');
    setShowChecklist(false);
  }, [clInput, tree, node.id, setTree, persist]);

  const handleClKey = useCallback((e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleClAdd(e); }
    if (e.key === 'Escape') { e.stopPropagation(); setShowChecklist(false); setClInput(''); }
  }, [handleClAdd]);

  return (
    <div className={classes.join(' ')} data-id={node.id} style={style} onClick={() => { setSelectedId(node.id); openDrawer(node.id); }}>
      <div className="node-actions" role="toolbar" aria-label="Node actions">
        <button className={`action-btn${node.expanding ? ' btn-loading' : ''}`} aria-label="Expand with AI" onClick={handleExpand}>
          {node.expanding ? <LoaderCircle size={14} className="spinner" /> : <Sparkles size={14} />}
        </button>
        <button className="action-btn" aria-label="Elaborate with AI" onClick={(e) => { e.stopPropagation(); openDrawer(node.id); }}>
          <FileText size={14} />
        </button>
        <button className="action-btn" aria-label="Add item" title="Add child node" onClick={handleAddChild}>
          <Plus size={14} />
        </button>
        <button className={`action-btn${showChecklist ? ' active' : ''}`} aria-label="Toggle checklist" title="Checklist" onClick={handleClToggle}>
          <CheckSquare size={14} />
        </button>
        {node.depth > 0 && (
          <>
            <button className="action-btn" aria-label={isolatedId === node.id ? 'Show full map' : 'Focus on this branch'} title={isolatedId === node.id ? 'Show full map' : 'Focus on this branch'} onClick={handleIsolate}>
              {isolatedId === node.id ? <Minimize2 size={14} /> : <Crosshair size={14} />}
            </button>
            <button className="action-btn danger" aria-label="Delete node" title="Delete node" onClick={handleDelete}>
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
      <div className="node-head">
        <span className="node-code">{codeLabel}</span>
        <span className="node-kind">{kindLabel}</span>
      </div>
      <div className="node-title">{node.title}</div>
      {node.description && (
        <p className="node-desc" dangerouslySetInnerHTML={{ __html: renderInline(truncate(node.description, descMax)) }} />
      )}
      <div className={`node-checklist${hasChecklist ? ' has-items' : ''}`}>
        <span className="node-checklist-icon">{'\u2611'}</span>
        <span className="node-checklist-text">{hasChecklist ? `${checkedCount}/${checklist.length}` : 'Add items'}</span>
      </div>
      {showChecklist && (
        <div className="node-checklist-editor" onClick={e => e.stopPropagation()}>
          <div className="ncle-inline">
            <input className="ncle-input" type="text" placeholder="Add checklist item\u2026"
              value={clInput} onChange={e => setClInput(e.target.value)}
              onKeyDown={handleClKey} autoFocus />
            <button className="ncle-btn" onClick={handleClAdd} aria-label="Add checklist item">+</button>
          </div>
          {hasChecklist && (
            <div className="ncle-items">
              {checklist.map(item => (
                <label key={item.id} className="ncle-item" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={item.checked} onChange={() => {
                    const t = JSON.parse(JSON.stringify(tree));
                    const n = findNode(t, node.id);
                    if (!n) return;
                    const ci = n.checklist?.find(c => c.id === item.id);
                    if (ci) ci.checked = !ci.checked;
                    setTree(t);
                    persist();
                  }} />
                  <span className={item.checked ? 'done' : ''}>{item.text}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      {hasChildren && (
        <button className="collapse-toggle" aria-label={node.collapsed ? 'Expand branch' : 'Collapse branch'} onClick={handleToggleCollapse}>
          {node.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          {node.collapsed && <span className="collapse-count">{countDescendants(node)}</span>}
        </button>
      )}
    </div>
  );
}
