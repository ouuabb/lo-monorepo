const path = require('path');
const Database = require('../../src/repo/database.cjs');
const KnowledgeStrategyEngine = require('../../src/repo/knowledgeStrategyEngine.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

const DAY = 86400000;

describe('KnowledgeStrategyEngine', () => {
  let tempDir, db, engine;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    engine = new KnowledgeStrategyEngine(db, {});
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function addResource(rid, name, type, created, updated) {
    await db.run(
      `INSERT INTO resources (rid, name, layer, type, path, hash, metadata, encrypted, created, updated, deleted)
       VALUES (?, ?, 0, ?, ?, '', '{}', 0, ?, ?, 0)`,
      [rid, name, type, `/${rid}`, created || Date.now(), updated || Date.now()]
    );
  }

  async function addRelation(from, to, created) {
    await db.run(
      `INSERT INTO relations (from_rid, to_rid, type, created, updated, deleted)
       VALUES (?, ?, 'reference', ?, ?, 0)`,
      [from, to, created || Date.now(), created || Date.now()]
    );
  }

  describe('_generateConnectStrategy', () => {
    test('flags orphan resources with high priority', async () => {
      for (let i = 1; i <= 4; i++) await addResource(`r${i}`, `name${i}`, 'note');
      await addResource('linked', 'linked', 'note');
      await addRelation('linked', 'other', Date.now());
      await addResource('other', 'other', 'note');

      const actions = await engine._generateConnectStrategy();
      const orphan = actions.find(a => a.priority === 'high');
      expect(orphan).toBeDefined();
      expect(orphan.action).toBe('connect');
      expect(orphan.targetCount).toBe(5);
      expect(orphan.targets).toHaveLength(5);
      expect(orphan.reason).toContain('5 orphan resources');
    });

    test('adds dead-end action from patternEngine', async () => {
      const patternEngine = {
        detectDeadEnds: jest.fn().mockResolvedValue([
          { rid: 'd1', incoming: 3 }
        ])
      };
      const withPattern = new KnowledgeStrategyEngine(db, {
        patternEngine,
        graphEngine: {}
      });
      const actions = await withPattern._generateConnectStrategy();
      const deadEnd = actions.find(a => a.priority === 'medium');
      expect(deadEnd).toBeDefined();
      expect(deadEnd.targets[0].rid).toBe('d1');
    });

    test('ignores patternEngine failures', async () => {
      const patternEngine = {
        detectDeadEnds: jest.fn().mockRejectedValue(new Error('boom'))
      };
      const withPattern = new KnowledgeStrategyEngine(db, {
        patternEngine,
        graphEngine: {}
      });
      const actions = await withPattern._generateConnectStrategy();
      expect(actions).toHaveLength(1);
      expect(actions[0].action).toBe('connect');
      expect(actions[0].priority).toBe('high');
    });
  });

  describe('_generateExpandStrategy', () => {
    test('suggests expansion for low-density domains', async () => {
      for (let i = 1; i <= 6; i++) await addResource(`t${i}`, `topic${i}`, 'topic');
      await addRelation('t1', 't2', Date.now());
      await addRelation('t3', 't4', Date.now());

      const actions = await engine._generateExpandStrategy();
      expect(actions.length).toBeGreaterThanOrEqual(1);
      const expand = actions.find(a => a.action === 'expand');
      expect(expand).toMatchObject({ domain: 'topic', resources: 6, relations: 2, priority: 'low' });
      expect(expand.density).toBe(0.33);
    });

    test('does not suggest expansion for connected domains', async () => {
      for (let i = 1; i <= 6; i++) await addResource(`t${i}`, `topic${i}`, 'topic');
      await addRelation('t1', 't2', Date.now());
      await addRelation('t2', 't3', Date.now());
      await addRelation('t3', 't4', Date.now());
      await addRelation('t4', 't5', Date.now());
      await addRelation('t5', 't6', Date.now());

      const actions = await engine._generateExpandStrategy();
      expect(actions.filter(a => a.action === 'expand')).toHaveLength(0);
    });
  });

  describe('_generateRefactorStrategy', () => {
    test('suggests refactor for high collection rate', async () => {
      const evolutionEngine = {
        growthRate: jest.fn().mockResolvedValue({ newResources: 30, newRelations: 2 })
      };
      const withEvo = new KnowledgeStrategyEngine(db, { evolutionEngine });
      const actions = await withEvo._generateRefactorStrategy();
      expect(actions.some(a => a.action === 'refactor' && a.priority === 'medium')).toBe(true);
    });

    test('suggests refactor for stale resources', async () => {
      const stale = Date.now() - 400 * DAY;
      for (let i = 1; i <= 7; i++) await addResource(`s${i}`, `stale${i}`, 'note', stale, stale);
      const actions = await engine._generateRefactorStrategy();
      const refactor = actions.find(a => a.action === 'refactor' && a.priority === 'low');
      expect(refactor).toBeDefined();
      expect(refactor.targetCount).toBe(7);
    });

    test('no action when evolution growth is balanced', async () => {
      const evolutionEngine = {
        growthRate: jest.fn().mockResolvedValue({ newResources: 10, newRelations: 10 })
      };
      const withEvo = new KnowledgeStrategyEngine(db, { evolutionEngine });
      const actions = await withEvo._generateRefactorStrategy();
      expect(actions.filter(a => a.action === 'refactor')).toHaveLength(0);
    });
  });

  describe('_generateExploreStrategy', () => {
    test('suggests exploration when knowledge is concentrated', async () => {
      const evolutionEngine = {
        entropy: jest.fn().mockResolvedValue({
          interpretation: 'concentrated',
          distribution: { note: 10, doc: 2, book: 1 }
        })
      };
      const withEvo = new KnowledgeStrategyEngine(db, { evolutionEngine });
      const actions = await withEvo._generateExploreStrategy();
      expect(actions).toHaveLength(1);
      expect(actions[0].action).toBe('explore');
      expect(actions[0].reason).toContain('note, doc, book');
    });

    test('no action when knowledge is balanced', async () => {
      const evolutionEngine = {
        entropy: jest.fn().mockResolvedValue({ interpretation: 'balanced', distribution: {} })
      };
      const withEvo = new KnowledgeStrategyEngine(db, { evolutionEngine });
      expect(await withEvo._generateExploreStrategy()).toEqual([]);
    });

    test('ignores entropy errors', async () => {
      const evolutionEngine = {
        entropy: jest.fn().mockRejectedValue(new Error('boom'))
      };
      const withEvo = new KnowledgeStrategyEngine(db, { evolutionEngine });
      expect(await withEvo._generateExploreStrategy()).toEqual([]);
    });
  });

  describe('generate', () => {
    test('combines all strategies into an ordered action list', async () => {
      for (let i = 1; i <= 5; i++) await addResource(`n${i}`, `note${i}`, 'note');
      const actions = await engine.generate();
      expect(actions.length).toBeGreaterThanOrEqual(2);
      expect(actions[0].action).toBe('connect');
      expect(actions[0].priority).toBe('high');
      expect(actions.some(a => a.action === 'expand')).toBe(true);
    });
  });
});
