const EvolutionDetector = require('../../src/evolution/evolutionDetector.cjs');

describe('EvolutionDetector', () => {
  let detector;

  beforeEach(() => {
    detector = new EvolutionDetector();
  });

  test('stores services on constructor', () => {
    const repository = { a: 1 };
    const agentEngine = { b: 2 };
    const workflowEngine = { c: 3 };
    const d = new EvolutionDetector({ repository, agentEngine, workflowEngine });
    expect(d.repository).toBe(repository);
    expect(d.agentEngine).toBe(agentEngine);
    expect(d.workflowEngine).toBe(workflowEngine);
    const empty = new EvolutionDetector();
    expect(empty.repository).toBeNull();
    expect(empty.agentEngine).toBeNull();
    expect(empty.workflowEngine).toBeNull();
  });

  test('returns empty opportunities when nothing detected', async () => {
    const opportunities = await detector.detect({}, {});
    expect(opportunities).toEqual([]);
  });

  test('detects knowledge_refactor with high priority for high severity structural issue', async () => {
    const opportunities = await detector.detect(
      {},
      { issues: [{ type: 'low_connectivity', severity: 'high' }] }
    );
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({ type: 'knowledge_refactor', priority: 'high' });
    expect(opportunities[0].details).toEqual([{ type: 'low_connectivity', severity: 'high' }]);
  });

  test('detects knowledge_refactor with medium priority for medium severity structural issue', async () => {
    const opportunities = await detector.detect(
      {},
      { issues: [{ type: 'orphan_nodes', severity: 'medium' }] }
    );
    expect(opportunities[0]).toMatchObject({ type: 'knowledge_refactor', priority: 'medium' });
  });

  test('ignores non structural issues', async () => {
    const opportunities = await detector.detect({}, { issues: [{ type: 'other', severity: 'high' }] });
    expect(opportunities).toEqual([]);
  });

  test('detects orphan_cleanup with medium priority for 6 orphans', async () => {
    const opportunities = await detector.detect({ orphanNodes: 6 }, {});
    expect(opportunities[0]).toMatchObject({
      type: 'orphan_cleanup',
      priority: 'medium',
      details: { orphanCount: 6 }
    });
  });

  test('detects orphan_cleanup with high priority for 21 orphans', async () => {
    const opportunities = await detector.detect({ orphanNodes: 21 }, {});
    expect(opportunities[0].priority).toBe('high');
  });

  test('does not flag orphan_cleanup for 5 or fewer orphans', async () => {
    expect(await detector.detect({ orphanNodes: 5 }, {})).toEqual([]);
    expect(await detector.detect({ orphanNodes: 0 }, {})).toEqual([]);
  });

  test('detects knowledge_expand for stalled base', async () => {
    const opportunities = await detector.detect({ resources: 100, connectivity: 0.1 }, {});
    expect(opportunities[0]).toMatchObject({
      type: 'knowledge_expand',
      priority: 'medium',
      details: { message: 'Knowledge base needs expansion and connection' }
    });
  });

  test('does not flag knowledge_expand at boundaries', async () => {
    expect(await detector.detect({ resources: 50, connectivity: 0.1 }, {})).toEqual([]);
    expect(await detector.detect({ resources: 500, connectivity: 0.1 }, {})).toEqual([]);
    expect(await detector.detect({ resources: 100, connectivity: 0.2 }, {})).toEqual([]);
    expect(await detector.detect({ resources: 51, connectivity: 0.2 }, {})).toEqual([]);
  });

  test('combines multiple opportunities', async () => {
    const opportunities = await detector.detect(
      { orphanNodes: 25, resources: 100, connectivity: 0.1 },
      { issues: [{ type: 'low_connectivity', severity: 'high' }] }
    );
    const types = opportunities.map(o => o.type).sort();
    expect(types).toEqual(['knowledge_expand', 'knowledge_refactor', 'orphan_cleanup']);
    expect(opportunities.find(o => o.type === 'orphan_cleanup').priority).toBe('high');
  });

  test('detect is async and tolerant of missing report keys', async () => {
    await expect(detector.detect()).resolves.toEqual([]);
    await expect(detector.detect(undefined, { issues: [{ type: 'orphan_nodes', severity: 'low' }] }))
      .resolves.toHaveLength(1);
  });
});
