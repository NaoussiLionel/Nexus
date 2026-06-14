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
  if (!pendingActions) return null;

  const items = actionSummary(pendingActions.actions);

  return (
    <div className="confirm-overlay" onClick={cancelPendingActions}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="confirm-header">Apply AI changes?</div>
        <div className="confirm-body">
          {items.map((item, i) => (
            <span key={i} className="confirm-action">{item}</span>
          ))}
        </div>
        <div className="confirm-footer">
          <button className="btn-ghost" onClick={cancelPendingActions}>Cancel</button>
          <button className="btn-primary" onClick={confirmPendingActions}>Apply</button>
        </div>
      </div>
    </div>
  );
}
