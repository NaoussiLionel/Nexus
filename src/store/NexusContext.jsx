import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import { STORAGE_KEY, MODELS, DEFAULT_MODEL } from '../utils/constants';
import { rebuildNodeMap, findNode, getBounds } from '../utils/tree';
import { generateId } from '../utils/helpers';

const NexusContext = createContext(null);

export function NexusProvider({ children }) {
  const [tree, setTreeRaw] = useState(null);
  const [nodeMap, setNodeMap] = useState(new Map());
  const [chat, setChat] = useState([]);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [canvas, setCanvas] = useState({ scale: 1, x: 0, y: 0 });
  const [isolatedId, setIsolatedId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [recentlyAddedIds, setRecentlyAddedIds] = useState(new Set());
  const [lastSaved, setLastSaved] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [drawerNodeId, setDrawerNodeId] = useState(null);
  const [resetArmed, setResetArmed] = useState(false);

  const saveTimer = useRef(null);

  const setTree = useCallback((t) => {
    setTreeRaw(t);
    setNodeMap(rebuildNodeMap(t));
  }, []);

  const pushHistory = useCallback(() => {
    if (!tree) return;
    setHistory(prev => {
      const next = [...prev, JSON.stringify(tree)];
      if (next.length > 20) next.shift();
      return next;
    });
  }, [tree]);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (!prev.length) return prev;
      const nh = [...prev];
      const snapshot = JSON.parse(nh.pop());
      setTree(snapshot);
      setIsolatedId(null);
      setSelectedId(null);
      return nh;
    });
  }, [setTree]);

  const persist = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        if (!window.puter?.storage) return;
        await window.puter.storage.set(STORAGE_KEY, JSON.stringify({
          tree, chat: chat.slice(-24), model, savedAt: Date.now()
        }));
        setLastSaved(Date.now());
      } catch { /* ignore */ }
    }, 500);
  }, [tree, chat, model]);

  const loadFromStorage = useCallback(async () => {
    try {
      if (!window.puter?.storage) return;
      const res = await window.puter.storage.get(STORAGE_KEY);
      if (res?.value) {
        const data = JSON.parse(res.value);
        if (data.tree) setTree(data.tree);
        if (Array.isArray(data.chat)) setChat(data.chat);
        if (data.model && MODELS.some(m => m.id === data.model)) setModel(data.model);
        setLastSaved(data.savedAt || null);
      }
    } catch { /* ignore */ }
  }, [setTree]);

  const resetProject = useCallback(async () => {
    setTreeRaw(null);
    setNodeMap(new Map());
    setChat([]);
    setIsolatedId(null);
    setSelectedId(null);
    setHistory([]);
    setLastSaved(null);
    setDrawerNodeId(null);
    try { if (window.puter?.storage) await window.puter.storage.delete(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const addToast = useCallback((message, type, action) => {
    const id = generateId('toast');
    setToasts(prev => [...prev, { id, message, type, action }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), action ? 6000 : 3400);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const openDrawer = useCallback((nodeId) => {
    setSelectedId(nodeId);
    setDrawerNodeId(nodeId);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerNodeId(null);
    setSelectedId(null);
  }, []);

  const setScale = useCallback((newScale, clientX, clientY) => {
    setCanvas(prev => {
      const s = Math.min(2, Math.max(0.2, newScale));
      const wrap = document.getElementById('canvasWrap');
      if (!wrap) return prev;
      const rect = wrap.getBoundingClientRect();
      const px = (clientX ?? rect.left + rect.width / 2) - rect.left;
      const py = (clientY ?? rect.top + rect.height / 2) - rect.top;
      const worldX = (px - prev.x) / prev.scale;
      const worldY = (py - prev.y) / prev.scale;
      return { scale: s, x: px - worldX * s, y: py - worldY * s };
    });
  }, [setCanvas]);

  const zoomIn = useCallback(() => {
    setCanvas(prev => {
      const s = Math.min(2, Math.max(0.2, prev.scale * 1.2));
      const wrap = document.getElementById('canvasWrap');
      if (!wrap) return prev;
      const rect = wrap.getBoundingClientRect();
      const px = rect.left + rect.width / 2;
      const py = rect.top + rect.height / 2;
      const worldX = (px - prev.x) / prev.scale;
      const worldY = (py - prev.y) / prev.scale;
      return { scale: s, x: px - worldX * s, y: py - worldY * s };
    });
  }, [setCanvas]);

  const zoomOut = useCallback(() => {
    setCanvas(prev => {
      const s = Math.min(2, Math.max(0.2, prev.scale / 1.2));
      const wrap = document.getElementById('canvasWrap');
      if (!wrap) return prev;
      const rect = wrap.getBoundingClientRect();
      const px = rect.left + rect.width / 2;
      const py = rect.top + rect.height / 2;
      const worldX = (px - prev.x) / prev.scale;
      const worldY = (py - prev.y) / prev.scale;
      return { scale: s, x: px - worldX * s, y: py - worldY * s };
    });
  }, [setCanvas]);

  const fitView = useCallback(() => {
    setCanvas(prev => {
      const wrap = document.getElementById('canvasWrap');
      if (!wrap) return prev;
      const root = isolatedId ? findNode(tree, isolatedId) : tree;
      const b = getBounds(root);
      const w = Math.max(200, b.maxX - b.minX);
      const h = Math.max(120, b.maxY - b.minY);
      const rect = wrap.getBoundingClientRect();
      const pad = 90;
      const scale = Math.min((rect.width - pad * 2) / w, (rect.height - pad * 2) / h, 1.15);
      const s = Math.max(0.2, Math.min(2, scale));
      const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
      return { scale: s, x: rect.width / 2 - cx * s, y: rect.height / 2 - cy * s };
    });
  }, [tree, isolatedId, setCanvas]);

  const ctx = useMemo(() => ({
    tree, setTree, nodeMap, setNodeMap,
    chat, setChat, model, setModel,
    canvas, setCanvas, isolatedId, setIsolatedId,
    selectedId, setSelectedId, history, setHistory,
    busy, setBusy, recentlyAddedIds, setRecentlyAddedIds,
    lastSaved, setLastSaved, toasts,
    drawerNodeId, setDrawerNodeId,
    resetArmed, setResetArmed,
    pushHistory, undo, persist, loadFromStorage, resetProject,
    addToast, removeToast,
    openDrawer, closeDrawer,
    setScale, zoomIn, zoomOut, fitView,
  }), [tree, nodeMap, chat, model, canvas, isolatedId, selectedId, history,
      busy, recentlyAddedIds, lastSaved, toasts, drawerNodeId, resetArmed,
      setTree, setNodeMap, setChat, setModel, setCanvas, setIsolatedId,
      setSelectedId, setHistory, setBusy, setRecentlyAddedIds, setLastSaved,
      setDrawerNodeId, setResetArmed, pushHistory, persist, loadFromStorage,
      resetProject, addToast, removeToast, openDrawer, closeDrawer,
      setScale, zoomIn, zoomOut, fitView, undo]);

  return <NexusContext.Provider value={ctx}>{children}</NexusContext.Provider>;
}

export function useNexus() {
  const ctx = useContext(NexusContext);
  if (!ctx) throw new Error('useNexus must be used within NexusProvider');
  return ctx;
}
