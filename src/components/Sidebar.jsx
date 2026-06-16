import { useCallback, useRef, useEffect, useState } from 'react';
import { useNexus } from '../store/NexusContext';
import { useAI } from '../hooks/useAI';
import { MODELS, SUGGESTIONS } from '../utils/constants';
import { escapeHtml, renderInline } from '../utils/helpers';
import {
  Compass, User, Brain, ChevronRight, GitCommitHorizontal, Send, LoaderCircle, X
} from 'lucide-react';

export default function Sidebar() {
  const { tree, chat, setChat, model, setModel, busy, persist, provider, customModel, sidebarWidth, setSidebarWidth } = useNexus();
  const { sendChatMessage } = useAI();
  const inputRef = useRef(null);
  const [input, setInput] = useState('');
  const resizeRef = useRef(null);
  const showSuggestions = !tree && chat.filter(m => m.role === 'user').length === 0;

  const handleSend = useCallback((text) => {
    const msg = (text || input).trim();
    if (!msg || busy) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    sendChatMessage(msg);
  }, [input, busy, sendChatMessage]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handleInput = useCallback((e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px';
  }, []);

  useEffect(() => {
    const el = document.getElementById('chatMessages');
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  useEffect(() => {
    const el = document.getElementById('sidebar');
    if (el) el.style.width = sidebarWidth + 'px';
  }, [sidebarWidth]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev) => {
      const newW = Math.max(280, Math.min(600, startW + (startX - ev.clientX)));
      setSidebarWidth(newW);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [sidebarWidth, setSidebarWidth]);

  const handleCheckboxToggle = useCallback((e) => {
    const cb = e.target.closest('.chat-checkbox input[type="checkbox"]');
    if (!cb) return;
    const msgIdx = parseInt(cb.dataset.msg);
    if (isNaN(msgIdx)) return;
    setChat(prev => {
      if (!prev[msgIdx]) return prev;
      const boxes = prev[msgIdx].checkboxes ? [...prev[msgIdx].checkboxes] : [];
      boxes[cb.dataset.idx || 0] = cb.checked;
      const updated = { ...prev[msgIdx], checkboxes: boxes };
      const copy = [...prev];
      copy[msgIdx] = updated;
      return copy;
    });
  }, [setChat]);

  return (
    <aside className="sidebar" id="sidebar">
      <div className="sidebar-resize-handle" ref={resizeRef} onPointerDown={handleResizeStart} />
      <div className="sidebar-header">
        <div className="sidebar-title">
          <div>
            <Compass size={16} />
            <span className="status-dot" id="aiStatusDot" />
          </div>
          <div>
            <h3>AI Architect</h3>
            <p>Your thinking partner</p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
          {provider === 'puter' ? (
            <select className="model-select" aria-label="AI model" value={model} onChange={(e) => { setModel(e.target.value); persist(); }}>
              {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          ) : (
            <span className="settings-hint" style={{ fontSize:'.65rem', color:'var(--ink-faint)', padding:'0 6px' }}>Custom: {customModel}</span>
          )}
          <button className="icon-btn" aria-label="Hide AI chat panel" title="Hide AI chat" onClick={() => {
            if (window.innerWidth <= 1100) document.body.classList.remove('sidebar-open');
            else document.body.classList.toggle('sidebar-hidden');
          }}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="chat-messages" id="chatMessages" role="log" aria-live="polite" aria-label="Chat messages" onClick={handleCheckboxToggle}>
        {chat.length === 0 && (
          <div className="msg msg-ai" style={{ animation:'none', marginTop:'8px' }}>
            <div className="msg-avatar"><Compass size={14} /></div>
            <div className="msg-bubble" style={{ background:'transparent', border:'1px dashed var(--bp-600)', color:'var(--ink-faint)', fontSize:'.78rem', textAlign:'center', padding:'20px 16px' }}>
              <div style={{ fontWeight:600, color:'var(--ink-dim)', marginBottom:'6px', fontSize:'.85rem' }}>Welcome to Nexus Architect</div>
              <div style={{ lineHeight:1.6 }}>Describe your project idea below, and I&apos;ll help you structure it into a clear plan. Try a suggestion to get started, or just type whatever&apos;s on your mind.</div>
            </div>
          </div>
        )}
        {chat.map((msg, _idx) => (
          <div key={_idx} className={`msg ${msg.role === 'user' ? 'msg-user' : 'msg-ai'}`}>
            <div className="msg-avatar">
              {msg.role === 'user' ? <User size={14} /> : <Compass size={14} />}
            </div>
            <div className={`msg-bubble${msg.error ? ' error' : ''}`}>
              {msg.role === 'ai' && msg.reasoning && (
                <ReasoningBlock reasoning={msg.reasoning} pending={msg.pending} />
              )}
              {msg.pending && !msg.text ? (
                <span className="typing-dots"><span></span><span></span><span></span></span>
              ) : (
                <span dangerouslySetInnerHTML={{ __html: renderInline(msg.text || '', _idx, msg.checkboxes) }} />
              )}
              {msg.actionsApplied && (
                <div className="msg-actions-applied">
                  <GitCommitHorizontal size={12} />
                  <span>{msg.actionsApplied}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showSuggestions && (
        <div className="suggestions" id="suggestions">
          {SUGGESTIONS.map(s => (
            <button key={s} type="button" className="suggestion-chip" onClick={() => handleSend(s)}>{s}</button>
          ))}
        </div>
      )}

      <form className="chat-input-area" id="chatForm" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
        <textarea
          id="chatInput" ref={inputRef} rows={1}
          placeholder="Describe your project, or ask for changes\u2026"
          disabled={busy} value={input} onChange={handleInput} onKeyDown={handleKeyDown}
        />
        <button type="submit" className={`send-btn${busy ? ' btn-loading' : ''}`} id="sendBtn" aria-label="Send message" disabled={busy || !input.trim()}>
          {busy ? <LoaderCircle size={17} className="spinner" /> : <Send size={17} />}
        </button>
      </form>
      <div className="hint-line">Enter to send \u00B7 Shift+Enter for a new line</div>
    </aside>
  );
}

function ReasoningBlock({ reasoning, pending }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="reasoning-block">
      <button type="button" className={`reasoning-toggle${pending ? ' pulse' : ''}${open ? ' open' : ''}`} onClick={() => setOpen(!open)}>
        <Brain size={12} />
        <span>{pending ? 'Thinking\u2026' : 'Reasoning'}</span>
        <ChevronRight size={12} className="chev" />
      </button>
      <div className="reasoning-content" hidden={!open}>{escapeHtml(reasoning)}</div>
    </div>
  );
}
