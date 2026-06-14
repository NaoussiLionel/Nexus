import { generateId, nodeWidth, nodeHeight, truncate } from './helpers';
import { H_GAP, ROW_GAP, MAX_VISIBLE_DEPTH } from './constants';

export function makeNode(title, description, depth) {
  return {
    id: generateId(),
    title: (title || '').trim() || (depth === 0 ? 'New project' : 'New idea'),
    description: (description || '').trim(),
    depth, collapsed: false, x: null, y: null, children: []
  };
}

export function normalizeTree(raw, depth = 0) {
  const children = Array.isArray(raw?.children) ? raw.children : [];
  return {
    id: generateId(),
    title: (raw?.title ? String(raw.title) : (depth === 0 ? 'Untitled project' : 'Untitled')).trim() || 'Untitled',
    description: (raw?.description ? String(raw.description) : '').trim(),
    depth, collapsed: false, x: null, y: null,
    children: children.slice(0, 8).map(c => normalizeTree(c, depth + 1))
  };
}

export function rebuildNodeMap(tree) {
  const map = new Map();
  if (!tree) return map;
  (function walk(n) { map.set(n.id, n); (n.children || []).forEach(walk); })(tree);
  return map;
}

export function findNode(tree, id) {
  if (!tree) return null;
  if (id === 'root') return tree;
  let found = null;
  (function walk(n) {
    if (n.id === id) { found = n; return; }
    if (!found && n.children) n.children.some(c => { walk(c); return found; });
  })(tree);
  return found;
}

export function findParent(tree, id) {
  if (!tree || tree.id === id) return null;
  let found = null;
  (function walk(n) {
    if (!n.children) return;
    n.children.some(c => {
      if (c.id === id) { found = n; return true; }
      walk(c);
      return found;
    });
  })(tree);
  return found;
}

export function removeNodeFromTree(tree, id) {
  const parent = findParent(tree, id);
  if (!parent) return;
  parent.children = (parent.children || []).filter(c => c.id !== id);
}

export function countDescendants(node) {
  let c = 0;
  (node.children || []).forEach(ch => { c += 1 + countDescendants(ch); });
  return c;
}

export function maxDepth(node) {
  if (!node.children?.length) return node.depth;
  return Math.max(...node.children.map(maxDepth));
}

export function assignCodes(node, prefix) {
  (node.children || []).forEach((c, i) => {
    c.code = prefix ? `${prefix}.${i + 1}` : String(i + 1);
    assignCodes(c, c.code);
  });
}

export function ancestorPath(tree, node) {
  const path = [];
  let cur = node;
  while (cur) { path.unshift(cur.title); cur = findParent(tree, cur.id); }
  return path;
}

export function getRowY(depth) {
  let y = 0;
  for (let d = 0; d < depth; d++) y += nodeHeight(d) + ROW_GAP;
  return y;
}

function computeWidth(node) {
  if (node.collapsed || !node.children?.length) return nodeWidth(node.depth);
  const childWidths = node.children.map(computeWidth);
  const total = childWidths.reduce((a, b) => a + b, 0) + H_GAP * (node.children.length - 1);
  return Math.max(nodeWidth(node.depth), total);
}

export function layoutTree(node, leftX) {
  const w = computeWidth(node);
  node.x = leftX + w / 2;
  node.y = getRowY(node.depth);
  if (!node.collapsed && node.children?.length) {
    const childrenTotal = node.children.reduce((a, c) => a + computeWidth(c), 0) + H_GAP * (node.children.length - 1);
    let cx = leftX + (w - childrenTotal) / 2;
    node.children.forEach(c => { const cw = computeWidth(c); layoutTree(c, cx); cx += cw + H_GAP; });
  }
}

function subtreeHeight(node) {
  if (!node.children?.length || node.collapsed) return nodeHeight(node.depth) + ROW_GAP;
  return node.children.reduce((s, c) => s + subtreeHeight(c), 0);
}

export function layoutRoot(node, x, y) {
  const w = nodeWidth(node.depth);
  const h = nodeHeight(node.depth);
  node.x = x + w / 2;
  node.y = y - h / 2;
  if (!node.collapsed && node.children?.length) {
    const childX = x + w + H_GAP * 2;
    const heights = node.children.map(c => subtreeHeight(c));
    const totalH = heights.reduce((a, b) => a + b, 0);
    let cy = y - totalH / 2;
    node.children.forEach((c, i) => {
      const ch = heights[i];
      layoutRoot(c, childX, cy + ch / 2);
      cy += ch;
    });
  }
}

export function layoutTwoSided(node, x, y) {
  const w = nodeWidth(node.depth);
  const h = nodeHeight(node.depth);
  node.x = x + w / 2;
  node.y = y - h / 2;
  if (!node.collapsed && node.children?.length) {
    const mid = Math.ceil(node.children.length / 2);
    const left = node.children.slice(0, mid);
    const right = node.children.slice(mid);
    const heights = node.children.map(c => subtreeHeight(c));
    const leftH = heights.slice(0, mid);
    const rightH = heights.slice(mid);
    const leftTotal = leftH.reduce((a, b) => a + b, 0);
    const rightTotal = rightH.reduce((a, b) => a + b, 0);
    const gap = H_GAP * 2 + w / 2;
    let ly = y - leftTotal / 2;
    left.forEach((c, i) => {
      const ch = leftH[i];
      layoutRoot(c, x + w / 2 - gap - nodeWidth(c.depth), ly + ch / 2);
      ly += ch;
    });
    let ry = y - rightTotal / 2;
    right.forEach((c, i) => {
      const ch = rightH[i];
      layoutRoot(c, x + w / 2 + gap, ry + ch / 2);
      ry += ch;
    });
  }
}

