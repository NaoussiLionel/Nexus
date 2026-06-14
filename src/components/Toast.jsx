import { useNexus } from '../store/NexusContext';

export default function ToastContainer() {
  const { toasts, removeToast } = useNexus();
  if (!toasts.length) return null;

  return (
    <div id="toastContainer">
      {toasts.map(t => (
        <div key={t.id} className={`toast${t.type === 'error' ? ' toast-error' : ''}`}>
          <span>{t.message}</span>
          {t.action && (
            <button className="toast-action" type="button" onClick={() => { t.action.onClick?.(); removeToast(t.id); }}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
