const testUtils = global.testUtils;
const Repository = require('../../src/repo/repository.cjs');
const runtime = require('../../src/commands/runtime.cjs');

function fakeRuntime(overrides = {}) {
  const rt = {
    state: { status: 'running', isRunning: true },
    status: jest.fn(() => ({
      status: 'running',
      resources: 3,
      agents: 1,
      workflows: 2,
      plugins: 1,
      events: 9,
      tasksExecuted: 4,
      errors: 0,
      uptime: 0
    })),
    monitor: {
      trends: jest.fn(() => ({ resourceDelta: 0, eventsDelta: 0, tasksDelta: 0 })),
      history: jest.fn(() => [])
    },
    evolution: {
      evolve: jest.fn(() => ({ evolved: false, reason: 'no opportunities yet' }))
    },
    start: jest.fn(async function () {
      this.state.status = 'running';
      this.state.isRunning = true;
    }),
    stop: jest.fn(async function () {
      this.state.isRunning = false;
      this.state.status = 'stopped';
    }),
    ...overrides
  };
  return rt;
}

let runtimeSpy = null;

function installFakeRuntime(rt) {
  if (runtimeSpy) runtimeSpy.mockRestore();
  runtimeSpy = jest.spyOn(Repository.prototype, 'initRuntimeSystem').mockImplementation(function () {
    this._runtime = rt;
    return rt;
  });
}

describe('runtime command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = { originalCwd: process.cwd() };
    ctx.dir = await testUtils.createTempRepo();
    process.chdir(ctx.dir);
    process.exit.mockClear();
  });

  afterEach(async () => {
    if (runtimeSpy) runtimeSpy.mockRestore();
    runtimeSpy = null;
    process.chdir(ctx.originalCwd);
    await testUtils.cleanupTempDir(ctx.dir);
  });

  async function leaveRepo() {
    process.chdir(ctx.originalCwd);
  }

  describe('status', () => {
    test('reports a running runtime', async () => {
      const rt = fakeRuntime();
      installFakeRuntime(rt);
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeStatus({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Knowledge Runtime'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('running'));
      expect(rt.status).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('prints uptime when the runtime has been running', async () => {
      const rt = fakeRuntime({
        status: jest.fn(() => ({
          status: 'running', resources: 1, agents: 0, workflows: 0, plugins: 0,
          events: 0, tasksExecuted: 0, errors: 1, uptime: 125000
        }))
      });
      installFakeRuntime(rt);
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeStatus({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('2m 5s'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('reports when the runtime has not started', async () => {
      installFakeRuntime(fakeRuntime({ state: { status: 'created', isRunning: false } }));
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeStatus({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Runtime 尚未启动'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('reports when not connected to a repository', async () => {
      await leaveRepo();
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeStatus({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('未连接到仓库'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('reports errors from the runtime', async () => {
      const rt = fakeRuntime();
      rt.status.mockImplementation(() => { throw new Error('boom'); });
      installFakeRuntime(rt);
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeStatus({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('状态查询失败'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('boom'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });
  });

  describe('start', () => {
    test('starts a stopped runtime', async () => {
      const rt = fakeRuntime({ state: { status: 'created', isRunning: false } });
      installFakeRuntime(rt);
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeStart({});
      expect(rt.start).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Knowledge Runtime 已启动'));
      spy.mockRestore();
    });

    test('reports when the runtime is already running', async () => {
      installFakeRuntime(fakeRuntime({ state: { status: 'running', isRunning: true } }));
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeStart({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Runtime 已在运行中'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('errors when not connected to a repository', async () => {
      await leaveRepo();
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeStart({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('未连接到仓库'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });

    test('reports start failures', async () => {
      const rt = fakeRuntime({ state: { status: 'created', isRunning: false } });
      rt.start.mockImplementation(() => { throw new Error('start failed'); });
      installFakeRuntime(rt);
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeStart({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('启动失败'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('start failed'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });
  });

  describe('stop', () => {
    test('stops a running runtime', async () => {
      const rt = fakeRuntime({ state: { status: 'running', isRunning: true } });
      installFakeRuntime(rt);
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeStop({});
      expect(rt.stop).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Knowledge Runtime 已停止'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('reports when the runtime is not running', async () => {
      installFakeRuntime(fakeRuntime({ state: { status: 'created', isRunning: false } }));
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeStop({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Runtime 未在运行'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('reports when not connected to a repository', async () => {
      await leaveRepo();
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeStop({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('未连接到仓库'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('reports stop failures', async () => {
      const rt = fakeRuntime({ state: { status: 'running', isRunning: true } });
      rt.stop.mockImplementation(() => { throw new Error('stop failed'); });
      installFakeRuntime(rt);
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeStop({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('停止失败'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });
  });

  describe('monitor', () => {
    test('prints a monitor panel', async () => {
      const rt = fakeRuntime({
        monitor: {
          trends: jest.fn(() => ({ resourceDelta: 2, eventsDelta: -1, tasksDelta: 0 })),
          history: jest.fn(() => [
            { timestamp: 1700000000000, resources: 3, events: 9, tasksExecuted: 4 }
          ])
        }
      });
      installFakeRuntime(rt);
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeMonitor({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Runtime Monitor'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('+2'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('最近快照'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('skips trends and history when unavailable', async () => {
      const rt = fakeRuntime({
        monitor: { trends: jest.fn(() => null), history: jest.fn(() => []) }
      });
      installFakeRuntime(rt);
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeMonitor({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Runtime Monitor'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('reports when the runtime is unavailable', async () => {
      installFakeRuntime(null);
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeMonitor({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Runtime 不可用'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('reports when not connected to a repository', async () => {
      await leaveRepo();
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeMonitor({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('未连接到仓库'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });
  });

  describe('evolve', () => {
    test('reports when nothing evolved', async () => {
      const rt = fakeRuntime();
      installFakeRuntime(rt);
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeEvolve({});
      expect(rt.evolution.evolve).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('no opportunities yet'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('prints discovered opportunities', async () => {
      const rt = fakeRuntime({
        evolution: {
          evolve: jest.fn(() => ({
            evolved: true,
            opportunities: [
              { severity: 'high', description: 'fix A', suggestion: 'merge' },
              { severity: 'medium', description: 'fix B', suggestion: 'link' },
              { severity: 'low', description: 'fix C', suggestion: 'tag' }
            ]
          }))
        }
      });
      installFakeRuntime(rt);
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeEvolve({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('发现 3 个改进机会'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('fix A'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('fix C'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('reports when the runtime is unavailable', async () => {
      installFakeRuntime(null);
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeEvolve({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Runtime 不可用'));
      expect(process.exit).toHaveBeenCalledWith(0);
      spy.mockRestore();
    });

    test('reports evolve failures', async () => {
      const rt = fakeRuntime();
      rt.evolution.evolve.mockImplementation(() => { throw new Error('evolve failed'); });
      installFakeRuntime(rt);
      const spy = jest.spyOn(console, 'log');
      await runtime.runtimeEvolve({});
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('演化分析失败'));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('evolve failed'));
      expect(process.exit).toHaveBeenCalledWith(1);
      spy.mockRestore();
    });
  });
});
