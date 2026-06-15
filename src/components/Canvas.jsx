import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { useNexus } from '../store/NexusContext';
import { useCanvas } from '../hooks/useCanvas';
import {
  getVisibleIds, recomputeLayout, assignCodes,
  countDescendants, maxDepth, makeNode, findNode,
  removeNodeFromTree
} from '../utils/tree';
import { nodeWidth, nodeHeight } from '../utils/helpers';
import { Compass, Trash2 } from 'lucide-react';
import Connectors from './Connectors';
import MindNode from './MindNode';

export default function Canvas() {
  const {
    tree, setTree, isolatedId, setIsolatedId, setSelectedId,
    selectedIds, setSelectedIds,
    pushHistory, persist, addToast, undo,
    canvas, openDrawer, closeDrawer, lastSaved, fitView, setScale, layout,
    searchQuery, setSearchQuery, drawerNodeId, selectedId,
  } = useNexus();
  const { wrapRef, onPointerDown: canvasPointerDown, onPointerMove: canvasPointerMove,
          onPointerUp: canvasPointerUp } = useCanvas();
  const dragCtx = useRef(null);
  const marqueeRef = useRef(null);
  const [marqueeBox, setMarqueeBox] = useState(null);
  const treeRef = useRef(tree);
  const scaleRef = useRef(canvas.scale);

  useEffect(() => { treeRef.current = tree; });
  useEffect(() => { scaleRef.current = canvas.scale; });

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

  const matchedIds = useMemo(() => {
    if (!searchQuery) return null;
    const q = searchQuery.toLowerCase();
    const s = new Set();
    visibleNodes.forEach(n => {
      if (n.title.toLowerCase().includes(q) || (n.description && n.description.toLowerCase().includes(q)))
        s.add(n.id);
    });
    return s;
  }, [searchQuery, visibleNodes]);

  const noSearchResults = searchQuery && matchedIds && matchedIds.size === 0;

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
      const node = findNode(treeRef.current, id);
      if (!node) return;
      if (e.shiftKey) {
        setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id); else next.add(id);
          return next;
        });
        setSelectedId(id);
        e.stopPropagation();
        return;
      }
      if (!selectedIds.has(id) || selectedIds.size <= 1) {
        setSelectedIds(new Set([id]));
      }
      setSelectedId(id);
      const multi = selectedIds.size > 1 && selectedIds.has(id) ? selectedIds : new Set([id]);
      const origPositions = {};
      const t = treeRef.current;
      multi.forEach(mid => {
        const mn = findNode(t, mid);
        if (mn) origPositions[mid] = { x: mn.x, y: mn.y };
      });
      dragCtx.current = {
        id, startX: e.clientX, startY: e.clientY,
        origX: node.x, origY: node.y, moved: false,
        origPositions
      };
      e.stopPropagation();
      return;
    }
    if (e.shiftKey) {
      const rect = e.currentTarget.getBoundingClientRect();
      marqueeRef.current = {
        startX: e.clientX, startY: e.clientY,
        curX: e.clientX, curY: e.clientY,
        rect
      };
      setMarqueeBox({ startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY });
      e.stopPropagation();
      return;
    }
    setSelectedIds(new Set());
    canvasPointerDown(e);
  }, [canvasPointerDown, setSelectedId, selectedIds, setSelectedIds]);

  const handlePointerMove = useCallback((e) => {
    const cur = dragCtx.current;
    if (cur) {
      const s = scaleRef.current;
      const dx = (e.clientX - cur.startX) / s;
      const dy = (e.clientY - cur.startY) / s;
      if (!cur.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        cur.moved = true;
        if (treeRef.current) pushHistory();
      }
      if (cur.moved) {
        const t = treeRef.current;
        cur.origPositions = cur.origPositions || { [cur.id]: { x: cur.origX, y: cur.origY } };
        const toMove = cur.origPositions;
        Object.keys(toMove).forEach(id => {
          const n = findNode(t, id);
          if (!n) return;
          n.x = toMove[id].x + dx;
          n.y = toMove[id].y + dy;
        });
        setTree({ ...t });
      }
      return;
    }
    const mq = marqueeRef.current;
    if (mq) {
      mq.curX = e.clientX;
      mq.curY = e.clientY;
      setMarqueeBox({ startX: mq.startX, startY: mq.startY, curX: e.clientX, curY: e.clientY });
      e.stopPropagation();
      return;
    }
    canvasPointerMove(e);
  }, [canvasPointerMove, pushHistory, setTree]);

  const handlePointerUp = useCallback((e) => {
    if (dragCtx.current) {
      if (!dragCtx.current.moved) {
        const node = findNode(treeRef.current, dragCtx.current.id);
        if (node) { setSelectedId(node.id); openDrawer(node.id); }
      } else {
        persist();
      }
      dragCtx.current = null;
      return;
    }
    const mq = marqueeRef.current;
    if (mq) {
      marqueeRef.current = null;
      setMarqueeBox(null);
      const moved = Math.abs(mq.curX - mq.startX) > 5 || Math.abs(mq.curY - mq.startY) > 5;
      if (moved) {
        const t = treeRef.current;
        if (!t) { canvasPointerUp(e); return; }
        const s = scaleRef.current;
        const left = Math.min(mq.startX, mq.curX);
        const right = Math.max(mq.startX, mq.curX);
        const top = Math.min(mq.startY, mq.curY);
        const bottom = Math.max(mq.startY, mq.curY);
        const ids = new Set();
        const r = mq.rect;
        visibleIds.forEach(id => {
          const n = findNode(t, id);
          if (!n) return;
          const sx = n.x * s + canvas.x;
          const sy = n.y * s + r.top;
          const hw = nodeWidth(n.depth) * s / 2;
          const nh = nodeHeight(n.depth) * s;
          if (sx + hw >= left && sx - hw <= right && sy + nh >= top && sy <= bottom) {
            ids.add(id);
          }
        });
        setSelectedIds(ids);
        if (ids.size) setSelectedId([...ids][0]);
      }
      e.stopPropagation();
      return;
    }
    canvasPointerUp(e);
  }, [canvasPointerUp, persist, setSelectedId, openDrawer, visibleIds, canvas.x, setSelectedIds]);

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
      setScale(factor, e.clientX, e.clientY);
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [setScale, wrapRef]);

  useEffect(() => {
    const onKey = (e) => {
      const t = treeRef.current;
      const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;

      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput && selectedIds.size > 0) {
        if (!t) return;
        if (selectedIds.has(t.id)) return;
        pushHistory();
        const copy = JSON.parse(JSON.stringify(t));
        let removed = 0;
        selectedIds.forEach(id => {
          if (id === copy.id) return;
          removeNodeFromTree(copy, id);
          removed++;
        });
        setTree(copy);
        setSelectedIds(new Set());
        setSelectedId(null);
        closeDrawer();
        persist();
        if (removed) addToast('Deleted ' + removed + ' node(s)', null, { label: 'Undo', onClick: () => undo() });
        return;
      }

      if (e.key === 'Escape' && !isInput) {
        if (drawerNodeId) { closeDrawer(); return; }
        if (selectedIds.size) { setSelectedIds(new Set()); setSelectedId(null); return; }
        if (searchQuery) { setSearchQuery(''); return; }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !isInput) {
        switch (e.key) {
          case 'z': e.preventDefault(); if (undo) undo(); break;
          case 's': e.preventDefault(); persist(); addToast('Saved'); break;
          case 'n':
            e.preventDefault();
            if (!t) {
              const nt = makeNode('New project', '', 0);
              setTree(nt);
              recomputeLayout(nt, layout);
              setTimeout(() => { fitView(); openDrawer(nt.id); }, 50);
            } else {
              const parent = selectedId ? findNode(t, selectedId) || t : t;
              pushHistory();
              const copy = JSON.parse(JSON.stringify(t));
              const p = findNode(copy, parent.id);
              if (!p) return;
              const child = makeNode('New item', '', p.depth + 1);
              p.children = p.children || [];
              p.children.push(child);
              p.collapsed = false;
              recomputeLayout(copy, layout);
              setTree(copy);
              persist();
              openDrawer(child.id);
              setTimeout(() => { document.getElementById('detailsTitle')?.focus(); }, 100);
            }
            break;
          case 'a':
            e.preventDefault();
            if (t) {
              const ids = new Set();
              visibleIds.forEach(id => ids.add(id));
              setSelectedIds(ids);
              if (ids.size) setSelectedId([...ids][0]);
            }
            break;
        }
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, selectedId, drawerNodeId, searchQuery, pushHistory, setTree, persist, addToast, undo, setSelectedId, setSelectedIds, closeDrawer, setSearchQuery, openDrawer, fitView, layout, visibleIds]);

  const handleStartEmpty = useCallback(() => {
    const t = makeNode('New project', 'Describe this project, or ask the AI Architect to fill it in.', 0);
    setTree(t);
    recomputeLayout(t, layout);
    setTimeout(() => { fitView(); openDrawer(t.id); }, 50);
  }, [setTree, fitView, openDrawer, layout]);

  const nodeCount = tree ? 1 + countDescendants(tree) : 0;
  const depth = tree ? maxDepth(tree) : 0;

  return (
    <div className="canvas-wrap" id="canvasWrap" ref={wrapRef} onPointerDown={handlePointerDown}>
      <div className="canvas-grid" aria-hidden="true" />

      <div className="isolate-bar" id="isolateBar" hidden={!isolatedId}>
        <Compass size={14} style={{ color: 'var(--brass)' }} />
        <span>Focused on <strong>{findNode(tree, isolatedId)?.title || ''}</strong></span>
        <button type="button" aria-label="Show full map" onClick={() => { setIsolatedId(null); setTimeout(fitView, 50); }}>
          Show full map
        </button>
      </div>

      <div className="zoom-space" id="zoomSpace">
        <svg className="connector-layer" id="connectorLayer" aria-hidden="true">
          <Connectors />
        </svg>
        <div className="nodes-layer" id="nodesLayer">
          {visibleNodes.map(n => (
            <MindNode key={n.id} node={n} />
          ))}
        </div>
      </div>

      {noSearchResults && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none', zIndex:10 }}>
          <div style={{ textAlign:'center', color:'var(--ink-faint)' }}>
            <div style={{ fontSize:'2rem', marginBottom:'8px', opacity:0.4 }}>&#8981;</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'.9rem', color:'var(--ink-dim)', marginBottom:'4px' }}>No nodes match &ldquo;{searchQuery}&rdquo;</div>
            <div style={{ fontSize:'.78rem' }}>Try a broader search term</div>
          </div>
        </div>
      )}

      {marqueeBox && (
        <div className="marquee-box" style={{
          left: Math.min(marqueeBox.startX, marqueeBox.curX) + 'px',
          top: Math.min(marqueeBox.startY, marqueeBox.curY) + 'px',
          width: Math.abs(marqueeBox.curX - marqueeBox.startX) + 'px',
          height: Math.abs(marqueeBox.curY - marqueeBox.startY) + 'px',
        }} />
      )}

      {selectedIds.size > 1 && (
        <div className="selection-badge">
          <Trash2 size={13} />
          <span>{selectedIds.size} selected \u2014 Delete to remove</span>
        </div>
      )}

      <div className={`empty-state${tree ? ' hidden' : ''}`} id="emptyState">
        <div className="empty-icon"><Compass size={30} /></div>
        <h2>What are we building today?</h2>
        <p>Tell the AI Architect on the right what you're working on — it'll sketch out a first plan for you. Or drop a pin on the canvas and start building your way.</p>
        <button className="btn-primary" type="button" aria-label="Start with a blank canvas" onClick={handleStartEmpty}>
          Start with a blank canvas
        </button>
      </div>

      <div className="scale-indicator" aria-hidden="true">
        <div className="scale-ticks" />
        <span id="scaleLabel">SCALE 1:{Math.max(1, Math.round(100 / canvas.scale))}</span>
      </div>

      {tree && (
        <div className="shortcuts-hint" aria-hidden="true">
          <kbd>Ctrl+Z</kbd> undo &middot; <kbd>Shift</kbd>+drag select &middot; <kbd>Del</kbd> remove
        </div>
      )}

      <div className="title-block" id="titleBlock" title="Click to fit view. Shortcuts: Ctrl+Z undo, Shift+drag box-select, Delete remove selected" onClick={fitView}>
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
