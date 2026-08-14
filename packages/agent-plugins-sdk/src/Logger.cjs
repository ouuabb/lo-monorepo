/**
 * Logger —— 统一日志接口 + 内置实现
 *
 * 插件通过 ctx.logger 访问日志。宿主(lo-agent)可注入自定义 logger；
 * 未注入时提供 console 实现(开发期)与 silent 实现(测试/静默场景)。
 */
class Logger {
  debug(...args) {}
  info(...args) {}
  warn(...args) {}
  error(...args) {}
  child(_fields) {
    return this;
  }
}

/** 输出到 console 的实现(带 [agent-plugin] 前缀) */
class ConsoleLogger extends Logger {
  constructor(prefix = 'agent-plugin') {
    super();
    this._prefix = prefix;
  }

  debug(...args) {
    // eslint-disable-next-line no-console
    console.debug(`[${this._prefix}]`, ...args);
  }

  info(...args) {
    // eslint-disable-next-line no-console
    console.info(`[${this._prefix}]`, ...args);
  }

  warn(...args) {
    // eslint-disable-next-line no-console
    console.warn(`[${this._prefix}]`, ...args);
  }

  error(...args) {
    // eslint-disable-next-line no-console
    console.error(`[${this._prefix}]`, ...args);
  }

  child(fields = {}) {
    const scope = Object.keys(fields).length
      ? `${this._prefix}:${Object.values(fields).join(':')}`
      : this._prefix;
    return new ConsoleLogger(scope);
  }
}

/** 完全静默的实现(测试/生产静音) */
class SilentLogger extends Logger {}

/** 由宿主注入的实现适配:将宿主 logger 包装为 Logger 接口 */
function fromHost(hostLogger) {
  if (!hostLogger) return new SilentLogger();
  const wrap = (method) =>
    typeof hostLogger[method] === 'function' ? hostLogger[method].bind(hostLogger) : () => {};
  const logger = new Logger();
  logger.debug = wrap('debug');
  logger.info = wrap('info');
  logger.warn = wrap('warn');
  logger.error = wrap('error');
  if (typeof hostLogger.child === 'function') {
    logger.child = (f) => fromHost(hostLogger.child(f));
  }
  return logger;
}

module.exports = { Logger, ConsoleLogger, SilentLogger, fromHost };
