import { useCallback, useRef, useEffect, useState } from 'react';
import { useNexus } from '../store/NexusContext';
import { useAI } from '../hooks/useAI';
import { MODELS, SUGGESTIONS } from '../utils/constants';
import { escapeHtml, renderInline } from '../utils/helpers';
import { Compass, User, Brain, ChevronRight, GitCommitHorizontal, Send, LoaderCircle, X, Settings, KeyRound, Globe, Cpu } from 'lucide-react';

export default function Sidebar() {
  const { tree, chat, model, setModel, busy, persist, geminiKey, setGeminiKey, provider, setProvider, customModel, setCustomModel, addToast } = useNexus();
  const { sendChatMessage } = useAI();
  const inputRef = useRef(null);
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [keyInput, setKeyInput] = useState('');
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
        <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
          {provider === 'puter' ? (
            <select
              className="model-select"
              aria-label="AI model"
              value={model}
              onChange={(e) => { setModel(e.target.value); persist(); }}
            >
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          ) : (
            <span className="settings-hint" style={{ fontSize:'.65rem', color:'var(--ink-faint)', padding:'0 6px' }}>Custom: {customModel}</span>
          )}
          <button className={`icon-btn${showSettings ? ' active' : ''}`} aria-label="API settings" onClick={() => { setShowSettings(!showSettings); if (!showSettings) setKeyInput(geminiKey); }}>
            <Settings size={15} />
          </button>
          <button className="icon-btn" aria-label="Hide sidebar" onClick={() => {
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

      {showSettings && (
        <div className="sidebar-settings">
          <div className="settings-row">
            <Globe size={13} />
            <span>Provider</span>
          </div>
          <div className="settings-row provider-toggle">
            <button
              className={`btn-ghost toggle-btn${provider === 'puter' ? ' active' : ''}`}
              onClick={() => setProvider('puter')}
            ><Cpu size={13} /> Puter.ai</button>
            <button
              className={`btn-ghost toggle-btn${provider === 'custom' ? ' active' : ''}`}
              onClick={() => setProvider('custom')}
            ><KeyRound size={13} /> Custom API</button>
          </div>

          {provider === 'custom' && (
            <>
              <div className="settings-row">
                <Cpu size={13} />
                <span>Model</span>
              </div>
              <div className="settings-row">
                <input
                  className="settings-input"
                  type="text"
                  placeholder="gemini-2.5-flash, gpt-4o, \u2026"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value.trim())}
                />
              </div>
            </>
          )}

          <div className="settings-row">
            <KeyRound size={13} />
            <span>API Key {provider === 'custom' ? '(required)' : '(optional \u2014 fallback)'}</span>
          </div>
          <div className="settings-row">
            <input
              className="settings-input"
              type="password"
              placeholder={provider === 'custom' ? 'Paste your API key\u2026' : 'Paste your Gemini API key\u2026'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button
              className="btn-ghost settings-save"
              disabled={!keyInput.trim()}
              onClick={() => { setGeminiKey(keyInput.trim()); addToast('API key saved'); }}
            >Save</button>
          </div>
          {geminiKey && (
            <div className="settings-row">
              <button className="btn-ghost" style={{ color:'var(--ink-faint)', fontSize:'.7rem' }} onClick={() => { setGeminiKey(''); setKeyInput(''); }}>Clear key</button>
              <span className="settings-hint">Key saved. {provider === 'custom' ? 'Used for all API calls.' : 'AI will fall back to Gemini when puter.ai is unavailable.'}</span>
            </div>
          )}
        </div>
      )}
      <div className="chat-messages" id="chatMessages" role="log" aria-live="polite" aria-label="Chat messages">
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
