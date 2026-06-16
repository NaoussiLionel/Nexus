import { Component } from 'react';
import { Compass } from 'lucide-react';
import { logError } from '../utils/helpers';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    logError('ErrorBoundary', { message: error?.message, stack: error?.stack, componentStack: info?.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          height:'100vh', background:'var(--bp-900)', color:'var(--ink)', textAlign:'center', padding:'24px'
        }}>
          <div style={{
            width:'56px', height:'56px', borderRadius:'14px', background:'rgba(224,164,88,0.12)',
            border:'1px solid rgba(224,164,88,0.3)', display:'flex', alignItems:'center', justifyContent:'center',
            color:'var(--brass)', marginBottom:'20px'
          }}>
            <Compass size={28} />
          </div>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:'1.2rem', margin:'0 0 8px', fontWeight:600 }}>Something went wrong</h2>
          <p style={{ color:'var(--ink-dim)', fontSize:'.85rem', maxWidth:'360px', lineHeight:1.5, margin:'0 0 24px' }}>
            The canvas encountered an unexpected error. Your last changes are safe — refresh to continue.
          </p>
          <button
            className="btn-primary"
            style={{ height:'42px', padding:'0 24px', fontSize:'.85rem' }}
            onClick={() => window.location.reload()}
          >
            Reload the app
          </button>
          {this.state.error && (
            <details style={{ marginTop:'20px', fontSize:'.7rem', color:'var(--ink-faint)', maxWidth:'500px', textAlign:'left' }}>
              <summary style={{ cursor:'pointer', fontFamily:'var(--font-mono)' }}>Error details</summary>
              <pre style={{ marginTop:'8px', padding:'8px', background:'var(--bp-800)', borderRadius:'6px', overflow:'auto', fontFamily:'var(--font-mono)', whiteSpace:'pre-wrap' }}>
                {this.state.error.stack || this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
