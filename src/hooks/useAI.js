import { useCallback } from 'react';
import { useNexus } from '../store/NexusContext';
import {
  makeNode, findNode, findParent, ancestorPath,
  normalizeTree, removeNodeFromTree,
  recomputeLayout, placeNewChildren, buildTreeOutline
} from '../utils/tree';
import { REPLY_MARK, ACTIONS_MARK } from '../utils/constants';

function parseAIResponse(text) {
  const idx = text.indexOf(ACTIONS_MARK);
  let reply = text, actionsRaw = '';
  if (idx !== -1) { reply = text.slice(0, idx); actionsRaw = text.slice(idx + ACTIONS_MARK.length); }
  reply = reply.split(REPLY_MARK).join('').trim();
  let actions = [];
  if (actionsRaw) {
    const m = actionsRaw.match(/\[[\s\S]*\]/);
    if (m) { try { actions = JSON.parse(m[0]); if (!Array.isArray(actions)) actions = []; } catch { actions = []; } }
  }
  return { reply, actions };
}

function describeActions(actions) {
  if (!actions.length) return '';
  const counts = {};
  actions.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1; });
  const parts = [];
  if (counts.set_tree) parts.push('drafted the map');
  if (counts.add_children) parts.push('added items');
  if (counts.update_node) parts.push('updated ' + counts.update_node + ' node(s)');
  if (counts.delete_node) parts.push('removed ' + counts.delete_node + ' node(s)');
  return parts.length ? ('Map updated \u2014 ' + parts.join(', ') + '.') : '';
}

