/**
 * extensionCommand.isCliCommand 单元测试
 *
 * commands 扩展点同时承载 CLI 命令与 HTTP 端点，
 * 本测试验证 isCliCommand 能正确区分两类 handler。
 */

const { isCliCommand } = require('../../src/plugin/extensionCommand.cjs');

describe('isCliCommand', () => {
  test('handler 为普通函数 → true', () => {
    expect(isCliCommand(() => {})).toBe(true);
    expect(isCliCommand(async () => {})).toBe(true);
  });

  test('handler 为 { run, description } 结构 → true', () => {
    expect(isCliCommand({ run: async () => {}, description: 'x' })).toBe(true);
    expect(isCliCommand({ run() {}, description: 'y' })).toBe(true);
  });

  test('HTTP 端点 { method, path, handler } → false', () => {
    const httpEndpoint = {
      method: 'GET',
      path: '/api/plugins/x/reader',
      handler: async () => {},
      description: '页面',
    };
    expect(isCliCommand(httpEndpoint)).toBe(false);
  });

  test('HTTP 端点即使 method/path/handler 齐全也不误判为 CLI', () => {
    const endpoint = {
      method: 'POST',
      path: '/api/plugins/x/notes',
      handler: async () => {},
    };
    expect(isCliCommand(endpoint)).toBe(false);
  });

  test('边界值 → false', () => {
    expect(isCliCommand(null)).toBe(false);
    expect(isCliCommand(undefined)).toBe(false);
    expect(isCliCommand(0)).toBe(false);
    expect(isCliCommand('str')).toBe(false);
    expect(isCliCommand({})).toBe(false);
    expect(isCliCommand({ description: 'no run' })).toBe(false);
    expect(isCliCommand({ run: 'not-a-function' })).toBe(false);
  });
});
