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
  // ===== Tree & Node State =====
  const [tree, setTreeRaw] = useState(null);
  const [nodeMap, setNodeMap] = useState(new Map());

  // ===== Chat & AI State =====
  const [chat, setChat] = useState([]);
  const [model, setModel] = useState(DEFAULT_MODEL);

  // ===== Canvas & Viewport =====
  const [canvas, setCanvas] = useState({ scale: 1, x: 0, y: 0 });
  // ===== Selection & Isolation =====
  const [isolatedId, setIsolatedId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // ===== Undo / Redo =====
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // ===== UI State =====
  const [busy, setBusy] = useState(false);
  const [recentlyAddedIds, setRecentlyAddedIds] = useState(new Set());
  const [lastSaved, setLastSaved] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [drawerNodeId, setDrawerNodeId] = useState(null);
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingActions, setPendingActions] = useState(null);
  const decodeKey = (raw) => {
    if (!raw) return '';
    try { return atob(raw).split('').reverse().join(''); } catch { return raw; }
  };
  const encodeKey = (key) => {
    if (!key) return '';
    try { return btoa(key.split('').reverse().join('')); } catch { return key; }
  };
  const [geminiKey, setGeminiKey] = useState(() => {
    try { return decodeKey(localStorage.getItem('nexus_gemini_key') || ''); } catch { return ''; }
  });
  const [provider, setProvider] = useState(() => {
    try { return localStorage.getItem('nexus_provider') || 'puter'; } catch { return 'puter'; }
  });
  const [customModel, setCustomModel] = useState(() => {
    try { return localStorage.getItem('nexus_custom_model') || 'gemini-2.5-flash'; } catch { return 'gemini-2.5-flash'; }
  });
  const [maxDepth, setMaxDepth] = useState(() => {
    try { return parseInt(localStorage.getItem('nexus_max_depth') || '3', 10); } catch { return 3; }
  });
  const [resetArmed, setResetArmed] = useState(false);

  // ===== Document & Persistence State =====
  const [documents, setDocuments] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus_docs_meta') || '[]'); } catch { return []; }
  });
  const [activeDocId, setActiveDocId] = useState(() => {
    try { return localStorage.getItem('nexus_active_doc') || null; } catch { return null; }
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try { return parseInt(localStorage.getItem('nexus_sidebar_width') || '380', 10); } catch { return 380; }
  });
  const [drawerWidth, setDrawerWidth] = useState(() => {
    try { return parseInt(localStorage.getItem('nexus_drawer_width') || '340', 10); } catch { return 340; }
  });

  const saveTimer = useRef(null);
  useEffect(() => {
    try { localStorage.setItem('nexus_gemini_key', encodeKey(geminiKey || '')); } catch { /* ignore */ }
  }, [geminiKey]);
  useEffect(() => {
    try { localStorage.setItem('nexus_provider', provider); } catch { /* ignore */ }
  }, [provider]);
  useEffect(() => {
    try { localStorage.setItem('nexus_custom_model', customModel); } catch { /* ignore */ }
  }, [customModel]);
  useEffect(() => {
    try { localStorage.setItem('nexus_sidebar_width', String(sidebarWidth)); } catch { /* ignore */ }
  }, [sidebarWidth]);
  useEffect(() => {
    try { localStorage.setItem('nexus_drawer_width', String(drawerWidth)); } catch { /* ignore */ }
  }, [drawerWidth]);
  useEffect(() => {
    try { localStorage.setItem('nexus_max_depth', String(maxDepth)); } catch { /* ignore */ }
  }, [maxDepth]);

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
    setRedoStack([]);
  }, [tree]);

  const undo = useCallback(() => {
    if (!tree) return;
    setHistory(prev => {
      if (!prev.length) return prev;
      const nh = [...prev];
      try {
        const snapshot = JSON.parse(nh.pop());
        setRedoStack(r => [...r, JSON.stringify(tree)]);
        setTree(snapshot);
        setIsolatedId(null);
        setSelectedId(null);
        return nh;
      } catch {
        addToast('Could not undo — history entry was corrupted.', 'error');
        return nh;
      }
    });
  }, [setTree, addToast, tree]);

  const redo = useCallback(() => {
    if (!tree) return;
    setRedoStack(prev => {
      if (!prev.length) return prev;
      const nr = [...prev];
      try {
        const snapshot = JSON.parse(nr.pop());
        setHistory(h => [...h, JSON.stringify(tree)]);
        setTree(snapshot);
        setIsolatedId(null);
        setSelectedId(null);
        return nr;
      } catch {
        addToast('Could not redo — history entry was corrupted.', 'error');
        return nr;
      }
    });
  }, [setTree, addToast, tree]);

  // ===== Persistence (localStorage + Puter) =====
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
      if (activeDocId && tree) {
        try { localStorage.setItem('nexus_doc_' + activeDocId, payload); } catch { /* ignore */ }
      }
      try {
        if (window.puter?.storage) {
          await window.puter.storage.set(STORAGE_KEY, payload);
        }
      } catch { /* puter unavailable */ }
      setLastSaved(Date.now());
    }, 500);
  }, [tree, chat, model, layout, geminiKey, provider, customModel, activeDocId]);

  const loadFromStorage = useCallback(async () => {
    let docs = [];
    try { docs = JSON.parse(localStorage.getItem('nexus_docs_meta') || '[]'); } catch { /* ignore */ }
    let activeDoc = null;
    try { activeDoc = localStorage.getItem('nexus_active_doc'); } catch { /* ignore */ }

    if (!docs.length) {
      let raw = null;
      try { raw = localStorage.getItem(SAVE_LOCAL_KEY); } catch { /* ignore */ }
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
          if (data.tree) {
            const id = generateId('doc');
            const now = Date.now();
            docs = [{ id, name: data.tree?.title || 'My Project', createdAt: now, updatedAt: now }];
            activeDoc = id;
            try { localStorage.setItem('nexus_doc_' + id, raw); } catch { /* ignore */ }
            try { localStorage.setItem('nexus_docs_meta', JSON.stringify(docs)); } catch { /* ignore */ }
            try { localStorage.setItem('nexus_active_doc', id); } catch { /* ignore */ }
            setDocuments(docs);
            setActiveDocId(id);
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
            return;
          }
        } catch { /* ignore */ }
      }
      const id = generateId('doc');
      const now = Date.now();
      docs = [{ id, name: 'My Project', createdAt: now, updatedAt: now }];
      activeDoc = id;
      try { localStorage.setItem('nexus_docs_meta', JSON.stringify(docs)); } catch { /* ignore */ }
      try { localStorage.setItem('nexus_active_doc', id); } catch { /* ignore */ }
      setDocuments(docs);
      setActiveDocId(id);
      return;
    }

    setDocuments(docs);
    if (activeDoc && docs.some(d => d.id === activeDoc)) {
      setActiveDocId(activeDoc);
    } else {
      activeDoc = docs[0].id;
      setActiveDocId(activeDoc);
      try { localStorage.setItem('nexus_active_doc', activeDoc); } catch { /* ignore */ }
    }
    try {
      const raw = localStorage.getItem('nexus_doc_' + activeDoc);
      if (raw) {
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
      }
    } catch { /* ignore */ }
  }, [setTree, geminiKey, setGeminiKey, setDocuments, setActiveDocId]);

  const resetProject = useCallback(async () => {
    setTreeRaw(null);
    setNodeMap(new Map());
    setChat([]);
    setIsolatedId(null);
    setSelectedId(null);
    setSelectedIds(new Set());
    setHistory([]);
    setRedoStack([]);
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

  const saveDocMeta = useCallback((docs) => {
    setDocuments(docs);
    try { localStorage.setItem('nexus_docs_meta', JSON.stringify(docs)); } catch { /* ignore */ }
  }, []);

  const persistDoc = useCallback(() => {
    if (!activeDocId || !tree) return;
    const payload = JSON.stringify({
      tree, chat: chat.slice(-24), model, layout, geminiKey, provider, customModel, savedAt: Date.now()
    });
    try { localStorage.setItem('nexus_doc_' + activeDocId, payload); } catch { /* localStorage full */ }
    try {
      if (window.puter?.storage) {
        window.puter.storage.set('nexus_doc_' + activeDocId, payload);
      }
    } catch { /* ignore */ }
  }, [activeDocId, tree, chat, model, layout, geminiKey, provider, customModel]);

  const switchDocument = useCallback((docId) => {
    if (docId === activeDocId) return;
    persistDoc();
    try {
      const raw = localStorage.getItem('nexus_doc_' + docId);
      if (raw) {
        const data = JSON.parse(raw);
        if (data.tree) setTree(data.tree);
        if (Array.isArray(data.chat)) setChat(data.chat);
        if (data.model && MODELS.some(m => m.id === data.model)) setModel(data.model);
        if (data.layout && LAYOUTS.some(l => l.id === data.layout)) setLayout(data.layout);
        if (data.geminiKey) setGeminiKey(data.geminiKey);
        if (data.provider) setProvider(data.provider);
        if (data.customModel) setCustomModel(data.customModel);
        setActiveDocId(docId);
        try { localStorage.setItem('nexus_active_doc', docId); } catch { /* ignore */ }
        setTimeout(fitView, 80);
      } else {
        addToast('Document data not found.', 'error');
      }
    } catch { addToast('Could not load document.', 'error'); }
  }, [activeDocId, persistDoc, setTree, setChat, setModel, setLayout, setGeminiKey, setProvider, setCustomModel, addToast, fitView]);

  const createDocument = useCallback((name) => {
    const id = generateId('doc');
    const now = Date.now();
    const entry = { id, name: name || 'Untitled', createdAt: now, updatedAt: now };
    saveDocMeta([entry, ...documents]);
    persistDoc();
    setActiveDocId(id);
    try { localStorage.setItem('nexus_active_doc', id); } catch { /* ignore */ }
    setTree(null);
    setChat([]);
    setHistory([]);
    setRedoStack([]);
    setIsolatedId(null);
    setSelectedId(null);
    setSelectedIds(new Set());
    setDrawerNodeId(null);
    addToast('Created "' + entry.name + '"');
  }, [documents, saveDocMeta, persistDoc, addToast, setTree, setChat, setHistory, setRedoStack, setIsolatedId, setSelectedId, setSelectedIds, setDrawerNodeId]);

  const deleteDocument = useCallback((docId) => {
    if (documents.length <= 1) { addToast('Cannot delete the only document.', 'error'); return; }
    try { localStorage.removeItem('nexus_doc_' + docId); } catch { /* ignore */ }
    const rest = documents.filter(d => d.id !== docId);
    saveDocMeta(rest);
    if (docId === activeDocId) {
      const next = rest[0];
      setActiveDocId(next.id);
      try { localStorage.setItem('nexus_active_doc', next.id); } catch { /* ignore */ }
      try {
        const raw = localStorage.getItem('nexus_doc_' + next.id);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.tree) setTree(data.tree);
          if (Array.isArray(data.chat)) setChat(data.chat);
          if (data.model) setModel(data.model);
        }
      } catch { /* ignore */ }
      setTimeout(fitView, 80);
    }
  }, [documents, activeDocId, saveDocMeta, setTree, setChat, setModel, addToast, fitView]);

  const renameDocument = useCallback((docId, name) => {
    saveDocMeta(documents.map(d => d.id === docId ? { ...d, name, updatedAt: Date.now() } : d));
  }, [documents, saveDocMeta]);

  const confirmPendingActionsCB = useCallback(() => {
    setPendingActions(prev => {
      if (!prev) return prev;
      const { actions, layout: actLayout } = prev;
      const result = applyTreeActions(tree, actions, actLayout, maxDepth);
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
  }, [tree, setTree, setIsolatedId, setChat, addToast, fitView, persist, maxDepth]);

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

  // ===== Context Value =====
  const ctx = useMemo(() => ({
    tree, setTree, nodeMap, setNodeMap,
    chat, setChat, model, setModel,
    canvas, setCanvas, isolatedId, setIsolatedId,
    selectedId, setSelectedId, selectedIds, setSelectedIds, history, setHistory,
    redoStack, setRedoStack,
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
    maxDepth, setMaxDepth,
    documents, activeDocId, sidebarWidth, setSidebarWidth, drawerWidth, setDrawerWidth,
    pushHistory, undo, redo, persist, loadFromStorage, resetProject,
    addToast, removeToast,
    openDrawer, closeDrawer,
    setScale, zoomIn, zoomOut, fitView,
    persistDoc, switchDocument, createDocument, deleteDocument, renameDocument,
  }), [tree, nodeMap, chat, model, canvas, isolatedId, selectedId, selectedIds, history,
      redoStack, busy, recentlyAddedIds, lastSaved, toasts, drawerNodeId, layout, searchQuery,
      pendingActions, geminiKey, provider, customModel, resetArmed, maxDepth,
      documents, activeDocId, sidebarWidth, drawerWidth,
      confirmPendingActionsCB, cancelPendingActionsCB,
      setTree, setNodeMap, setChat, setModel, setCanvas, setIsolatedId,
      setSelectedId, setSelectedIds, setHistory, setBusy, setRecentlyAddedIds, setLastSaved,
      setDrawerNodeId, setResetArmed, pushHistory, persist, loadFromStorage,
      resetProject, addToast, removeToast, openDrawer, closeDrawer,
      setScale, zoomIn, zoomOut, fitView, undo, redo,
      persistDoc, switchDocument, createDocument, deleteDocument, renameDocument]);

  return <NexusContext.Provider value={ctx}>{children}</NexusContext.Provider>;
}

// ===== Hook Export =====
export function useNexus() {
  const ctx = useContext(NexusContext);
  if (!ctx) throw new Error('useNexus must be used within NexusProvider');
  return ctx;
}
