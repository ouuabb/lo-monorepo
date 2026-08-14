const { EventEmitter } = require('events');
const childProcess = require('child_process');

jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

const docsServe = require('../../src/commands/docs-serve.cjs');

function mockSpawn() {
  const emitter = new EventEmitter();
  emitter.on = jest.fn(emitter.on.bind(emitter));
  childProcess.spawn.mockReturnValue(emitter);
  return emitter;
}

describe('docs serve command', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should spawn vitepress dev with the docs directory', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const emitter = mockSpawn();

    await docsServe();

    expect(childProcess.spawn).toHaveBeenCalledWith(
      'npx',
      ['vitepress', 'dev', expect.stringMatching(/docs$/i)],
      expect.objectContaining({ stdio: 'inherit', shell: true })
    );
    expect(emitter.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(emitter.on).toHaveBeenCalledWith('exit', expect.any(Function));
    expect(exitSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test('should exit 1 when spawn emits an error', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const emitter = mockSpawn();

    await docsServe();
    emitter.emit('error', new Error('npx missing'));

    expect(exitSpy).toHaveBeenCalledWith(1);
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('should exit with the code when vitepress exits non-zero', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const emitter = mockSpawn();

    await docsServe();
    emitter.emit('exit', 3);

    expect(exitSpy).toHaveBeenCalledWith(3);
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('should ignore a clean zero exit', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const emitter = mockSpawn();

    await docsServe();
    emitter.emit('exit', 0);

    expect(exitSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test('should ignore a null exit code', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const emitter = mockSpawn();

    await docsServe();
    emitter.emit('exit', null);

    expect(exitSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
