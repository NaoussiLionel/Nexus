import { describe, it, expect } from 'vitest';
import { makeNode, findNode, findParent, removeNodeFromTree, countDescendants, maxDepth, getVisibleIds, normalizeTree, stripForExport, recomputeLayout } from '../tree';

function sampleTree() {
  return {
    id: 'root',
    title: 'Project',
    description: '',
    depth: 0,
    collapsed: false,
    x: 200, y: 50,
    children: [
      {
        id: 'a',
        title: 'Phase A',
        description: 'First phase',
        depth: 1,
        collapsed: false,
        x: 100, y: 150,
        children: [
          { id: 'a1', title: 'Task A1', description: '', depth: 2, collapsed: false, x: 50, y: 250, children: [] },
          { id: 'a2', title: 'Task A2', description: '', depth: 2, collapsed: false, x: 150, y: 250, children: [] },
        ],
      },
      {
        id: 'b',
        title: 'Phase B',
        description: '',
        depth: 1,
        collapsed: true,
        x: 300, y: 150,
        children: [
          { id: 'b1', title: 'Task B1', description: '', depth: 2, collapsed: false, x: 300, y: 250, children: [] },
        ],
      },
    ],
  };
}

describe('makeNode', () => {
  it('creates a node with defaults', () => {
    const n = makeNode('Test', 'desc', 1);
    expect(n.title).toBe('Test');
    expect(n.description).toBe('desc');
    expect(n.depth).toBe(1);
    expect(n.collapsed).toBe(false);
    expect(Array.isArray(n.children)).toBe(true);
    expect(n.children).toHaveLength(0);
  });
});

describe('findNode', () => {
  it('finds node by id', () => {
    const tree = sampleTree();
    expect(findNode(tree, 'a1').title).toBe('Task A1');
  });

  it('returns null for missing id', () => {
    expect(findNode(sampleTree(), 'nonexistent')).toBeNull();
  });

  it('returns root for "root"', () => {
    expect(findNode(sampleTree(), 'root').title).toBe('Project');
  });
});

describe('findParent', () => {
  it('finds parent of a child', () => {
    const tree = sampleTree();
    expect(findParent(tree, 'a1').id).toBe('a');
  });

  it('returns null for root', () => {
    expect(findParent(sampleTree(), 'root')).toBeNull();
  });
});

describe('removeNodeFromTree', () => {
  it('removes a child node', () => {
    const tree = sampleTree();
    removeNodeFromTree(tree, 'a1');
    expect(findNode(tree, 'a1')).toBeNull();
    expect(tree.children[0].children).toHaveLength(1);
  });
});

describe('countDescendants', () => {
  it('counts all descendants', () => {
    expect(countDescendants(sampleTree())).toBe(4);
  });
});

describe('maxDepth', () => {
  it('returns max depth in tree', () => {
    expect(maxDepth(sampleTree())).toBe(2);
  });
});

describe('getVisibleIds', () => {
  it('includes all non-collapsed nodes', () => {
    const tree = sampleTree();
    const ids = getVisibleIds(tree, null);
    expect(ids.has('root')).toBe(true);
    expect(ids.has('a')).toBe(true);
    expect(ids.has('a1')).toBe(true);
    expect(ids.has('a2')).toBe(true);
    expect(ids.has('b')).toBe(true);
    expect(ids.has('b1')).toBe(false);
  });
});

describe('normalizeTree', () => {
  it('normalizes raw input', () => {
    const raw = { title: 'Test', description: 'desc', children: [{ title: 'Child' }] };
    const t = normalizeTree(raw, 0);
    expect(t.title).toBe('Test');
    expect(t.depth).toBe(0);
    expect(t.children).toHaveLength(1);
    expect(t.children[0].depth).toBe(1);
  });
});

describe('stripForExport', () => {
  it('strips runtime fields', () => {
    const stripped = stripForExport(sampleTree());
    expect(stripped.id).toBeUndefined();
    expect(stripped.x).toBeUndefined();
    expect(stripped.y).toBeUndefined();
    expect(stripped.collapsed).toBeUndefined();
    expect(stripped.title).toBe('Project');
  });
});

describe('recomputeLayout', () => {
  it('does not throw for any layout type', () => {
    const tree = makeNode('Test', '', 0);
    tree.children.push(makeNode('Child', '', 1));
    expect(() => recomputeLayout(tree, 'tree')).not.toThrow();
    expect(() => recomputeLayout(tree, 'root')).not.toThrow();
    expect(() => recomputeLayout(tree, 'two-sided')).not.toThrow();
    expect(() => recomputeLayout(tree, 'star')).not.toThrow();
  });
});
