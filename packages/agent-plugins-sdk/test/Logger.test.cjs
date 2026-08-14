const { Logger, ConsoleLogger, SilentLogger, fromHost } = require('../src/Logger.cjs');
const SDK = require('../src/index.cjs');

describe('Logger', () => {
  it('Logger 基类为 noop(可调用不抛错)', () => {
    const log = new Logger();
    expect(() => {
      log.debug('a');
      log.info('b');
      log.warn('c');
      log.error('d');
    }).not.toThrow();
    expect(log.child({}).info('x')).toBeUndefined();
  });

  it('SilentLogger 完全静默', () => {
    const log = new SilentLogger();
    const spy = jest.spyOn(console, 'log');
    log.info('x');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('ConsoleLogger 输出到 console', () => {
    const log = new ConsoleLogger('test');
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    log.info('hello');
    expect(spy).toHaveBeenCalledWith('[test]', 'hello');
    spy.mockRestore();
  });

  it('fromHost 包装宿主 logger', () => {
    const host = {
      info: jest.fn(),
      error: jest.fn(),
    };
    const log = fromHost(host);
    log.info('x');
    expect(host.info).toHaveBeenCalledWith('x');
  });

  it('fromHost(null) 返回静默 logger', () => {
    const log = fromHost(null);
    expect(() => log.info('x')).not.toThrow();
  });
});

describe('index.cjs 出口', () => {
  it('暴露稳定 API', () => {
    expect(typeof SDK.AgentPlugin).toBe('function');
    expect(typeof SDK.AgentPluginContext).toBe('function');
    expect(typeof SDK.AgentEventEmitter).toBe('function');
    expect(typeof SDK.validateManifest).toBe('function');
    expect(typeof SDK.createPlugin).toBe('function');
    expect(typeof SDK.Logger).toBe('function');
    expect(typeof SDK.ConsoleLogger).toBe('function');
    expect(typeof SDK.SilentLogger).toBe('function');
    expect(typeof SDK.fromHost).toBe('function');
    expect(typeof SDK.SDK_VERSION).toBe('string');
    expect(SDK.SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
