import { X } from 'lucide-react';
import { useNexus } from '../store/NexusContext';

export default function ToastContainer() {
  const { toasts, removeToast } = useNexus();
  if (!toasts.length) return null;

  return (
    <div id="toastContainer" role="status" aria-live="polite" aria-label="Notifications">
      {toasts.map(t => (
        <div key={t.id} className={`toast${t.type === 'error' ? ' toast-error' : ''}`}>
          <span>{t.message}</span>
          <div style={{ display:'flex', alignItems:'center', gap:'4px', flexShrink:0 }}>
            {t.action && (
              <button className="toast-action" type="button" onClick={() => { t.action.onClick?.(); removeToast(t.id); }}>
                {t.action.label}
              </button>
            )}
            <button className="toast-dismiss" type="button" aria-label="Dismiss notification" onClick={() => removeToast(t.id)}>
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
