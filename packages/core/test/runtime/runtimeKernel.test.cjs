const path = require('path');
const Database = require('../../src/repo/database.cjs');
const RuntimeKernel = require('../../src/runtime/runtimeKernel.cjs');
const ResourceRuntime = require('../../src/runtime/resourceRuntime.cjs');
const { runMigrations } = require('../../src/repo/migrationRunner.cjs');
const testUtils = global.testUtils;

describe('RuntimeKernel', () => {
  let tempDir, db;

  beforeEach(async () => {
    jest.useFakeTimers();
    tempDir = await testUtils.createTempRepo();
    db = new Database(tempDir);
    await db.open();
    await runMigrations(db, path.join(__dirname, '../../src/repo/migrations'));
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (db) await db.close();
    await testUtils.cleanupTempDir(tempDir);
  });

  function makeKernel(services = {}) {
    return new RuntimeKernel({
      db,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      ...services
    });
  }

  test('constructor wires all subsystems', () => {
    const kernel = makeKernel();
    expect(kernel.db).toBe(db);
    expect(kernel.state.status).toBe('created');
    expect(kernel.registry).toBeTruthy();
    expect(kernel.store).toBeTruthy();
    expect(kernel.context).toBeTruthy();
    expect(kernel.scheduler).toBeTruthy();
    expect(kernel.loop).toBeTruthy();
    expect(kernel.monitor).toBeTruthy();
    expect(kernel.evolution).toBeTruthy();
    expect(kernel.knowledgeRuntime).toBeTruthy();
  });

  test('constructor forwards injected services into context', () => {
    const eventBus = { emit: jest.fn() };
    const workflowEngine = { run: jest.fn() };
    const kernel = makeKernel({ eventBus, workflowEngine });
    expect(kernel.context.eventBus).toBe(eventBus);
    expect(kernel.context.workflowEngine).toBe(workflowEngine);
    expect(kernel.context.repository).toBeNull();
  });

  test('start transitions to running and schedules default tasks', async () => {
    const kernel = makeKernel();
    const logSpy = jest.spyOn(kernel.logger, 'log');
    const scheduleSpy = jest.spyOn(kernel.scheduler, 'schedule');
    const result = await kernel.start();
    expect(result).toBe(kernel);
    expect(kernel.state.isRunning).toBe(true);
    expect(logSpy).toHaveBeenCalledWith('[runtime] Knowledge Runtime ready');
    expect(scheduleSpy).toHaveBeenCalledTimes(2);
    expect(kernel.scheduler._tasks.has('runtime:snapshot')).toBe(true);
    expect(kernel.scheduler._tasks.has('runtime:evolution')).toBe(true);
    expect(kernel.scheduler.pendingCount()).toBe(2);
    scheduleSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('stop transitions to stopped and logs', async () => {
    const kernel = makeKernel();
    await kernel.start();
    const logSpy = jest.spyOn(kernel.logger, 'log');
    await kernel.stop();
    expect(kernel.state.isStopped).toBe(true);
    expect(logSpy).toHaveBeenCalledWith('[runtime] Knowledge Runtime stopped');
    logSpy.mockRestore();
  });

  test('restart stops then starts again', async () => {
    const kernel = makeKernel();
    await kernel.start();
    await kernel.restart();
    expect(kernel.state.isRunning).toBe(true);
    expect(kernel.scheduler.pendingCount()).toBe(2);
  });

  test('pause only works while running and resume only while paused', async () => {
    const kernel = makeKernel();
    await kernel.start();
    kernel.pause();
    expect(kernel.state.isPaused).toBe(true);
    kernel.pause();
    expect(kernel.state.isPaused).toBe(true);
    kernel.resume();
    expect(kernel.state.isRunning).toBe(true);
    kernel.resume();
    expect(kernel.state.isRunning).toBe(true);
  });

  test('pause is a no-op when not running', () => {
    const kernel = makeKernel();
    kernel.pause();
    expect(kernel.state.status).toBe('created');
  });

  test('promote registers an indexed runtime resource', () => {
    const kernel = makeKernel();
    const resource = kernel.promote('r1', 'note', { title: 'x' });
    expect(resource).toBeInstanceOf(ResourceRuntime);
    expect(resource.state).toBe('indexed');
    expect(kernel.registry.getResource('r1')).toBe(resource);
    expect(kernel.status().resources).toBe(1);
  });

  test('promoteAll supports rid or id and defaults type', () => {
    const kernel = makeKernel();
    const results = kernel.promoteAll([
      { rid: 'a', type: 'note' },
      { id: 'b' },
      {}
    ]);
    expect(results).toHaveLength(3);
    expect(kernel.registry.getResource('a').type).toBe('note');
    expect(kernel.registry.getResource('b').type).toBe('unknown');
    expect(results[2].rid).toBe('');
    expect(results[2].type).toBe('unknown');
  });

  test('promoteAll returns empty for empty input', () => {
    const kernel = makeKernel();
    expect(kernel.promoteAll([])).toEqual([]);
  });

  test('status and snapshot delegate to the monitor', async () => {
    const kernel = makeKernel();
    await kernel.start();
    const status = kernel.status();
    expect(status.status).toBe('running');
    const snap = kernel.snapshot();
    expect(snap.status).toBe('running');
    expect(kernel.monitor.history()).toHaveLength(1);
  });

  test('state listeners wire scheduler and loop on started and stopped', async () => {
    const kernel = makeKernel();
    await kernel.start();
    expect(kernel.scheduler._running).toBe(false);
    expect(kernel.loop._tickInterval).toBeNull();
    kernel.state.emit('started');
    expect(kernel.scheduler._running).toBe(true);
    expect(kernel.loop._tickInterval).toBeTruthy();
    kernel.state.emit('stopped');
    expect(kernel.scheduler._running).toBe(false);
    expect(kernel.loop._tickInterval).toBeNull();
  });

  test('_setupDefaultTasks registers snapshot and evolution tasks', () => {
    const kernel = makeKernel();
    kernel._setupDefaultTasks();
    expect(kernel.scheduler._tasks.has('runtime:snapshot')).toBe(true);
    expect(kernel.scheduler._tasks.has('runtime:evolution')).toBe(true);
    expect(kernel.scheduler._tasks.get('runtime:snapshot').mode).toBe('interval');
  });

  test('default snapshot task captures a snapshot', async () => {
    const kernel = makeKernel();
    await kernel.start();
    const task = kernel.scheduler._tasks.get('runtime:snapshot');
    await task.fn(kernel.context);
    expect(kernel.monitor.history()).toHaveLength(1);
  });

  test('default evolution task logs when opportunities are detected', async () => {
    const kernel = makeKernel();
    await kernel.start();
    kernel.registry.registerResource('r1', new ResourceRuntime({ rid: 'r1', state: 'created' }));
    const task = kernel.scheduler._tasks.get('runtime:evolution');
    await task.fn(kernel.context);
    expect(kernel.logger.log).toHaveBeenCalledWith(expect.stringContaining('improvement opportunities detected'));
  });

  test('default evolution task is quiet when no opportunities exist', async () => {
    const kernel = makeKernel();
    await kernel.start();
    const task = kernel.scheduler._tasks.get('runtime:evolution');
    await task.fn(kernel.context);
    expect(kernel.logger.log).not.toHaveBeenCalledWith(expect.stringContaining('improvement opportunities'));
  });

  test('store can persist runtime data through the kernel db', async () => {
    const kernel = makeKernel();
    await kernel.store.saveInstance({ id: 'k1', type: 'agent', state: { up: true } });
    const got = await kernel.store.getInstance('k1');
    expect(got.id).toBe('k1');
    expect(JSON.parse(got.state)).toEqual({ up: true });
  });

  test('kernel can be created without a db', () => {
    const kernel = new RuntimeKernel({ logger: { log: jest.fn() } });
    expect(kernel.store).toBeTruthy();
    expect(kernel.status().resources).toBe(0);
  });
});
