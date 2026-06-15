import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { STORAGE_KEY, MODELS, DEFAULT_MODEL, LAYOUTS, DEFAULT_LAYOUT } from '../utils/constants';
import { rebuildNodeMap, findNode, getBounds, applyActions as applyTreeActions } from '../utils/tree';
import { generateId } from '../utils/helpers';

const NexusContext = createContext(null);

function describeActionsSummary(actions) {
  if (!actions?.length) return '';
  const counts = {};
  actions.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1; });
  const parts = [];
  if (counts.set_tree) parts.push('drafted the map');
  if (counts.add_children) parts.push('added items');
  if (counts.update_node) parts.push('updated ' + counts.update_node + ' node(s)');
  if (counts.delete_node) parts.push('removed ' + counts.delete_node + ' node(s)');
  return parts.length ? ('Map updated \u2014 ' + parts.join(', ') + '.') : '';
}

export function NexusProvider({ children }) {
  const [tree, setTreeRaw] = useState(null);
  const [nodeMap, setNodeMap] = useState(new Map());
  const [chat, setChat] = useState([]);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [canvas, setCanvas] = useState({ scale: 1, x: 0, y: 0 });
  const [isolatedId, setIsolatedId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [recentlyAddedIds, setRecentlyAddedIds] = useState(new Set());
  const [lastSaved, setLastSaved] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [drawerNodeId, setDrawerNodeId] = useState(null);
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingActions, setPendingActions] = useState(null);
  const [geminiKey, setGeminiKey] = useState(() => {
    try { return localStorage.getItem('nexus_gemini_key') || ''; } catch { return ''; }
  });
  const [provider, setProvider] = useState(() => {
    try { return localStorage.getItem('nexus_provider') || 'puter'; } catch { return 'puter'; }
  });
  const [customModel, setCustomModel] = useState(() => {
    try { return localStorage.getItem('nexus_custom_model') || 'gemini-2.5-flash'; } catch { return 'gemini-2.5-flash'; }
  });
  const [resetArmed, setResetArmed] = useState(false);

  const saveTimer = useRef(null);
  useEffect(() => {
    try { localStorage.setItem('nexus_gemini_key', geminiKey || ''); } catch { /* ignore */ }
  }, [geminiKey]);
  useEffect(() => {
    try { localStorage.setItem('nexus_provider', provider); } catch { /* ignore */ }
  }, [provider]);
  useEffect(() => {
    try { localStorage.setItem('nexus_custom_model', customModel); } catch { /* ignore */ }
  }, [customModel]);

  const setTree = useCallback((t) => {
    setTreeRaw(t);
    setNodeMap(rebuildNodeMap(t));
  }, []);

  const addToast = useCallback((message, type, action) => {
    const id = generateId('toast');
    const isError = type === 'error';
    setToasts(prev => {
      const next = [...prev, { id, message, type, action }];
      return next.length > 3 ? next.slice(-3) : next;
    });
    if (!isError) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), action ? 6000 : 3400);
    }
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
      try {
        const snapshot = JSON.parse(nh.pop());
        setTree(snapshot);
        setIsolatedId(null);
        setSelectedId(null);
        return nh;
      } catch {
        addToast('Could not undo — history entry was corrupted.', 'error');
        return nh;
      }
    });
  }, [setTree, addToast]);

  const SAVE_LOCAL_KEY = 'nexus_architect_data';

  const persist = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const payload = JSON.stringify({
        tree, chat: chat.slice(-24), model, layout, geminiKey, provider, customModel, savedAt: Date.now()
      });
      try {
        localStorage.setItem(SAVE_LOCAL_KEY, payload);
      } catch { /* localStorage full */ }
      try {
        if (window.puter?.storage) {
          await window.puter.storage.set(STORAGE_KEY, payload);
        }
      } catch { /* puter unavailable */ }
      setLastSaved(Date.now());
    }, 500);
  }, [tree, chat, model, layout, geminiKey, provider, customModel]);

  const loadFromStorage = useCallback(async () => {
    let raw = null;
    try {
      raw = localStorage.getItem(SAVE_LOCAL_KEY);
    } catch { /* ignore */ }
    if (!raw) {
      try {
        if (window.puter?.storage) {
          const res = await window.puter.storage.get(STORAGE_KEY);
          if (res?.value) raw = res.value;
        }
      } catch { /* ignore */ }
    }
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (data.tree) setTree(data.tree);
        if (Array.isArray(data.chat)) setChat(data.chat);
        if (data.model && MODELS.some(m => m.id === data.model)) setModel(data.model);
        if (data.layout && LAYOUTS.some(l => l.id === data.layout)) setLayout(data.layout);
        if (data.geminiKey && !geminiKey) {
          try { localStorage.setItem('nexus_gemini_key', data.geminiKey); setGeminiKey(data.geminiKey); } catch { /* ignore */ }
        }
        if (data.provider) setProvider(data.provider);
        if (data.customModel) setCustomModel(data.customModel);
        setLastSaved(data.savedAt || null);
      } catch { /* ignore */ }
    }
  }, [setTree, geminiKey, setGeminiKey]);

  const resetProject = useCallback(async () => {
    setTreeRaw(null);
    setNodeMap(new Map());
    setChat([]);
    setIsolatedId(null);
    setSelectedId(null);
    setHistory([]);
    setLastSaved(null);
    setDrawerNodeId(null);
    try { localStorage.removeItem('nexus_architect_data'); } catch { /* ignore */ }
    try { if (window.puter?.storage) await window.puter.storage.delete(STORAGE_KEY); } catch { /* ignore */ }
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

  const setScale = useCallback((factor, clientX, clientY) => {
    setCanvas(prev => {
      const s = Math.min(2, Math.max(0.2, prev.scale * factor));
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

  const confirmPendingActionsCB = useCallback(() => {
    setPendingActions(prev => {
      if (!prev) return prev;
      const { actions, layout: actLayout } = prev;
      const result = applyTreeActions(tree, actions, actLayout);
      setTree(result.tree);
      if (result.isolatedId) setIsolatedId(result.isolatedId);
      const summary = describeActionsSummary(actions);
      setChat(c => {
        const last = c[c.length - 1];
        if (!last) return c;
        return [...c.slice(0, -1), { ...last, pending: false, actionsApplied: summary }];
      });
      setTimeout(() => fitView(), 50);
      addToast(summary);
      persist();
      return null;
    });
  }, [tree, setTree, setIsolatedId, setChat, addToast, fitView, persist]);

  const cancelPendingActionsCB = useCallback(() => {
    setPendingActions(prev => {
      if (!prev) return prev;
      const { reply } = prev;
      setChat(c => {
        const last = c[c.length - 1];
        if (!last) return c;
        return [...c.slice(0, -1), { ...last, pending: false, text: reply || '', actionsApplied: 'Changes were cancelled.' }];
      });
      return null;
    });
  }, [setChat]);

  const ctx = useMemo(() => ({
    tree, setTree, nodeMap, setNodeMap,
    chat, setChat, model, setModel,
    canvas, setCanvas, isolatedId, setIsolatedId,
    selectedId, setSelectedId, selectedIds, setSelectedIds, history, setHistory,
    busy, setBusy, recentlyAddedIds, setRecentlyAddedIds,
    lastSaved, setLastSaved, toasts,
    drawerNodeId, setDrawerNodeId,
    layout, setLayout,
    searchQuery, setSearchQuery,
    pendingActions, setPendingActions,
    confirmPendingActions: confirmPendingActionsCB,
    cancelPendingActions: cancelPendingActionsCB,
    geminiKey, setGeminiKey,
    provider, setProvider, customModel, setCustomModel,
    resetArmed, setResetArmed,
    pushHistory, undo, persist, loadFromStorage, resetProject,
    addToast, removeToast,
    openDrawer, closeDrawer,
    setScale, zoomIn, zoomOut, fitView,
  }), [tree, nodeMap, chat, model, canvas, isolatedId, selectedId, selectedIds, history,
      busy, recentlyAddedIds, lastSaved, toasts, drawerNodeId, layout, searchQuery, pendingActions,
      geminiKey, provider, customModel, resetArmed,
      confirmPendingActionsCB, cancelPendingActionsCB,
      setTree, setNodeMap, setChat, setModel, setCanvas, setIsolatedId,
      setSelectedId, setSelectedIds, setHistory, setBusy, setRecentlyAddedIds, setLastSaved,
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
