export function SidebarSkeleton() {
  return (
    <aside className="sidebar" style={{ width: '380px', opacity: 0.7, pointerEvents: 'none' }}>
      <div className="sidebar-header">
        <div className="sidebar-title">
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bp-600)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ width: 100, height: 14, borderRadius: 4, background: 'var(--bp-600)', marginBottom: 4 }} />
            <div style={{ width: 140, height: 10, borderRadius: 4, background: 'var(--bp-650)' }} />
          </div>
        </div>
      </div>
      <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--bp-600)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ width: '80%', height: 12, borderRadius: 4, background: 'var(--bp-650)', marginBottom: 6 }} />
              <div style={{ width: '60%', height: 10, borderRadius: 4, background: 'var(--bp-650)' }} />
            </div>
          </div>
        ))}
      </div>
      <div className="chat-input-area" style={{ padding: '12px' }}>
        <div style={{ flex: 1, height: 42, borderRadius: 10, background: 'var(--bp-650)' }} />
        <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--bp-600)' }} />
      </div>
    </aside>
  );
}

export function DrawerSkeleton() {
  return (
    <div className="details-drawer open" style={{ pointerEvents: 'none' }}>
      <div className="drawer-inner">
        <div className="drawer-header">
          <div style={{ width: '60%', height: 12, borderRadius: 4, background: 'var(--bp-600)' }} />
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--bp-600)' }} />
        </div>
        <div className="drawer-body">
          <div>
            <div style={{ width: 40, height: 10, borderRadius: 4, background: 'var(--bp-650)', marginBottom: 6 }} />
            <div style={{ width: '100%', height: 40, borderRadius: 8, background: 'var(--bp-650)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ width: 50, height: 10, borderRadius: 4, background: 'var(--bp-650)', marginBottom: 6 }} />
            <div style={{ width: '100%', height: 200, borderRadius: 8, background: 'var(--bp-650)' }} />
          </div>
        </div>
        <div className="drawer-footer">
          <div style={{ flex: 1, height: 36, borderRadius: 8, background: 'var(--bp-650)' }} />
          <div style={{ flex: 1, height: 36, borderRadius: 8, background: 'var(--bp-600)' }} />
        </div>
      </div>
    </div>
  );
}

export function ToastSkeleton() {
  return null;
}