export function layoutStar(node, cx, cy, level, angleCenter, angleSpan) {
  node.x = cx;
  node.y = cy - nodeHeight(node.depth) / 2;
  if (!node.collapsed && node.children?.length) {
    const n = node.children.length;
    const r = H_GAP * 3 + nodeWidth(node.depth);
    const childR = r + level * H_GAP * 2.5;
    const childSpan = angleSpan / n;
    const startAngle = angleCenter - angleSpan / 2;
    node.children.forEach((c, i) => {
      const a = startAngle + childSpan * (i + 0.5);
      const childCX = cx + childR * Math.cos(a);
      const childCY = cy + childR * Math.sin(a);
      layoutStar(c, childCX, childCY, level + 1, a, childSpan);
    });
  }
}

export function recomputeLayout(tree, layout) {
  if (!tree) return;
  switch (layout) {
    case 'root':
      layoutRoot(tree, 0, 200);
      break;
    case 'two-sided':
      layoutTwoSided(tree, 0, 200);
      break;
    case 'star':
      layoutStar(tree, 0, 200, 0, 0, 2 * Math.PI);
      break;
    default:
      layoutTree(tree, 0);
  }
}

export function positionNewNodes(parent) {
  const newOnes = (parent.children || []).filter(c => c.x == null);
  if (!newOnes.length) return;
  const total = newOnes.length;
  const w = nodeWidth(parent.depth + 1);
  const totalW = total * w + (total - 1) * H_GAP;
  const y = parent.y + nodeHeight(parent.depth) + ROW_GAP;
  let x = parent.x - totalW / 2;
  newOnes.forEach(c => {
    c.x = x + w / 2;
    c.y = y;
    x += w + H_GAP;
  });
}

export function getVisibleIds(tree, isolatedId) {
  const set = new Set();
  let root = tree;
  if (isolatedId) {
    const n = findNode(tree, isolatedId);
    if (n) root = n;
  }
  if (!root) return set;
  (function walk(n) { set.add(n.id); if (!n.collapsed) (n.children || []).forEach(walk); })(root);
  return set;
}

export function stripForExport(node) {
  return {
    title: node.title,
    description: node.description,
    children: (node.children || []).map(stripForExport)
  };
}

export function buildTreeOutline(node, depth) {
  depth = depth || 0;
  const indent = '  '.repeat(depth);
  const desc = node.description ? (' :: ' + truncate(node.description, 80)) : '';
  let lines = [indent + '- [' + node.id + '] ' + node.title + desc];
  (node.children || []).forEach(c => { lines = lines.concat(buildTreeOutline(c, depth + 1)); });
  return lines;
}

export function applyActions(tree, actions, layout) {
  let current = tree;
  let replaced = false;
  let newIsolatedId = null;
  actions.forEach(act => {
    if (!act || typeof act !== 'object') return;
    switch (act.type) {
      case 'set_tree':
        if (act.tree) {
          const t = normalizeTree(act.tree, 0);
          recomputeLayout(t, layout);
          current = t;
          replaced = true;
        }
        break;
      case 'add_children': {
        const parent = act.parentId === 'root' ? current : findNode(current, act.parentId);
        if (parent && Array.isArray(act.children) && act.children.length) {
          parent.children = parent.children || [];
          act.children.slice(0, 6).forEach(c => {
            parent.children.push(makeNode(c?.title, c?.description, parent.depth + 1));
          });
          parent.collapsed = false;
          positionNewNodes(parent);
          if (parent.depth >= MAX_VISIBLE_DEPTH - 1 && parent.id !== 'root') {
            newIsolatedId = parent.id;
          }
        }
        break;
      }
      case 'update_node': {
        const n = act.nodeId === 'root' ? current : findNode(current, act.nodeId);
        if (n) {
          if (act.title) n.title = String(act.title).trim() || n.title;
          if (act.description !== undefined) n.description = String(act.description || '').trim();
        }
        break;
      }
      case 'delete_node':
        if (act.nodeId && act.nodeId !== 'root') removeNodeFromTree(current, act.nodeId);
        break;
    }
  });
  if (!current) current = tree;
  if (current && !replaced) current = { ...current };
  return { tree: current, isolatedId: newIsolatedId, replaced };
}

export function getBounds(root) {
  if (!root) return { minX: -300, minY: -150, maxX: 300, maxY: 150 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  (function walk(n) {
    const w = nodeWidth(n.depth), h = nodeHeight(n.depth);
    minX = Math.min(minX, n.x - w / 2); maxX = Math.max(maxX, n.x + w / 2);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + h);
    if (!n.collapsed) (n.children || []).forEach(walk);
  })(root);
  if (minX === Infinity) return { minX: -300, minY: -150, maxX: 300, maxY: 150 };
  return { minX, minY, maxX, maxY };
}
