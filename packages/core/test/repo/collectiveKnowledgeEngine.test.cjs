const path = require('path');
const Database = require('../../src/repo/database.cjs');
const CollectiveKnowledgeEngine = require('../../src/repo/collectiveKnowledgeEngine.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('CollectiveKnowledgeEngine', () => {
  let tempDir, db, engine, fm;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
    fm = { list: jest.fn().mockResolvedValue([]) };
    engine = new CollectiveKnowledgeEngine(db, fm);
  });

  afterEach(async () => {
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  async function seedLocal(rows) {
    for (const row of rows) {
      await db.run(
        `INSERT INTO resources (rid, name, layer, type, path, hash, created, updated, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [row.rid, row.name, 0, row.type || 'note', row.path || '', null, Date.now(), Date.now()]
      );
    }
  }

  async function createRemoteRepo(rows) {
    const dir = await testUtils.createTempRepo();
    const rdb = new Database(dir);
    await rdb.open();
    await runMigrations(rdb, path.join(__dirname, '../../src/repo/migrations'));
    for (const row of rows) {
      await rdb.run(
        `INSERT INTO resources (rid, name, layer, type, path, hash, created, updated, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [row.rid, row.name, 0, row.type || 'note', row.path || '', null, Date.now(), Date.now()]
      );
    }
    await rdb.close();
    return dir;
  }

  test('constructor should store db and federation manager', () => {
    expect(engine.db).toBe(db);
    expect(engine.fm).toBe(fm);
  });

  test('analyze should return empty result when no repositories', async () => {
    const result = await engine.analyze();
    expect(result).toEqual({ sharedConcepts: [], crossRepoPatterns: [], repositoryCount: 0 });
    expect(fm.list).toHaveBeenCalledTimes(1);
  });

  test('analyze should find shared concepts across repos', async () => {
    await seedLocal([{ rid: 'l1', name: 'Alpha' }, { rid: 'l2', name: 'Beta' }]);
    const remoteDir = await createRemoteRepo([
      { rid: 'r1', name: 'Alpha' },
      { rid: 'r2', name: 'Other' }
    ]);
    try {
      fm.list.mockResolvedValue([{ namespace: 'remote1', path: remoteDir }]);
      const result = await engine.analyze();
      expect(result.repositoryCount).toBe(1);
      expect(result.sharedConcepts).toEqual([
        { concept: 'Alpha', repository: 'remote1', confidence: 0.85 }
      ]);
      expect(result.crossRepoPatterns).toEqual([]);
    } finally {
      await testUtils.cleanupTempDir(remoteDir);
    }
  });

  test('analyze should match names case-insensitively', async () => {
    await seedLocal([{ rid: 'l1', name: 'Alpha' }]);
    const remoteDir = await createRemoteRepo([{ rid: 'r1', name: 'alpha' }]);
    try {
      fm.list.mockResolvedValue([{ namespace: 'ns2', path: remoteDir }]);
      const result = await engine.analyze();
      expect(result.sharedConcepts).toEqual([
        { concept: 'alpha', repository: 'ns2', confidence: 0.85 }
      ]);
    } finally {
      await testUtils.cleanupTempDir(remoteDir);
    }
  });

  test('analyze should skip inaccessible repositories', async () => {
    await seedLocal([{ rid: 'l1', name: 'Alpha' }]);
    const corruptDir = path.join(tempDir, 'corrupt-repo');
    const fs = require('fs-extra');
    fs.ensureDirSync(path.join(corruptDir, '.repo'));
    fs.writeFileSync(path.join(corruptDir, '.repo', 'database.sqlite'), 'not a sqlite db');
    fm.list.mockResolvedValue([{ namespace: 'bad', path: corruptDir }]);
    const result = await engine.analyze();
    expect(result.sharedConcepts).toEqual([]);
    expect(result.repositoryCount).toBe(1);
  });

  test('analyze should report multi_repo_federation pattern for 2+ repos', async () => {
    await seedLocal([{ rid: 'l1', name: 'Alpha' }]);
    const dirA = await createRemoteRepo([{ rid: 'r1', name: 'Zeta' }]);
    const dirB = await createRemoteRepo([{ rid: 'r2', name: 'Eta' }]);
    try {
      fm.list.mockResolvedValue([
        { namespace: 'nsA', path: dirA },
        { namespace: 'nsB', path: dirB }
      ]);
      const result = await engine.analyze();
      expect(result.repositoryCount).toBe(2);
      expect(result.sharedConcepts).toEqual([]);
      expect(result.crossRepoPatterns).toEqual([
        {
          type: 'multi_repo_federation',
          description: '2 repositories connected',
          repositories: ['nsA', 'nsB']
        }
      ]);
    } finally {
      await testUtils.cleanupTempDir(dirA);
      await testUtils.cleanupTempDir(dirB);
    }
  });

  test('_findCrossRepoPatterns should be empty for a single repo', async () => {
    expect(await engine._findCrossRepoPatterns([{ namespace: 'a' }])).toEqual([]);
  });

  test('_findCrossRepoPatterns should ignore repos without namespace', async () => {
    const result = await engine._findCrossRepoPatterns([
      { namespace: 'a' },
      { namespace: 'b' },
      { namespace: 'c' }
    ]);
    expect(result).toEqual([
      {
        type: 'multi_repo_federation',
        description: '3 repositories connected',
        repositories: ['a', 'b', 'c']
      }
    ]);
  });
});
