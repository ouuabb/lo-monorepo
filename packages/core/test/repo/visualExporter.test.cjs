const VisualGraph = require('../../src/domain/visualGraph.cjs');
const VisualExporter = require('../../src/repo/visualExporter.cjs');

function sampleVisualGraph() {
  const vg = new VisualGraph();
  vg.addNode('a', { label: 'Node A', group: 'hub', x: 10, y: 20, r: 8 });
  vg.addNode('b', { label: 'B', group: 'leaf' });
  vg.addNode('c', { label: 'C<>&"', group: 'sink', x: 30, y: 40 });
  vg.addEdge('a', 'b', 'reference');
  vg.addEdge('a', 'c', 'wikilink');
  vg.addEdge('a', 'missing', 'dependency');
  return vg;
}

describe('VisualExporter', () => {
  test('applies default constructor options', () => {
    const exporter = new VisualExporter(sampleVisualGraph());
    expect(exporter.title).toBe('Resource Graph');
    expect(exporter.width).toBe(800);
    expect(exporter.height).toBe(600);
  });

  test('honours constructor options', () => {
    const exporter = new VisualExporter(sampleVisualGraph(), { title: 'My Graph', width: 1000, height: 700 });
    expect(exporter.title).toBe('My Graph');
    expect(exporter.width).toBe(1000);
    expect(exporter.height).toBe(700);
  });

  describe('toJSON', () => {
    test('serializes nodes and edges', () => {
      const parsed = JSON.parse(new VisualExporter(sampleVisualGraph()).toJSON());
      expect(parsed.nodes).toHaveLength(3);
      expect(parsed.edges).toHaveLength(3);
      expect(parsed.nodes.find(n => n.id === 'a').group).toBe('hub');
      expect(parsed.edges[0]).toMatchObject({ source: 'a', target: 'b', type: 'reference', weight: 1 });
    });
  });

  describe('toSVG', () => {
    test('produces an svg document with title', () => {
      const svg = new VisualExporter(sampleVisualGraph()).toSVG();
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('Resource Graph');
      expect(svg).toContain('</svg>');
    });

    test('skips edges whose endpoints lack coordinates', () => {
      const svg = new VisualExporter(sampleVisualGraph()).toSVG();
      expect(svg).toContain('x1="10" y1="20" x2="30" y2="40"');
      expect(svg).not.toContain('missing');
    });

    test('uses edge type colors', () => {
      const svg = new VisualExporter(sampleVisualGraph()).toSVG();
      expect(svg).toContain('stroke="#3a8"');
    });

    test('centers nodes without coordinates and escapes labels', () => {
      const svg = new VisualExporter(sampleVisualGraph()).toSVG();
      expect(svg).toContain('<circle cx="400" cy="300" r="6"');
      expect(svg).toContain('C&lt;&gt;&amp;&quot;');
    });

    test('defaults to gray for unknown groups', () => {
      const vg = new VisualGraph();
      vg.addNode('a', { label: 'A', x: 1, y: 1 });
      const svg = new VisualExporter(vg).toSVG();
      expect(svg).toContain('fill="#a0a0a0"');
    });
  });

  describe('toHTML', () => {
    test('produces self-contained html with embedded graph data', () => {
      const html = new VisualExporter(sampleVisualGraph()).toHTML();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('const GRAPH =');
      expect(html).toContain('"id":"a"');
      expect(html).toContain('<canvas id="canvas"></canvas>');
    });

    test('escapes title in html output', () => {
      const html = new VisualExporter(sampleVisualGraph(), { title: 'A&B' }).toHTML();
      expect(html).toContain('<title>A&amp;B</title>');
    });
  });

  describe('_edgeColor', () => {
    test('maps known types and defaults to gray', () => {
      const exporter = new VisualExporter(sampleVisualGraph());
      expect(exporter._edgeColor('reference')).toBe('#666');
      expect(exporter._edgeColor('wikilink')).toBe('#3a8');
      expect(exporter._edgeColor('dependency')).toBe('#a6f');
      expect(exporter._edgeColor('mystery')).toBe('#666');
    });
  });

  describe('_esc', () => {
    test('escapes html special characters', () => {
      const exporter = new VisualExporter(sampleVisualGraph());
      expect(exporter._esc('<a>&"')).toBe('&lt;a&gt;&amp;&quot;');
      expect(exporter._esc('plain')).toBe('plain');
    });
  });
});
