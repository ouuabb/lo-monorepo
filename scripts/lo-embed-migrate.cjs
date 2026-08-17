#!/usr/bin/env node
/**
 * lo-embed-migrate.cjs —— 一次性迁移脚本（一次性使用，不要长期保留）
 *
 * 用途：
 *   把旧 Markdown 仓库里的 path 式图片引用（`./photo.png`）转换为 RID 引用。
 *   适用于 2026-08-17 RID-only embed 模型收敛前已存在的 .md 文件。
 *
 * 用法：
 *   node scripts/lo-embed-migrate.cjs <repo-path> [--dry-run] [--write]
 *
 * 参数：
 *   --dry-run    只输出迁移报告，不修改任何文件
 *   --write      实际修改 .md 文件（默认 dry-run）
 *
 * 工作流程：
 *   1. 扫描 repoPath/resources/ 下所有 .md
 *   2. 解析每个 note 的 Markdown 文本，找出非 RID 路径引用
 *   3. 对每条非 RID 路径引用尝试 L2/L3 解析（同旧 _resolveImageResource 规则）
 *   4. 输出：
 *      - "matched": 命中已有 image Resource → 打印建议替换
 *      - "broken": 命中不到 → 打印待用户手动处理
 *   5. 加 --write 时把 matched 替换为 `![alt](res_xxx)`
 *
 * 注意：
 *   - 这是临时工具；项目未发布、当前开发仓库也不一定存在 path 式引用
 *   - 不进 `lo` 命令、不进 Core 长期代码
 *   - 不通过 @lo/client；直接打开仓库本地 SQLite
 */
const fs = require('fs-extra');
const path = require('path');

const args = process.argv.slice(2);
const repoPath = args.find((a) => !a.startsWith('--'));
const isDryRun = !args.includes('--write');
const isWrite = args.includes('--write');

if (!repoPath) {
  console.error('Usage: node scripts/lo-embed-migrate.cjs <repo-path> [--dry-run|--write]');
  process.exit(1);
}

const absRepo = path.resolve(repoPath);
const dbPath = path.join(absRepo, '.repo', 'database.sqlite');

if (!fs.pathExistsSync(dbPath)) {
  console.error(`Not a lo repository (no .repo/database.sqlite): ${absRepo}`);
  process.exit(1);
}

// 加载 SQLite（better-sqlite3 是 Core 的传递依赖）
let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error('better-sqlite3 not available. Install in packages/core first.');
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });

// 加载所有 image resource
const resources = db
  .prepare(
    "SELECT rid, name, location, location_kind FROM resources WHERE deleted = 0 AND type = 'image'",
  )
  .all();
console.error(`Loaded ${resources.length} image resources from ${dbPath}`);

const byName = new Map();
const byPath = new Map();
for (const r of resources) {
  if (r.location_kind === 'local' && r.location) {
    byPath.set(r.location, r);
  }
  if (r.name) {
    byName.set(r.name, r);
  }
}

// 同旧 _resolveImageResource 逻辑
function resolveImagePath(sourceLocation, targetPath) {
  if (!targetPath) return null;
  if (/^https?:/i.test(targetPath) || /^data:/i.test(targetPath)) return null;
  if (targetPath.startsWith('res_')) {
    const r = resources.find((x) => x.rid === targetPath);
    return r ? r.rid : null;
  }

  // L2: 路径上下文
  if (sourceLocation && sourceLocation.endsWith('.md')) {
    const sourceDir = sourceLocation.replace(/[^/\\]*$/, '');
    const combined = sourceDir + targetPath.replace(/^\.\/?/, '');
    const r = byPath.get(combined);
    if (r) return r.rid;
  }

  // L3: name 规范化
  const basename = path.basename(targetPath, path.extname(targetPath));
  const cleaned = basename
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .replace(/-[a-f0-9]{8}$/, '');
  const r = byName.get(cleaned);
  if (r) return r.rid;

  return null;
}

// 加载 MarkdownParser
const { MarkdownParser } = require(path.join(
  absRepo,
  '..',
  'packages',
  'core',
  'src',
  'utils',
  'markdownParser.cjs',
));

const notes = db
  .prepare(
    "SELECT rid, name, location FROM resources WHERE deleted = 0 AND type = 'note' AND location_kind = 'local' AND location LIKE '%.md'",
  )
  .all();
console.error(`Loaded ${notes.length} note resources`);

let totalMatched = 0;
let totalBroken = 0;
let totalRemote = 0;
const changes = [];

(async () => {
for (const note of notes) {
  const absPath = path.join(absRepo, 'resources', note.location);
  if (!fs.pathExistsSync(absPath)) continue;
  const content = await fs.readFile(absPath, 'utf-8');

  const { embeds } = MarkdownParser.parse(content);
  const nonRidEmbeds = embeds.filter((e) => !e.target_path.startsWith('res_'));
  if (nonRidEmbeds.length === 0) continue;

  let updated = content;
  let noteMatched = 0;
  let noteBroken = 0;
  let noteRemote = 0;

  for (const emb of nonRidEmbeds) {
    if (/^https?:/i.test(emb.target_path) || /^data:/i.test(emb.target_path)) {
      noteRemote++;
      continue;
    }
    const rid = resolveImagePath(note.location, emb.target_path);
    if (rid) {
      noteMatched++;
      // 替换首个匹配
      const oldSnippet = `![${emb.alt}](${emb.target_path}`;
      const newSnippet = `![${emb.alt}](${rid}`;
      const idx = updated.indexOf(oldSnippet);
      if (idx !== -1) {
        updated = updated.slice(0, idx) + newSnippet + updated.slice(idx + oldSnippet.length);
        // 还要把闭合括号后可能存在的 "title" 一并保留
      }
    } else {
      noteBroken++;
    }
  }

  if (noteMatched > 0 || noteBroken > 0 || noteRemote > 0) {
    console.log(`[${note.rid}] ${note.location}: matched=${noteMatched} broken=${noteBroken} remote=${noteRemote}`);
  }
  totalMatched += noteMatched;
  totalBroken += noteBroken;
  totalRemote += noteRemote;

  if (noteMatched > 0 && !isDryRun) {
    await fs.writeFile(absPath, updated, 'utf-8');
    changes.push({ note: note.location, matched: noteMatched });
  }
}

db.close();

console.log('\n--- Summary ---');
console.log(`Matched (will replace path → RID): ${totalMatched}`);
console.log(`Broken (no Resource found): ${totalBroken}`);
console.log(`Remote URLs (skipped, Markdown native): ${totalRemote}`);
console.log(`Mode: ${isDryRun ? 'dry-run (no file changes)' : 'write (files modified)'}`);

if (isDryRun && totalMatched > 0) {
  console.log('\nRe-run with --write to apply changes.');
}
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
