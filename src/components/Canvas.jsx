import { useCallback, useRef, useEffect, useMemo } from 'react';
import { useNexus } from '../store/NexusContext';
import { useCanvas } from '../hooks/useCanvas';
import {
  getVisibleIds, recomputeLayout, assignCodes,
  countDescendants, maxDepth, makeNode, findNode
} from '../utils/tree';
import { Compass } from 'lucide-react';
import Connectors from './Connectors';
import MindNode from './MindNode';

export default function Canvas() {
  const {
    tree, setTree, isolatedId, setIsolatedId, setSelectedId,
    pushHistory, persist,
    canvas, openDrawer, lastSaved, fitView, setScale,
  } = useNexus();
  const { wrapRef, onPointerDown: canvasPointerDown, onPointerMove: canvasPointerMove,
          onPointerUp: canvasPointerUp } = useCanvas();
  const dragCtx = useRef(null);

  const visibleIds = useMemo(() =>
    tree ? getVisibleIds(tree, isolatedId) : new Set(),
  [tree, isolatedId]);

  const visibleNodes = useMemo(() => {
    if (!tree) return [];
    assignCodes(tree, '');
    const result = [];
    visibleIds.forEach(id => {
      const n = findNode(tree, id);
      if (n) result.push(n);
    });
    return result;
  }, [tree, visibleIds]);

  useEffect(() => {
    const space = document.getElementById('zoomSpace');
    if (!space) return;
    space.style.transform = `translate(${canvas.x}px, ${canvas.y}px) scale(${canvas.scale})`;
    const zoomEl = document.getElementById('zoomLevel');
    const scaleEl = document.getElementById('scaleLabel');
    if (zoomEl) zoomEl.textContent = `${Math.round(canvas.scale * 100)}%`;
    if (scaleEl) scaleEl.textContent = `SCALE 1:${Math.max(1, Math.round(100 / canvas.scale))}`;
  }, [canvas]);

  const handlePointerDown = useCallback((e) => {
    const nodeEl = e.target.closest('.mind-node');
    if (nodeEl) {
      if (e.target.closest('.action-btn, .collapse-toggle')) return;
      const id = nodeEl.dataset.id;
      if (!id) return;
      const node = findNode(tree, id);
      if (!node) return;
      dragCtx.current = {
        id, startX: e.clientX, startY: e.clientY,
        origX: node.x, origY: node.y, moved: false
      };
      e.stopPropagation();
      return;
    }
    canvasPointerDown(e);
  }, [tree, canvasPointerDown]);

  const handlePointerMove = useCallback((e) => {
    if (dragCtx.current) {
      const dx = (e.clientX - dragCtx.current.startX) / canvas.scale;
      const dy = (e.clientY - dragCtx.current.startY) / canvas.scale;
      if (!dragCtx.current.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        dragCtx.current.moved = true;
        if (tree) pushHistory();
      }
      if (dragCtx.current.moved) {
        const node = findNode(tree, dragCtx.current.id);
        if (!node) return;
        node.x = dragCtx.current.origX + dx;
        node.y = dragCtx.current.origY + dy;
        setTree({ ...tree });
      }
      return;
    }
    canvasPointerMove(e);
  }, [tree, canvas.scale, canvasPointerMove, pushHistory, setTree]);

  const handlePointerUp = useCallback((e) => {
    if (dragCtx.current) {
      if (!dragCtx.current.moved) {
        const node = findNode(tree, dragCtx.current.id);
        if (node) { setSelectedId(node.id); openDrawer(node.id); }
      } else {
        persist();
      }
      dragCtx.current = null;
      return;
    }
    canvasPointerUp(e);
  }, [tree, canvasPointerUp, persist, setSelectedId, openDrawer]);

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setScale(canvas.scale * factor, e.clientX, e.clientY);
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [canvas.scale, setScale, wrapRef]);

  const handleStartEmpty = useCallback(() => {
    const t = makeNode('New project', 'Describe this project, or ask the AI Architect to fill it in.', 0);
    setTree(t);
    recomputeLayout(t);
    setTimeout(() => { fitView(); openDrawer(t.id); }, 50);
  }, [setTree, fitView, openDrawer]);

  const nodeCount = tree ? 1 + countDescendants(tree) : 0;
  const depth = tree ? maxDepth(tree) : 0;

  return (
    <div className="canvas-wrap" id="canvasWrap" ref={wrapRef} onPointerDown={handlePointerDown}>
      <div className="canvas-grid" />

      <div className="isolate-bar" id="isolateBar" hidden={!isolatedId}>
        <Compass size={14} style={{ color: 'var(--brass)' }} />
        <span>Focused on <strong>{findNode(tree, isolatedId)?.title || ''}</strong></span>
        <button type="button" onClick={() => { setIsolatedId(null); setTimeout(fitView, 50); }}>
          Show full map
        </button>
      </div>

      <div className="zoom-space" id="zoomSpace">
        <svg className="connector-layer" id="connectorLayer">
          <Connectors />
        </svg>
        <div className="nodes-layer" id="nodesLayer">
          {visibleNodes.map(n => (
            <MindNode key={n.id} node={n} />
          ))}
        </div>
      </div>

      <div className={`empty-state${tree ? ' hidden' : ''}`} id="emptyState">
        <div className="empty-icon"><Compass size={30} /></div>
        <h2>Blank sheet</h2>
        <p>Describe your project to the AI Architect on the right, and it will draft the first plan — or start with an empty sheet and build it your way.</p>
        <button className="btn-primary" type="button" onClick={handleStartEmpty}>
          Start an empty project
        </button>
      </div>

      <div className="scale-indicator">
        <div className="scale-ticks" />
        <span id="scaleLabel">SCALE 1:{Math.max(1, Math.round(100 / canvas.scale))}</span>
      </div>

      <div className="title-block" id="titleBlock" title="Fit to view" onClick={fitView}>
        <div className="tb-name" id="tbName">{tree?.title || 'No project yet'}</div>
        <div className="tb-meta">
          <div><span>NODES</span><strong>{nodeCount}</strong></div>
          <div><span>DEPTH</span><strong>{depth}</strong></div>
          <div><span>SAVED</span><strong>{lastSaved ? new Date(lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '\u2014'}</strong></div>
        </div>
      </div>
    </div>
  );
}
