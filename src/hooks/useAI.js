import { useCallback } from 'react';
import { useNexus } from '../store/NexusContext';
import {
  makeNode, findNode, findParent, ancestorPath,
  positionNewNodes, buildTreeOutline,
} from '../utils/tree';
import { REPLY_MARK, ACTIONS_MARK, MAX_VISIBLE_DEPTH } from '../utils/constants';
import { geminiChat } from './useGemini';

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

async function tryAI(messages, opts) {
  if (typeof window.puter !== 'undefined' && window.puter.ai) {
    try { return await window.puter.ai.chat(messages, opts); } catch { /* fall through */ }
  }
  if (opts.apiKey) {
    try { return await geminiChat(messages, opts); } catch { /* fall through */ }
  }
  return null;
}

async function tryAISync(prompt, opts) {
  if (typeof window.puter !== 'undefined' && window.puter.ai) {
    try { return await window.puter.ai.chat(prompt, opts); } catch { /* fall through */ }
  }
  if (opts.apiKey) {
    try { return await geminiChat([{ role: 'user', content: prompt }], { ...opts, stream: false }); } catch { /* fall through */ }
  }
  return null;
}

export function useAI() {
  const {
    tree, setTree, chat, setChat, model, layout,
    pushHistory, persist, setBusy, addToast, fitView,
    setRecentlyAddedIds, setIsolatedId,
    setPendingActions,
    geminiKey,
  } = useNexus();

  const sendChatMessage = useCallback(async (userText) => {
    userText = (userText || '').trim();
    if (!userText) return;
    if ((typeof window.puter === 'undefined' || !window.puter.ai) && !geminiKey) {
      addToast('No AI available. Add a Gemini API key in sidebar settings, or try again later.', 'error');
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
        'You also use the W-Fragen (W-questions) framework to help the user think through their plan completely: Was (what), Wer (who), Wann (when), Wo (where), Warum (why), Wie (how), Wie viel (how much / budget). When the user is vague, ask or infer these dimensions and structure the tree around the gaps. Every branch should eventually answer one or more of these questions so the plan is concrete, not abstract.',
        '',
        'IMPORTANT \u2014 Always reply in the exact same language as the user\u2019s current message. If they write in French, reply in French; if English, reply in English. Never switch languages mid-conversation.',
        '',
        'Analyze the user\u2019s language, domain, and goals. Pick the most natural technique, apply its structure, and briefly name it in your reply. Be warm, clear, and human \u2014 talk like a thoughtful collaborator who\u2019s genuinely excited to help bring their idea to life. No robotic lists or jargon unless the user uses it first.',
        '',
        'CURRENT MAP:',
        outline,
        '',
        'Respond in exactly this two-part format and nothing else \u2014 no extra commentary outside these two markers:',
        REPLY_MARK,
        '<a short, warm reply (1-3 sentences, plain text) that names the technique you chose, what you did, and invites the next step. Natural language \u2014 like you\u2019re sitting next to them.>',
        ACTIONS_MARK,
        '<a JSON array of actions to apply to the map, or [] for none. Allowed action objects:',
        '{"type":"set_tree","tree":{"title":"...","description":"...","children":[{"title":"...","description":"...","children":[...]}]}}  (use ONLY to create the very first map, or to fully restructure it)',
        '{"type":"add_children","parentId":"<id from CURRENT MAP, or root>","children":[{"title":"...","description":"..."}]}',
        '{"type":"update_node","nodeId":"<id, or root>","title":"...","description":"..."}',
        '{"type":"delete_node","nodeId":"<id>"}',
        ']',
        '',
        'Every leaf node must be a clear, executable statement \u2014 something someone can actually do: "Design database schema", "Implement login endpoint", "Write unit tests for X". Avoid vague or abstract labels. Each node should resolve a concrete sub-task that brings the full project to life. Descriptions: one concise sentence explaining the how or why. Titles: 2-6 words, starting with a verb where possible. A new map starts with 1 core + 3-5 branches, each with 2-4 leaves. Reply in the same language the user is writing in.'
      ].join('\n');
    }

    setChat(prev => [...prev, { role: 'user', text: userText }]);
    const aiMsg = { role: 'ai', text: '', reasoning: '', pending: true };
    setChat(prev => [...prev, aiMsg]);
    setBusy(true);

    try {
      const sys = buildSystemPrompt();
      const msgHistory = chat.slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
      const messages = [{ role: 'system', content: sys }].concat(msgHistory, [{ role: 'user', content: userText }]);

      const resp = await tryAI(messages, { model, stream: true, apiKey: geminiKey });
      if (!resp) { throw new Error('All AI providers failed'); }
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
        setPendingActions({ actions, reply, layout });
      } else {
        setChat(prev => {
          const last = prev[prev.length - 1];
          if (last) { last.pending = false; last.text = reply || ''; }
          return [...prev];
        });
        persist();
      }
    } catch (err) {
      setChat(prev => {
        const last = prev[prev.length - 1];
        if (last) { last.pending = false; last.error = true; last.text = 'Connection error \u2014 ' + (err?.message || 'please try again.'); }
        return [...prev];
      });
      addToast('AI hit a snag: ' + (err?.message || 'try again in a moment'), 'error');
    } finally {
      setBusy(false);
    }
  }, [tree, chat, model, layout, setChat, setBusy, addToast, pushHistory, persist, setPendingActions, geminiKey]);

  const expandNodeAI = useCallback(async (nodeId) => {
    const node = findNode(tree, nodeId);
    if (!node) return;
    if ((typeof window.puter === 'undefined' || !window.puter.ai) && !geminiKey) {
      addToast('No AI available. Add a Gemini API key in sidebar settings, or try again later.', 'error');
      return;
    }
    setBusy(true);
    node.expanding = true;
    setTree({ ...tree });

    const recentMsgs = chat.filter(m => m.role === 'user').slice(-2).map(m => m.text);
    const langHint = recentMsgs.length ? ('The conversation is in the same language as these recent messages:\n' + recentMsgs.join('\n')) : 'Use the same language as the project title and existing nodes.';
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
    lines.push('IMPORTANT — ' + langHint);
    lines.push('');
    lines.push('Break down "' + node.title + '" into 3 to 5 concrete, actionable sub-items that bring it to life. Each must be something someone can actually do (e.g. "Design API schema", not "API design"). Respond with ONLY a JSON array, no commentary or markdown fences: [{"title":"...","description":"one concise sentence"}]');
    const prompt = lines.join('\n');

    try {
      const resp = await tryAISync(prompt, { model, apiKey: geminiKey });
      if (!resp) throw new Error('All AI providers failed');
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
      if (node.depth >= MAX_VISIBLE_DEPTH - 1) {
        setIsolatedId(node.id);
      }
      positionNewNodes(node);
      setRecentlyAddedIds(newIds);
      setTree({ ...tree });
      setTimeout(() => { fitView(); }, 50);
      persist();
      addToast('Added ' + items.length + ' idea(s) to "' + node.title + '"');
      setTimeout(() => { setRecentlyAddedIds(new Set()); }, 1100);
    } catch (err) {
      addToast('AI hit a snag: ' + (err?.message || 'try again in a moment'), 'error');
    } finally {
      node.expanding = false;
      setBusy(false);
      setTree({ ...tree });
    }
  }, [tree, chat, model, setTree, setBusy, addToast, pushHistory, persist, fitView, setRecentlyAddedIds, setIsolatedId, geminiKey]);

  const elaborateNodeAI = useCallback(async (nodeId, onContent) => {
    const node = findNode(tree, nodeId);
    if (!node) return;
    if ((typeof window.puter === 'undefined' || !window.puter.ai) && !geminiKey) {
      addToast('No AI available. Add a Gemini API key in sidebar settings, or try again later.', 'error');
      return;
    }
    setBusy(true);

    const recentMsgs = chat.filter(m => m.role === 'user').slice(-2).map(m => m.text);
    const langHint = recentMsgs.length ? ('The conversation is in the same language as these recent messages:\n' + recentMsgs.join('\n')) : 'Use the same language as the project title and existing nodes.';
    const path = ancestorPath(tree, node).join(' \u203A ');
    const prompt = [
      'Project: "' + tree.title + '"',
      'Component: ' + path,
      'Existing notes: ' + (node.description || '(none yet)'),
      '',
      'IMPORTANT \u2014 ' + langHint,
      '',
      'Write a focused elaboration for "' + node.title + '" as plain markdown: one short paragraph, then 3-5 bullet points covering concrete deliverables, considerations, or next steps. No heading, no preamble, no markdown fences.',
    ].join('\n');

    try {
      const resp = await tryAI([{ role: 'user', content: prompt }], { model, stream: true, apiKey: geminiKey });
      if (!resp) throw new Error('All AI providers failed');
      let full = '';
      for await (const part of resp) {
        if (part?.text) { full += part.text; onContent(full); }
      }
      if (!full.trim()) throw new Error('empty response');
    } catch (err) {
      addToast('AI hit a snag: ' + (err?.message || 'try again in a moment'), 'error');
    } finally {
      setBusy(false);
    }
  }, [tree, chat, model, setBusy, addToast, geminiKey]);

  return { sendChatMessage, expandNodeAI, elaborateNodeAI };
}
