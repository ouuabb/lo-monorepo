#!/usr/bin/env node

if (process.version.match(/v(\d+)\./)[1] < 14) {
  console.error('需要 Node.js v14 或更高版本');
  process.exit(1);
}

require('../src/cli.cjs');