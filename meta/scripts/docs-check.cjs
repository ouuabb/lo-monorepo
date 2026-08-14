/**
 * docs-check.cjs —— meta 文档一致性校验（唯一文档源）
 *
 * 只校验机器可确定事实，不校验语义：
 *   1. meta 必需文档/目录存在
 *   2. meta/*.md 中引用的 monorepo 内路径存在（backtick 内 packages/apps/plugins/meta/docs 前缀）
 *   3. 生成结果幂等：docs-gen 生成的文件与现有内容一致
 *
 * 用法：pnpm --filter lo-meta check  或  node meta/scripts/docs-check.cjs
 */
const fs = require('fs');
const path = require('path');
const { generate } = require('./docs-gen.cjs');

const ROOT = path.resolve(__dirname, '..', '..'); // monorepo 根
const META = path.join(ROOT, 'meta');
const REF_PATTERN = /`((?:packages|apps|plugins|meta|docs)\/[^`\s]+)`/g;

const errors = [];
const ok = (cond, msg) => {
  if (!cond) errors.push(msg);
};

// 1) 必需文档/目录
const required = [
  'meta/AGENTS.md',
  'meta/index.md',
  'meta/doc-rules.md',
  'meta/progress.md',
  'meta/architecture/index.md',
  'meta/architecture/core.md',
  'meta/architecture/client.md',
  'meta/architecture/plugins-sdk.md',
  'meta/architecture/agent-plugins-sdk.md',
  'meta/architecture/agent.md',
  'meta/architecture/plugins-core.md',
  'meta/architecture/plugins-agent.md',
  'meta/core/README.md',
  'meta/plugins-sdk/README.md',
  'meta/lo-plugins/README.md',
  'meta/agent/index.md',
  'meta/lo-agent-plugins/index.md',
  'meta/agent-plugins-sdk/index.md',
  'meta/api/index.md',
  'meta/api/client.md',
  'meta/api/plugins-sdk.md',
  'meta/api/agent-plugins-sdk.md',
  'meta/api/ipc-channels.md',
  'meta/guides/index.md',
  'meta/design/index.md',
  'meta/plugins/core.md',
  'meta/plugins/agent.md',
  'meta/specs',
  'meta/setup/README.md',
  'meta/setup/migration.md',
  'meta/package.json',
  'meta/scripts/docs-gen.cjs',
  'meta/scripts/docs-check.cjs',
];
for (const f of required) ok(fs.existsSync(path.join(ROOT, f)), `缺失 ${f}`);

// 2) 引用路径存在（仅 monorepo 内局部路径，backtick 内 packages/apps/plugins/meta/docs 前缀）
function scanFile(file) {
  if (!fs.existsSync(file)) return;
  const txt = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = REF_PATTERN.exec(txt)) !== null) {
    const rel = m[1];
    // 跳过含通配/占位符的引用（如 docs/**/*.md、packages/<id>/）
    if (/[*{}$<>]/.test(rel)) continue;
    ok(fs.existsSync(path.resolve(ROOT, rel)), `${path.relative(ROOT, file)}: 引用路径不存在: ${rel}`);
  }
}

// 迁移内容目录（含旧 vitepress 内部链接，不参与 markdown 链接校验）
const LEGACY_DIRS = ['core', 'agent', 'lo-agent-plugins', 'agent-plugins-sdk', 'plugins-sdk', 'lo-plugins', 'specs'];

// 2b) 策展文档的 markdown 链接存在性校验（相对链接；跳过外部/锚点/生成目录）
const LINK_PATTERN = /\]\(([^)]+)\)/g;
function isCurated(file) {
  const rel = path.relative(META, file).replace(/\\/g, '/');
  return !LEGACY_DIRS.some((d) => rel === d || rel.startsWith(d + '/'));
}
function scanLinks(file) {
  if (!fs.existsSync(file) || !isCurated(file)) return;
  const txt = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  let m;
  while ((m = LINK_PATTERN.exec(txt)) !== null) {
    let target = m[1].split('#')[0].trim();
    if (!target || /^(https?:|mailto:|#)/.test(target)) continue;
    if (/[*{}$<>]/.test(target)) continue;
    if (/\.(cjs|jsonc|baseline)$/.test(target)) continue;
    const abs = path.resolve(dir, target);
    ok(
      fs.existsSync(abs) || fs.existsSync(abs + '.md') || fs.existsSync(path.join(abs, 'index.md')),
      `${path.relative(ROOT, file)}: 链接目标不存在: ${target}`,
    );
  }
}
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name.startsWith('.') || name === 'node_modules') continue;
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.md')) {
      if (isCurated(full)) scanFile(full);
      scanLinks(full);
    }
  }
}
walk(META);

// 3) 生成结果幂等（docs-gen 生成文件与现有内容一致）
for (const [rel, content] of Object.entries(generate())) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    errors.push(`生成文件缺失 ${rel}：请运行 pnpm --filter lo-meta docs:gen`);
  } else if (fs.readFileSync(p, 'utf8') !== content) {
    errors.push(`生成文件过期 ${rel}：请运行 pnpm --filter lo-meta docs:gen`);
  }
}

if (errors.length) {
  console.error('✗ meta 文档检查失败：');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('✓ meta 文档检查通过');
