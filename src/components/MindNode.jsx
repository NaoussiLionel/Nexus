import { useCallback } from 'react';
import { useNexus } from '../store/NexusContext';
import { useAI } from '../hooks/useAI';
import { hashAngle, truncate } from '../utils/helpers';
import {
  makeNode, findNode, removeNodeFromTree,
  recomputeLayout, placeNewChildren, countDescendants
} from '../utils/tree';
import {
  Sparkles, FileText, Plus, Crosshair, Minimize2, Trash2,
  ChevronDown, ChevronRight
} from 'lucide-react';

export default function MindNode({ node }) {
  const {
    tree, setTree, isolatedId, setIsolatedId, selectedId, setSelectedId,
    recentlyAddedIds, pushHistory, openDrawer, persist, addToast, fitView, undo,
  } = useNexus();
  const { expandNodeAI } = useAI();

  const hasChildren = node.children?.length > 0;
  const depthClass = node.depth === 0 ? 'depth-0' : node.depth === 1 ? 'depth-1' : 'leaf';
  const angle = node.depth >= 2 ? hashAngle(node.id) : 0;
  const codeLabel = node.depth === 0 ? 'CORE' : ('NO. ' + (node.code || ''));
  const kindLabel = node.depth === 0 ? 'PROJECT' : node.depth === 1 ? 'BRANCH' : 'ITEM';
  const descMax = node.depth === 0 ? 170 : 110;

  const classes = ['mind-node', depthClass];
  if (recentlyAddedIds.has(node.id)) classes.push('is-new');
  if (node.expanding) classes.push('is-busy');
  if (selectedId === node.id) classes.push('selected');

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
    pushHistory();
    const t = JSON.parse(JSON.stringify(tree));
    const n = findNode(t, node.id);
    if (!n) return;
    const child = makeNode('New item', '', n.depth + 1);
    n.children = n.children || [];
    n.children.push(child);
    n.collapsed = false;
    placeNewChildren(n);
    setTree(t);
    persist();
    openDrawer(child.id);
    setTimeout(() => {
      const el = document.getElementById('detailsTitle');
      el?.focus();
      el?.select();
    }, 100);
  }, [node.id, tree, setTree, pushHistory, persist, openDrawer]);

  const handleToggleCollapse = useCallback((e) => {
    e.stopPropagation();
    if (!hasChildren) return;
    const t = JSON.parse(JSON.stringify(tree));
    const n = findNode(t, node.id);
    if (!n) return;
    n.collapsed = !n.collapsed;
    recomputeLayout(t);
    setTree(t);
    persist();
  }, [node.id, hasChildren, tree, setTree, persist]);

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
    addToast(`Deleted "${node.title}"`, null, { label: 'Undo', onClick: () => undo() });
  }, [node.id, node.title, tree, setTree, pushHistory, persist, addToast, undo]);

  return (
    <div className={classes.join(' ')} data-id={node.id} style={style} onClick={() => { setSelectedId(node.id); openDrawer(node.id); }}>
      <div className="node-actions">
        <button className="action-btn" title="Expand with AI" onClick={handleExpand}>
          <Sparkles size={14} />
        </button>
        <button className="action-btn" title="Elaborate with AI" onClick={(e) => { e.stopPropagation(); openDrawer(node.id); }}>
          <FileText size={14} />
        </button>
        <button className="action-btn" title="Add item" onClick={handleAddChild}>
          <Plus size={14} />
        </button>
        {node.depth > 0 && (
          <>
            <button className="action-btn" title={isolatedId === node.id ? 'Show full map' : 'Focus on this branch'} onClick={handleIsolate}>
              {isolatedId === node.id ? <Minimize2 size={14} /> : <Crosshair size={14} />}
            </button>
            <button className="action-btn danger" title="Delete" onClick={handleDelete}>
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
        <p className="node-desc">{truncate(node.description, descMax)}</p>
      )}
      {hasChildren && (
        <button className="collapse-toggle" title={node.collapsed ? 'Expand branch' : 'Collapse branch'} onClick={handleToggleCollapse}>
          {node.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          {node.collapsed && <span className="collapse-count">{countDescendants(node)}</span>}
        </button>
      )}
    </div>
  );
}
