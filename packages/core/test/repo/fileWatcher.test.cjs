const path = require('path');
const chokidar = require('chokidar');
const FileWatcher = require('../../src/repo/fileWatcher.cjs');

jest.mock('chokidar', () => {
  const createWatcher = () => {
    const watcher = {
      on: jest.fn((event, callback) => {
        return watcher;
      }),
      close: jest.fn()
    };
    return watcher;
  };
  return {
    watch: jest.fn(() => createWatcher())
  };
});

describe('FileWatcher', () => {
  let tempDir, watcher, onEvent;

  beforeEach(async () => {
    tempDir = await testUtils.createTempRepo();
    chokidar.watch.mockClear();
    onEvent = jest.fn();
    watcher = new FileWatcher(tempDir, onEvent);
  });

  afterEach(async () => {
    await testUtils.cleanupTempDir(tempDir);
  });

  function getWatcherMock(index) {
    return chokidar.watch.mock.results[index].value;
  }

  function lastWatcherMock() {
    return getWatcherMock(chokidar.watch.mock.results.length - 1);
  }

  function getHandler(name, index) {
    const mock = index === undefined ? lastWatcherMock() : getWatcherMock(index);
    const call = mock.on.mock.calls.find(c => c[0] === name);
    return call ? call[1] : null;
  }

  test('constructor stores repoPath and onEvent', () => {
    expect(watcher.repoPath).toBe(tempDir);
    expect(watcher.onEvent).toBe(onEvent);
    expect(watcher.watcher).toBeNull();
  });

  test('start wires all chokidar event handlers', () => {
    const ret = watcher.start();
    expect(ret).toBe(watcher);
    expect(chokidar.watch).toHaveBeenCalledWith(tempDir, expect.any(Object));
    const mock = lastWatcherMock();
    expect(mock.on).toHaveBeenCalledWith('add', expect.any(Function));
    expect(mock.on).toHaveBeenCalledWith('change', expect.any(Function));
    expect(mock.on).toHaveBeenCalledWith('unlink', expect.any(Function));
    expect(mock.on).toHaveBeenCalledWith('addDir', expect.any(Function));
    expect(mock.on).toHaveBeenCalledWith('unlinkDir', expect.any(Function));
    expect(mock.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(watcher.watcher).toBe(mock);
  });

  test('start passes ignore and watch options to chokidar', () => {
    watcher.start();
    expect(chokidar.watch).toHaveBeenCalledWith(tempDir, expect.objectContaining({
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false
    }));
    const options = chokidar.watch.mock.calls[0][1];
    expect(options.ignored).toContain('node_modules');
    expect(options.ignored).toContain('.repo');
    expect(options.ignored).toContain('backups');
    expect(options.ignored.some(i => i instanceof RegExp)).toBe(true);
  });

  test('start stops an existing watcher before creating a new one', () => {
    watcher.start();
    const first = getWatcherMock(0);
    watcher.start();
    expect(first.close).toHaveBeenCalled();
    expect(chokidar.watch).toHaveBeenCalledTimes(2);
    expect(watcher.watcher).toBe(getWatcherMock(1));
  });

  test('add handler forwards event payload to onEvent', () => {
    watcher.start();
    getHandler('add')(path.join(tempDir, 'a.md'));
    expect(onEvent).toHaveBeenCalledTimes(1);
    const payload = onEvent.mock.calls[0][0];
    expect(payload.event).toBe('add');
    expect(payload.path).toBe(path.join(tempDir, 'a.md'));
    expect(payload.timestamp).toBeGreaterThan(0);
  });

  test('change handler forwards event payload to onEvent', () => {
    watcher.start();
    getHandler('change')(path.join(tempDir, 'a.md'));
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].event).toBe('change');
  });

  test('unlink handler maps to delete event', () => {
    watcher.start();
    getHandler('unlink')(path.join(tempDir, 'a.md'));
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].event).toBe('delete');
    expect(onEvent.mock.calls[0][0].path).toBe(path.join(tempDir, 'a.md'));
  });

  test('addDir handler forwards addDir event', () => {
    watcher.start();
    getHandler('addDir')(path.join(tempDir, 'sub'));
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].event).toBe('addDir');
    expect(onEvent.mock.calls[0][0].path).toBe(path.join(tempDir, 'sub'));
  });

  test('unlinkDir handler maps to deleteDir event', () => {
    watcher.start();
    getHandler('unlinkDir')(path.join(tempDir, 'sub'));
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].event).toBe('deleteDir');
  });

  test('error handler logs to console.error', () => {
    watcher.start();
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getHandler('error')(new Error('boom'));
    expect(errSpy).toHaveBeenCalledWith('Watcher error:', expect.any(Error));
    errSpy.mockRestore();
  });

  test('stop closes the watcher and clears the reference', () => {
    watcher.start();
    const mock = lastWatcherMock();
    const ret = watcher.stop();
    expect(mock.close).toHaveBeenCalled();
    expect(watcher.watcher).toBeNull();
    expect(ret).toBe(watcher);
  });

  test('stop when never started does not throw', () => {
    expect(watcher.stop()).toBe(watcher);
  });

  test('handles events without an onEvent callback', () => {
    const bare = new FileWatcher(tempDir);
    expect(() => bare._handleEvent('add', '/tmp/x')).not.toThrow();
  });

  test('onEvent is not called when handler fires but callback is missing', () => {
    watcher.start();
    watcher.onEvent = null;
    expect(() => getHandler('add')('/tmp/y')).not.toThrow();
    expect(onEvent).not.toHaveBeenCalled();
  });
});
