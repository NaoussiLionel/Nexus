import { useCallback } from 'react';
import { useNexus } from '../store/NexusContext';
import {
  makeNode, findNode, findParent, ancestorPath,
  normalizeTree, removeNodeFromTree,
  recomputeLayout, buildTreeOutline
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
        'You are the AI Architect in "Nexus Architect" \u2014 a visual project-planning canvas that adapts to any methodology.',
        'The tree has 3 levels: core (depth 0), branches / phases / workstreams (depth 1), and items / tasks / deliverables (depth 2+).',
        '',
        'You know these planning techniques and choose the one that best fits the user\u2019s intent from the conversation:',
        '\u2022 Work Breakdown Structure (WBS) \u2014 hierarchical decomposition of deliverables',
        '\u2022 Agile / Scrum \u2014 sprints, epics, user stories, tasks',
        '\u2022 Kanban \u2014 columns (To Do / In Progress / Done) as branches, work items as leaves',
        '\u2022 Waterfall \u2014 sequential phases: Requirements, Design, Implementation, Testing, Deployment',
        '\u2022 Critical Path Method (CPM) \u2014 milestones and dependencies as a dependency graph',
        '\u2022 Mind Map \u2014 free-form brainstorming radiating from a central concept',
        '\u2022 OKR / Goal hierarchy \u2014 Objectives, Key Results, Initiatives, Tasks',
        '',
        'Analyze the user\u2019s language, domain, and goals. Pick the most natural technique, apply its structure, and briefly name it in your reply.',
        '',
        'CURRENT MAP:',
        outline,
        '',
        'Respond in exactly this two-part format and nothing else \u2014 no extra commentary outside these two markers:',
        REPLY_MARK,
        '<a short, helpful message (1-4 sentences, plain text, no headers) that names the technique you chose and what you did>',
        ACTIONS_MARK,
        '<a JSON array of actions to apply to the map, or [] for none. Allowed action objects:',
        '{"type":"set_tree","tree":{"title":"...","description":"...","children":[{"title":"...","description":"...","children":[...]}]}}  (use ONLY to create the very first map, or to fully restructure it)',
        '{"type":"add_children","parentId":"<id from CURRENT MAP, or root>","children":[{"title":"...","description":"..."}]}',
        '{"type":"update_node","nodeId":"<id, or root>","title":"...","description":"..."}',
        '{"type":"delete_node","nodeId":"<id>"}',
        ']',
        '',
        'Titles: 2-6 words. Descriptions: one concise sentence. A new map starts with 1 core + 3-5 branches, each with 2-4 items. Reply in the same language the user is writing in.'
      ].join('\n');
    }

    function applyActions(actions) {
      let current = tree;
      let replaced = false;
      actions.forEach(act => {
        if (!act || typeof act !== 'object') return;
        switch (act.type) {
          case 'set_tree':
            if (act.tree) {
              const t = normalizeTree(act.tree, 0);
              recomputeLayout(t);
              setTree(t);
              current = t;
              replaced = true;
            }
            break;
          case 'add_children': {
            const parent = act.parentId === 'root' ? current : findNode(current, act.parentId);
            if (parent && Array.isArray(act.children) && act.children.length) {
              parent.children = parent.children || [];
              act.children.slice(0, 6).forEach(c => {
                parent.children.push(makeNode(c?.title, c?.description, parent.depth + 1));
              });
              parent.collapsed = false;
            }
            break;
          }
          case 'update_node': {
            const n = act.nodeId === 'root' ? current : findNode(current, act.nodeId);
            if (n) {
              if (act.title) n.title = String(act.title).trim() || n.title;
              if (act.description !== undefined) n.description = String(act.description || '').trim();
            }
            break;
          }
          case 'delete_node':
            if (act.nodeId && act.nodeId !== 'root') removeNodeFromTree(current, act.nodeId);
            break;
        }
      });
      if (current && !replaced) {
        recomputeLayout(current);
        setTree({ ...current });
      }
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

      if (actions && actions.length) {
        pushHistory();
        applyActions(actions);
      }

      setChat(prev => {
        const last = prev[prev.length - 1];
        if (last) {
          last.pending = false;
          last.text = reply || full.split(REPLY_MARK).join('').trim() || 'Done.';
          if (actions && actions.length) {
            last.actionsApplied = describeActions(actions);
          }
        }
        return [...prev];
      });

      if (actions && actions.length && tree) {
        setTimeout(() => fitView(), 50);
        addToast(describeActions(actions));
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
      'Description of "' + node.title + '": ' + (node.description || '(none — infer from the title)')
    ];
    if (siblings.length) lines.push('Existing sibling items (avoid duplicating): ' + siblings.join(', '));
    lines.push('');
    lines.push('Break down "' + node.title + '" into 3 to 5 concrete sub-items that flesh out its description. Respond with ONLY a JSON array, no commentary or markdown fences: [{"title":"...","description":"one concise sentence"}]');
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
      recomputeLayout(tree);
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
