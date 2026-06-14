import { useCallback, useRef, useEffect, useState } from 'react';
import { useNexus } from '../store/NexusContext';
import { useAI } from '../hooks/useAI';
import { MODELS, SUGGESTIONS } from '../utils/constants';
import { escapeHtml, renderInline } from '../utils/helpers';
import { Compass, User, Brain, ChevronRight, GitCommitHorizontal, Send, X } from 'lucide-react';

export default function Sidebar() {
  const { tree, chat, model, setModel, busy, persist } = useNexus();
  const { sendChatMessage } = useAI();
  const inputRef = useRef(null);
  const [input, setInput] = useState('');
  const showSuggestions = !tree && chat.filter(m => m.role === 'user').length === 0;

  const handleSend = useCallback((text) => {
    const msg = (text || input).trim();
    if (!msg || busy) return;
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    sendChatMessage(msg);
  }, [input, busy, sendChatMessage]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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

  return (
    <aside className="sidebar" id="sidebar">
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
        <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
          <select
            className="model-select"
            value={model}
            onChange={(e) => { setModel(e.target.value); persist(); }}
          >
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <button className="icon-btn" title="Hide sidebar" onClick={() => {
            if (window.innerWidth <= 1100) {
              document.body.classList.remove('sidebar-open');
            } else {
              document.body.classList.toggle('sidebar-hidden');
            }
          }}>
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="chat-messages" id="chatMessages">
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
                <span dangerouslySetInnerHTML={{ __html: renderInline(msg.text || '') }} />
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

      <div className="suggestions" id="suggestions" hidden={!showSuggestions}>
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            type="button"
            className="suggestion-chip"
            onClick={() => handleSend(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <form
        className="chat-input-area"
        id="chatForm"
        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
      >
        <textarea
          id="chatInput"
          ref={inputRef}
          rows={1}
          placeholder="Describe your project, or ask for changes\u2026"
          disabled={busy}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" className="send-btn" id="sendBtn" disabled={busy || !input.trim()}>
          <Send size={17} />
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
      <button
        type="button"
        className={`reasoning-toggle${pending ? ' pulse' : ''}${open ? ' open' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <Brain size={12} />
        <span>{pending ? 'Thinking\u2026' : 'Reasoning'}</span>
        <ChevronRight size={12} className="chev" />
      </button>
      <div className="reasoning-content" hidden={!open}>
        {escapeHtml(reasoning)}
      </div>
    </div>
  );
}
