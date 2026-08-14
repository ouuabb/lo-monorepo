const path = require('path');
const Database = require('../../src/repo/database.cjs');
const AIOS = require('../../src/ai/aiOS.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('AIOS', () => {
  let tempDir, db, os;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
    os = null;
  });

  function makeRepository() {
    return {
      db,
      getStats: jest.fn().mockResolvedValue({ resourceCount: 2, relationCount: 1 }),
      getKnowledgeLifecycle: jest.fn().mockResolvedValue({ forgotten: 0 })
    };
  }

  test('constructor should wire subsystems', () => {
    const repo = makeRepository();
    const instance = new AIOS({ repository: repo });
    expect(instance.semanticMemory).toBeDefined();
    expect(instance.conceptMemory).toBeDefined();
    expect(instance.knowledgeReasoner).toBeDefined();
    expect(instance.reasoningEngine).toBeDefined();
    expect(instance.planner).toBeDefined();
    expect(instance.executor).toBeDefined();
    expect(instance.learningEngine).toBeDefined();
    expect(instance.aiGateway).toBeDefined();
    expect(instance.assistant).toBeDefined();
    expect(instance.running).toBe(false);
  });

  test('constructor should work without repository', () => {
    const instance = new AIOS();
    expect(instance.semanticMemory._db).toBeNull();
    expect(instance.running).toBe(false);
  });

  test('start and shutdown should toggle running', () => {
    const instance = new AIOS();
    instance.start();
    expect(instance.running).toBe(true);
    instance.shutdown();
    expect(instance.running).toBe(false);
  });

  test('ask should return an AIResponse', async () => {
    os = new AIOS({ repository: makeRepository() });
    const resp = await os.ask('hello there');
    expect(resp.content).toBeDefined();
    expect(Array.isArray(resp.actions)).toBe(true);
  });

  test('analyze should use analysis mode', async () => {
    os = new AIOS({ repository: makeRepository() });
    const resp = await os.analyze('analyze this');
    expect(resp.content).toContain('Analysis completed');
    expect(resp.confidence).toBe(0.7);
  });

  test('research should use research mode', async () => {
    os = new AIOS({ repository: makeRepository() });
    const resp = await os.research('research that');
    expect(resp.content).toContain('Research completed');
    expect(resp.confidence).toBe(0.6);
  });

  test('observe should collect memory, concepts and learning stats', async () => {
    os = new AIOS({ repository: makeRepository() });
    await os.semanticMemory.save({ type: 'experience', concept: 'a', value: 'v', confidence: 0.5 });
    await os.conceptMemory.save({ name: 'c1', meaning: 'm', confidence: 0.8 });
    const result = await os.observe();
    expect(result.memory.entryCount).toBe(1);
    expect(result.concepts.conceptCount).toBe(1);
    expect(result.learning).toHaveProperty('totalRecords');
    expect(result.repository.resourceCount).toBe(2);
  });

  test('observe should tolerate repository stats failure', async () => {
    const repo = makeRepository();
    repo.getStats = jest.fn().mockRejectedValue(new Error('obs-fail'));
    os = new AIOS({ repository: repo });
    const result = await os.observe();
    expect(result.repository).toBeUndefined();
  });

  test('insights should delegate to assistant', async () => {
    os = new AIOS({ repository: makeRepository() });
    os.assistant.generateInsights = jest.fn().mockResolvedValue([{ type: 'concept', content: 'x' }]);
    const insights = await os.insights();
    expect(insights).toHaveLength(1);
  });

  test('evolve should return learning stats', async () => {
    os = new AIOS();
    const result = await os.evolve();
    expect(result.totalRecords).toBe(0);
    expect(result.strategies).toBeDefined();
  });
});
