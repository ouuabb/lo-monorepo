const fs = require('fs');
const help = require('../../src/commands/help.cjs');

describe('help command', () => {
  test('should print grouped command overview and exit 0', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    help({ _: ['lo', 'help'] });

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy.mock.calls.length).toBeGreaterThan(0);
    const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(output).toContain('使用 lo <command> --help 查看详细帮助');
    logSpy.mockRestore();
  });

  test('should fall back to empty list when the commands dir is missing', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    jest.spyOn(fs, 'readdirSync').mockImplementationOnce(() => { throw new Error('ENOENT'); });

    help({ _: ['lo', 'help'] });

    expect(exitSpy).toHaveBeenCalledWith(0);
    logSpy.mockRestore();
  });

  test('should render commands whose md files exist', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => {});

    help({ _: ['lo', 'help'] });

    const output = logSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(output).toContain('基础命令');
    logSpy.mockRestore();
  });
});
