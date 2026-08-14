/**
 * Operation Handler Loader
 *
 * 自动加载 `src/operations/` 下所有非 index 的 handler 文件，
 * 并注册到 OperationRegistry。
 *
 * Phase 4.5
 */

const path = require('path');
const fs = require('fs');

const OP_DIR = __dirname;

function loadOperations(registry) {
  const files = fs.readdirSync(OP_DIR).filter(f =>
    f.endsWith('.cjs') && f !== 'index.cjs'
  );

  const loaded = [];

  for (const file of files) {
    const handler = require(path.join(OP_DIR, file));
    if (handler.type && handler.execute && handler.undo) {
      registry.register(handler.type, handler);
      loaded.push(handler.type);
    }
  }

  return loaded;
}

module.exports = { loadOperations };
