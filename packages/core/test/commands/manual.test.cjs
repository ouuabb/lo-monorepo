const manual = require('../../src/commands/manual.cjs');

describe('manual command', () => {
  beforeEach(() => {
    process.exit.mockClear();
  });

  test('shows overview when no command given', () => {
    const spy = jest.spyOn(console, 'log');
    manual({ _: ['lo'] });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('lo 命令参考手册'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('用法: lo manual <命令名>'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('shows overview when command is help', () => {
    const spy = jest.spyOn(console, 'log');
    manual({ command: 'help' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('lo 命令参考手册'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('shows overview when command is empty string', () => {
    const spy = jest.spyOn(console, 'log');
    manual({ command: '' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('lo 命令参考手册'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('renders a specific command document', () => {
    const spy = jest.spyOn(console, 'log');
    manual({ command: 'add' });
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('uses argv._[1] as fallback command name', () => {
    const spy = jest.spyOn(console, 'log');
    manual({ _: ['lo', 'add'] });
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  test('reports an unknown command and exits 1', () => {
    const spy = jest.spyOn(console, 'log');
    manual({ command: 'definitely-not-a-real-command' });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('未找到命令'));
    expect(process.exit).toHaveBeenCalledWith(1);
    spy.mockRestore();
  });

  test('overview filters categories to existing md files', () => {
    const spy = jest.spyOn(console, 'log');
    manual({});
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('基础命令'));
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });
});
