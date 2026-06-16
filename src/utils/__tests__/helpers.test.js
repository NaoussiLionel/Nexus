import { describe, it, expect } from 'vitest';
import { escapeHtml, renderInline, sanitizeFilename, truncate, generateId, nodeWidth, nodeHeight } from '../helpers';

describe('escapeHtml', () => {
  it('escapes & < > " \'', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('handles null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('passes through safe strings', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('renderInline', () => {
  it('escapes HTML in text', () => {
    expect(renderInline('<script>alert(1)</script>')).not.toContain('<script>');
  });

  it('converts bold markers', () => {
    expect(renderInline('**hello**')).toContain('<strong>hello</strong>');
  });

  it('strips non-allowed tags', () => {
    const result = renderInline('<img src=x onerror=alert(1)> test');
    expect(result).not.toContain('<img');
    expect(result).not.toContain('onerror');
  });

  it('only allows http/https URLs', () => {
    const result = renderInline('[click](javascript:alert(1))');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('href="#"');
  });

  it('strips event handlers from links', () => {
    const result = renderInline('[click](https://example.com)');
    expect(result).not.toContain('onclick');
    expect(result).toContain('href="https://example.com"');
  });
});

describe('sanitizeFilename', () => {
  it('converts to lowercase slug', () => {
    expect(sanitizeFilename('My Project')).toBe('my-project');
  });

  it('handles edge cases', () => {
    expect(sanitizeFilename('')).toBe('project');
    expect(sanitizeFilename(null)).toBe('project');
  });
});

describe('truncate', () => {
  it('truncates long strings', () => {
    expect(truncate('hello world', 5)).toHaveLength(5);
  });

  it('returns short strings as-is', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });
});

describe('generateId', () => {
  it('includes the prefix', () => {
    expect(generateId('n').startsWith('n')).toBe(true);
  });

  it('generates unique IDs', () => {
    const a = generateId('n');
    const b = generateId('n');
    expect(a).not.toBe(b);
  });
});

describe('nodeWidth / nodeHeight', () => {
  it('returns correct dimensions per depth', () => {
    expect(nodeWidth(0)).toBe(264);
    expect(nodeWidth(1)).toBe(220);
    expect(nodeWidth(2)).toBe(196);
    expect(nodeHeight(0)).toBe(130);
    expect(nodeHeight(1)).toBe(104);
    expect(nodeHeight(2)).toBe(96);
  });
});