export function useAI() {
  const {
    tree, setTree, chat, setChat, model,
    pushHistory, persist, setBusy, addToast, fitView,
    setRecentlyAddedIds,
  } = useNexus();

  const sendChatMessage = useCallback(async (userText) => {
    userText = (userText || '').trim();
    if (!userText) return;
    if (typeof window.puter === 'undefined' || !window.puter.ai) {
      addToast('AI engine failed to load \u2014 check your connection and reload.', 'error');
      return;
    }

    function buildSystemPrompt() {
      const outline = tree ? buildTreeOutline(tree) : '(empty \u2014 no project yet)';
      return [
        'You are the AI Architect embedded in "Nexus Architect", a visual project-planning canvas.',
        'A project is a tree: one core node (depth 0), branches (depth 1, major phases or workstreams), and items (depth 2+, concrete tasks or deliverables).',
        '',
        'CURRENT MAP:',
        outline,
        '',
        'Respond in exactly this two-part format and nothing else \u2014 no extra commentary outside these two markers:',
        REPLY_MARK,
        '<a short, helpful message for the user, 1-4 sentences, plain text, no markdown headers>',
        ACTIONS_MARK,
        '<a JSON array of actions to apply to the map, or [] for none. Allowed action objects:',
        '{"type":"set_tree","tree":{"title":"...","description":"...","children":[{"title":"...","description":"...","children":[...]}]}}  (use ONLY to create the very first map, or to fully restructure it)',
        '{"type":"add_children","parentId":"<id from CURRENT MAP, or root>","children":[{"title":"...","description":"..."}]}',
        '{"type":"update_node","nodeId":"<id, or root>","title":"...","description":"..."}',
        '{"type":"delete_node","nodeId":"<id>"}',
        ']',
        '',
        'Guidelines: titles are short (2-6 words). Descriptions are one concise sentence. A brand new map needs a core + 3-5 branches, each with 2-4 items. Always reply in the same language the user is writing in.'
      ].join('\n');
    }

    function applyActions(actions) {
      let needsLayout = false;
      actions.forEach(act => {
        if (!act || typeof act !== 'object') return;
        switch (act.type) {
          case 'set_tree':
            if (act.tree) { setTree(normalizeTree(act.tree, 0)); needsLayout = true; }
            break;
          case 'add_children': {
            const parent = act.parentId === 'root' ? tree : findNode(tree, act.parentId);
            if (parent && Array.isArray(act.children) && act.children.length) {
              parent.children = parent.children || [];
              act.children.slice(0, 6).forEach(c => {
                parent.children.push(makeNode(c?.title, c?.description, parent.depth + 1));
              });
              parent.collapsed = false;
              placeNewChildren(parent);
            }
            break;
          }
          case 'update_node': {
            const n = act.nodeId === 'root' ? tree : findNode(tree, act.nodeId);
            if (n) {
              if (act.title) n.title = String(act.title).trim() || n.title;
              if (act.description !== undefined) n.description = String(act.description || '').trim();
            }
            break;
          }
          case 'delete_node':
            if (act.nodeId && act.nodeId !== 'root') removeNodeFromTree(tree, act.nodeId);
            break;
        }
      });
      if (needsLayout && tree) recomputeLayout(tree);
      if (tree) setTree({ ...tree });
    }

    setChat(prev => [...prev, { role: 'user', text: userText }]);
    const aiMsg = { role: 'ai', text: '', reasoning: '', pending: true };
    setChat(prev => [...prev, aiMsg]);
    setBusy(true);

    try {
      const sys = buildSystemPrompt();
      const msgHistory = chat.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
      const messages = [{ role: 'system', content: sys }].concat(msgHistory, [{ role: 'user', content: userText }]);

      const resp = await window.puter.ai.chat(messages, { model, stream: true });
      let full = '';

      for await (const part of resp) {
        if (part?.reasoning) {
          setChat(prev => {
            const last = prev[prev.length - 1];
            if (last) last.reasoning = (last.reasoning || '') + part.reasoning;
            return [...prev];
          });
        }
        if (part?.text) {
          full += part.text;
          const cut = full.indexOf(ACTIONS_MARK);
          let display = cut !== -1 ? full.slice(0, cut) : full;
          display = display.split(REPLY_MARK).join('').replace(/^\s+/, '');
          setChat(prev => {
            const last = prev[prev.length - 1];
            if (last) { last.text = display; last.pending = display.length === 0; }
            return [...prev];
          });
        }
      }

      const { reply, actions } = parseAIResponse(full);
      setChat(prev => {
        const last = prev[prev.length - 1];
        if (last) {
          last.pending = false;
          last.text = reply || full.split(REPLY_MARK).join('').trim() || 'Done.';
          if (actions && actions.length) {
            pushHistory();
            applyActions(actions);
            last.actionsApplied = describeActions(actions);
          }
        }
        return [...prev];
      });
      if (actions && actions.length && tree) {
        setTimeout(() => fitView(), 50);
      }
      persist();
    } catch (err) {
      setChat(prev => {
        const last = prev[prev.length - 1];
        if (last) { last.pending = false; last.error = true; last.text = 'Connection error \u2014 ' + (err?.message || 'please try again.'); }
        return [...prev];
      });
      addToast('AI error: ' + (err?.message || err), 'error');
    } finally {
      setBusy(false);
    }
  }, [tree, chat, model, setChat, setBusy, addToast, pushHistory, persist, fitView, setTree]);

  const expandNodeAI = useCallback(async (nodeId) => {
    const node = findNode(tree, nodeId);
    if (!node) return;
    if (typeof window.puter === 'undefined' || !window.puter.ai) {
      addToast('AI engine failed to load.', 'error');
      return;
    }
    setBusy(true);
    node.expanding = true;
    setTree({ ...tree });

    const path = ancestorPath(tree, node).join(' \u203A ');
    const parent = findParent(tree, node.id);
    const siblings = parent ? (parent.children || []).filter(c => c.id !== node.id).map(c => c.title) : [];
    const lines = [
      'Project: "' + tree.title + '"',
      'Location: ' + path,
      'Current notes for "' + node.title + '": ' + (node.description || '(none)')
    ];
    if (siblings.length) lines.push('Existing sibling items (avoid duplicating): ' + siblings.join(', '));
    lines.push('');
    lines.push('Suggest 3 to 5 new sub-items that belong under "' + node.title + '". Respond with ONLY a JSON array, no commentary or markdown fences: [{"title":"...","description":"one concise sentence"}]');
    lines.push('Reply in the same language as the titles above.');
    const prompt = lines.join('\n');

    try {
      const resp = await window.puter.ai.chat(prompt, { model });
      const text = typeof resp === 'string' ? resp : (resp?.message?.content || resp?.text || '');
      const m = text.match(/\[[\s\S]*\]/);
      if (!m) throw new Error('unexpected response format');
      const items = JSON.parse(m[0]);
      if (!Array.isArray(items) || !items.length) throw new Error('empty response');

      pushHistory();
      const newIds = new Set();
      items.slice(0, 6).forEach(it => {
        const child = makeNode(it?.title, it?.description, node.depth + 1);
        newIds.add(child.id);
        node.children = node.children || [];
        node.children.push(child);
      });
      node.collapsed = false;
      placeNewChildren(node);
      setRecentlyAddedIds(newIds);
      setTree({ ...tree });
      setTimeout(() => { fitView(); }, 50);
      persist();
      addToast('Added ' + items.length + ' item(s) to "' + node.title + '"');
      setTimeout(() => { setRecentlyAddedIds(new Set()); }, 1100);
    } catch (err) {
      addToast('AI error: ' + (err?.message || err), 'error');
    } finally {
      node.expanding = false;
      setBusy(false);
      setTree({ ...tree });
    }
  }, [tree, model, setTree, setBusy, addToast, pushHistory, persist, fitView, setRecentlyAddedIds]);

  const elaborateNodeAI = useCallback(async (nodeId, onContent) => {
    const node = findNode(tree, nodeId);
    if (!node) return;
    if (typeof window.puter === 'undefined' || !window.puter.ai) {
      addToast('AI engine failed to load.', 'error');
      return;
    }
    setBusy(true);

    const path = ancestorPath(tree, node).join(' \u203A ');
    const prompt = [
      'Project: "' + tree.title + '"',
      'Component: ' + path,
      'Existing notes: ' + (node.description || '(none yet)'),
      '',
      'Write a focused elaboration for "' + node.title + '" as plain markdown: one short paragraph, then 3-5 bullet points covering concrete deliverables, considerations, or next steps. No heading, no preamble, no markdown fences.',
      'Reply in the same language as the project title.'
    ].join('\n');

    try {
      const resp = await window.puter.ai.chat(prompt, { model, stream: true });
      let full = '';
      for await (const part of resp) {
        if (part?.text) { full += part.text; onContent(full); }
      }
      if (!full.trim()) throw new Error('empty response');
    } catch (err) {
      addToast('AI error: ' + (err?.message || err), 'error');
    } finally {
      setBusy(false);
    }
  }, [tree, model, setBusy, addToast]);

  return { sendChatMessage, expandNodeAI, elaborateNodeAI };
}

export { REPLY_MARK, ACTIONS_MARK };
