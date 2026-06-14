import { useMemo } from 'react';
import { useNexus } from '../store/NexusContext';
import { findNode, findParent, getVisibleIds } from '../utils/tree';
import { nodeHeight } from '../utils/helpers';

export default function Connectors() {
  const { tree, isolatedId } = useNexus();

  const paths = useMemo(() => {
    if (!tree) return [];
    const visible = getVisibleIds(tree, isolatedId);
    const result = [];

    visible.forEach(id => {
      const node = findNode(tree, id);
      if (!node) return;
      const parent = findParent(tree, id);
      if (!parent || !visible.has(parent.id)) return;
      const ph = nodeHeight(parent.depth);
      const x1 = parent.x, y1 = parent.y + ph;
      const x2 = node.x, y2 = node.y;
      const midY = (y1 + y2) / 2;
      result.push(
        <path key={`conn-${id}`} className="connector" d={`M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`} />,
        <circle key={`dot1-${id}`} className="connector-dot" cx={x1} cy={y1} r="2.5" />,
        <circle key={`dot2-${id}`} className="connector-dot" cx={x2} cy={y2} r="2.5" />
      );
    });
    return result;
  }, [tree, isolatedId]);

  return paths;
}
