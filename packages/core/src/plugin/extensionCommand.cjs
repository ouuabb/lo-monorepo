/**
 * 判断 commands 扩展点的 handler 是否为可运行的 CLI 命令
 *
 * commands 扩展点同时承载两类注册：
 *   - CLI 命令：handler 为函数，或 { run: fn, description } 结构
 *   - HTTP 端点：handler 为 { method, path, handler, description } 结构
 * 本函数用于区分两者，使 `lo ext` 只列出/调度可运行的 CLI 命令。
 *
 * @param {any} handler — 扩展点 handler 对象
 * @returns {boolean} 是否可运行的 CLI 命令
 */
function isCliCommand(handler) {
  return !!handler && (
    typeof handler === 'function' ||
    typeof handler.run === 'function'
  );
}

module.exports = { isCliCommand };
