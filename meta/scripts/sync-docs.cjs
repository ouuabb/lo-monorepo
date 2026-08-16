/**
 * sync-docs.cjs —— CLI 运行数据镜像同步（meta → packages/core/docs）
 *
 * 文档分层（总纲 §5/§12.6 + doc-rules 原则 4）：
 *   - meta/core/  = 唯一正式文档源（@lo/core 知识层）
 *   - packages/core/docs/ = CLI 运行功能数据（lo help/manual/docs/docs-serve 读取）
 * 运行数据必须从正式源派生：本脚本把 meta/core/ 全部 .md 单向、幂等同步到
 * packages/core/docs/（同名文件）；core/docs 独有的 index.md / .vitepress/ 保留。
 *
 * 用法：pnpm --filter lo-meta docs:sync
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'meta', 'core');
const DST = path.join(ROOT, 'packages', 'core', 'docs');

/** meta/core 独有文件（目录表等），不同步 */
const SKIP = new Set(['README.md']);

function walk(dir, base, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.join(base, name);
    if (name.startsWith('.')) continue;
    if (fs.statSync(full).isDirectory()) walk(full, rel, acc);
    else if (name.endsWith('.md')) acc.push(rel);
  }
  return acc;
}

function main() {
  const files = walk(SRC, '');
  const updated = [];
  const skipped = [];
  for (const rel of files) {
    if (SKIP.has(rel)) {
      skipped.push(rel);
      continue;
    }
    const src = fs.readFileSync(path.join(SRC, rel), 'utf8');
    const dst = path.join(DST, rel);
    if (fs.existsSync(dst) && fs.readFileSync(dst, 'utf8') === src) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, src, 'utf8');
    updated.push(rel.replace(/\\/g, '/'));
  }
  if (updated.length === 0) {
    console.log('✓ core/docs 与 meta/core 已一致，无需同步');
  } else {
    console.log(`已同步 ${updated.length} 个文件 → packages/core/docs：`);
    for (const u of updated) console.log(`  + ${u}`);
  }
  console.log(`（跳过 meta 独有 ${skipped.length} 个：${skipped.join(', ')}）`);
}

main();
