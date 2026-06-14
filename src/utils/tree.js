import { generateId, nodeWidth, nodeHeight, truncate } from './helpers';
import { H_GAP, ROW_GAP } from './constants';

export function makeNode(title, description, depth) {
  return {
    id: generateId(),
    title: (title || '').trim() || (depth === 0 ? 'Untitled project' : 'Untitled'),
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

export function layoutNode(node, leftX) {
  const w = computeWidth(node);
  node.x = leftX + w / 2;
  node.y = getRowY(node.depth);
  if (!node.collapsed && node.children?.length) {
    const childrenTotal = node.children.reduce((a, c) => a + computeWidth(c), 0) + H_GAP * (node.children.length - 1);
    let cx = leftX + (w - childrenTotal) / 2;
    node.children.forEach(c => { const cw = computeWidth(c); layoutNode(c, cx); cx += cw + H_GAP; });
  }
}

export function recomputeLayout(tree) {
  if (!tree) return;
  layoutNode(tree, 0);
}

export function placeNewChildren(parent) {
  const rowY = getRowY(parent.depth + 1);
  const w = nodeWidth(parent.depth + 1);
  const newOnes = (parent.children || []).filter(c => c.x == null);
  if (!newOnes.length) return;
  const totalW = newOnes.length * w + (newOnes.length - 1) * H_GAP;
  let startX = parent.x - totalW / 2;
  newOnes.forEach(c => { c.x = startX + w / 2; c.y = rowY; startX += w + H_GAP; });
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
