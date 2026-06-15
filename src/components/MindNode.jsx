import { useCallback } from 'react';
import { useNexus } from '../store/NexusContext';
import { useAI } from '../hooks/useAI';
import { hashAngle, truncate, renderInline } from '../utils/helpers';
import {
  makeNode, findNode, removeNodeFromTree,
  recomputeLayout, countDescendants
} from '../utils/tree';
import {
  Sparkles, LoaderCircle, FileText, Plus, Crosshair, Minimize2, Trash2,
  ChevronDown, ChevronRight
} from 'lucide-react';

export default function MindNode({ node }) {
  const {
    tree, setTree, isolatedId, setIsolatedId, selectedId, setSelectedId,
    selectedIds,
    recentlyAddedIds, pushHistory, openDrawer, persist, addToast, fitView, undo, layout,
    searchQuery,
  } = useNexus();
  const { expandNodeAI } = useAI();

  const hasChildren = node.children?.length > 0;
  const depthClass = node.depth === 0 ? 'depth-0' : node.depth === 1 ? 'depth-1' : 'leaf';
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

  return (
    <div className={classes.join(' ')} data-id={node.id} style={style} onClick={() => { setSelectedId(node.id); openDrawer(node.id); }}>
      <div className="node-actions" role="toolbar" aria-label="Node actions">
        <button className={`action-btn${node.expanding ? ' btn-loading' : ''}`} aria-label="Expand with AI" onClick={handleExpand}>
          {node.expanding ? <LoaderCircle size={14} className="spinner" /> : <Sparkles size={14} />}
        </button>
        <button className="action-btn" aria-label="Elaborate with AI" onClick={(e) => { e.stopPropagation(); openDrawer(node.id); }}>
          <FileText size={14} />
        </button>
        <button className="action-btn" aria-label="Add item" onClick={handleAddChild}>
          <Plus size={14} />
        </button>
        {node.depth > 0 && (
          <>
            <button className="action-btn" aria-label={isolatedId === node.id ? 'Show full map' : 'Focus on this branch'} onClick={handleIsolate}>
              {isolatedId === node.id ? <Minimize2 size={14} /> : <Crosshair size={14} />}
            </button>
            <button className="action-btn danger" aria-label="Delete node" onClick={handleDelete}>
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
      {node.depth > 0 && (
        <div className="sr-only" style={{position:'absolute',width:'1px',height:'1px',padding:0,margin:'-1px',overflow:'hidden',clip:'rect(0,0,0,0)',whiteSpace:'nowrap',border:0}}>
          Node actions: expand with AI, add item, focus branch, delete
        </div>
      )}
      <div className="node-head">
        <span className="node-code">{codeLabel}</span>
        <span className="node-kind">{kindLabel}</span>
      </div>
      <div className="node-title">{node.title}</div>
      {node.description && (
        <p className="node-desc" dangerouslySetInnerHTML={{ __html: renderInline(truncate(node.description, descMax)) }} />
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
