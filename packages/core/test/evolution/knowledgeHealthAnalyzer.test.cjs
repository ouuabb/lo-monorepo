const KnowledgeHealthAnalyzer = require('../../src/evolution/knowledgeHealthAnalyzer.cjs');

describe('KnowledgeHealthAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new KnowledgeHealthAnalyzer();
  });

  test('stores services on constructor', () => {
    const repository = { x: 1 };
    const graphEngine = { y: 2 };
    const a = new KnowledgeHealthAnalyzer({ repository, graphEngine });
    expect(a.repository).toBe(repository);
    expect(a.graphEngine).toBe(graphEngine);
    expect(analyzer.repository).toBeNull();
    expect(analyzer.graphEngine).toBeNull();
  });

  test('analyze returns default result for null snapshot', async () => {
    const result = await analyzer.analyze(null);
    expect(result).toEqual({ healthScore: 0, connectivity: 0, issues: [], recommendations: [] });
  });

  test('analyze empty object produces no issues', async () => {
    const result = await analyzer.analyze({});
    expect(result).toEqual({ healthScore: 0, connectivity: 0, issues: [], recommendations: [] });
  });

  test('flags low connectivity when resources exist', async () => {
    const result = await analyzer.analyze({ connectivity: 0.2, resources: 10, relations: 1 });
    expect(result.issues).toContainEqual({
      type: 'low_connectivity',
      severity: 'high',
      description: '知识连接度过低'
    });
    expect(result.recommendations).toContainEqual({ action: 'suggest_relations', target: 'all', priority: 'high' });
  });

  test('does not flag low connectivity when connectivity is at threshold', async () => {
    const result = await analyzer.analyze({ connectivity: 0.3, resources: 10, relations: 5 });
    expect(result.issues.some(i => i.type === 'low_connectivity')).toBe(false);
  });

  test('does not flag low connectivity for empty store', async () => {
    const result = await analyzer.analyze({ connectivity: 0, resources: 0, relations: 0 });
    expect(result.issues.some(i => i.type === 'low_connectivity')).toBe(false);
  });

  test('flags orphan nodes', async () => {
    const result = await analyzer.analyze({ resources: 5, relations: 10, orphanNodes: 2, connectivity: 0.5 });
    expect(result.issues).toContainEqual({ type: 'orphan_nodes', severity: 'medium', count: 2 });
    expect(result.recommendations).toContainEqual({ action: 'connect_orphans', priority: 'medium' });
  });

  test('does not flag orphans when none exist', async () => {
    const result = await analyzer.analyze({ resources: 5, relations: 10, orphanNodes: 0, connectivity: 0.5 });
    expect(result.issues.some(i => i.type === 'orphan_nodes')).toBe(false);
  });

  test('flags empty knowledge base', async () => {
    const result = await analyzer.analyze({ resources: 0, relations: 0, orphanNodes: 0 });
    expect(result.issues).toContainEqual({ type: 'empty', severity: 'low', description: '知识库为空' });
    expect(result.recommendations).toContainEqual({ action: 'seed_knowledge', priority: 'low' });
  });

  test('computes health score from connectivity and resources', async () => {
    const result = await analyzer.analyze({ connectivity: 0.5, resources: 100, relations: 100, orphanNodes: 0 });
    expect(result.healthScore).toBe(70);
  });

  test('health score caps resource contribution at 40', async () => {
    const result = await analyzer.analyze({ connectivity: 0.5, resources: 2000, relations: 2000, orphanNodes: 0 });
    expect(result.healthScore).toBe(70);
  });

  test('health score for small base', async () => {
    const result = await analyzer.analyze({ connectivity: 1, resources: 25, relations: 50, orphanNodes: 0 });
    expect(result.healthScore).toBe(70);
  });

  test('combines low connectivity and orphan issues', async () => {
    const result = await analyzer.analyze({ connectivity: 0.1, resources: 5, relations: 0, orphanNodes: 3 });
    const types = result.issues.map(i => i.type).sort();
    expect(types).toEqual(['low_connectivity', 'orphan_nodes']);
    expect(result.recommendations).toHaveLength(2);
  });
});
