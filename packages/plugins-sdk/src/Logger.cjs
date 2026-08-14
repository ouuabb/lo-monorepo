/**
 * Logger —— SDK 定义的统一日志接口
 *
 * 插件内部应始终通过 context.logger 打印日志，
 * 而不要直接用 console.log —— 这样 Core 可以统一做日志级别、重定向到文件。
 *
 * 此文件只提供接口 + 一个 console 实现（用于测试/本地插件）。
 * 真实运行时的 logger 由 lo Core 注入，可能是分级 logger 或文件输出 logger。
 */
class Logger {
  /**
   * @param {object} [options]
   * @param {string} [options.prefix] 日志前缀（一般为插件 ID）
   * @param {object} [options.target] 实际输出目标，默认为 console
   */
  constructor(options = {}) {
    this._prefix = options.prefix ? `[${options.prefix}] ` : '';
    this._target = options.target || console;
    this._level = options.level || 'debug';
  }

  _shouldLog(level) {
    const order = { debug: 0, info: 1, warn: 2, error: 3, silent: 99 };
    return order[level] >= (order[this._level] ?? 0);
  }

  debug(...args) { if (this._shouldLog('debug')) this._target.log(this._prefix + '[DEBUG]', ...args); }
  info(...args)  { if (this._shouldLog('info'))  this._target.info(this._prefix + '[INFO]',  ...args); }
  warn(...args)  { if (this._shouldLog('warn'))  this._target.warn(this._prefix + '[WARN]',  ...args); }
  error(...args) { if (this._shouldLog('error')) this._target.error(this._prefix + '[ERROR]', ...args); }

  /**
   * 创建子 logger，继承前缀
   * @param {string} subPrefix 子前缀（如 'importer' / 'watch'）
   */
  child(subPrefix) {
    const newPrefix = this._prefix ? this._prefix.replace(/^\[/, '').replace(/\] $/, '') + ':' + subPrefix : subPrefix;
    return new Logger({ prefix: newPrefix, target: this._target, level: this._level });
  }
}

/** 打印所有级别的 console logger（开发默认） */
Logger.console = (prefix) => new Logger({ prefix, target: console, level: 'debug' });

/** 静默 logger（测试默认） */
Logger.silent = () => new Logger({ target: { log(){}, info(){}, warn(){}, error(){} }, level: 'silent' });

module.exports = Logger;
