import { useEffect, useRef } from 'react';
import { useNexus } from '../store/NexusContext';

function actionSummary(actions) {
  const counts = {};
  actions.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1; });
  const parts = [];
  if (counts.set_tree) parts.push('Draft new map');
  if (counts.add_children) parts.push('Add ' + counts.add_children + ' item(s)');
  if (counts.update_node) parts.push('Update ' + counts.update_node + ' node(s)');
  if (counts.delete_node) parts.push('Delete ' + counts.delete_node + ' node(s)');
  return parts;
}

export default function ConfirmDialog() {
  const { pendingActions, confirmPendingActions, cancelPendingActions } = useNexus();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!pendingActions) return;
    const el = dialogRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll('button');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();
    function onKeyDown(e) {
      if (e.key === 'Escape') { cancelPendingActions(); return; }
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pendingActions, cancelPendingActions]);

  if (!pendingActions) return null;

  const items = actionSummary(pendingActions.actions);

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Confirm AI changes" onClick={cancelPendingActions}>
      <div className="confirm-dialog" ref={dialogRef} onClick={e => e.stopPropagation()}>
        <div className="confirm-header">Apply AI changes?</div>
        <div className="confirm-body">
          {items.map((item, i) => (
            <span key={i} className="confirm-action">{item}</span>
          ))}
        </div>
        <div className="confirm-footer">
          <button className="btn-ghost" aria-label="Cancel changes" onClick={cancelPendingActions}>Cancel</button>
          <button className="btn-primary" aria-label="Apply changes" onClick={confirmPendingActions}>Apply</button>
        </div>
      </div>
    </div>
  );
}