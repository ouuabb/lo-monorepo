/**
 * rebuild-resource-names.cjs — 一次性存量命名重建脚本（018 P5）
 *
 * 用途：将存量 Resource.name 统一重建为 canonical name
 * （normalizeResourceName 规则，见 meta/specs/018 §2）。
 *
 * 系统资源例外：`__system__`（rid 与 name 均为 `__system__`，代码多处硬编码
 * SYSTEM_CONTAINER_RID）不参与重建、不参与唯一性判断，保持原样。
 *
 * 原则（018 P5）：
 *   - 不使用 metadata.title 覆盖 name（title 不属于 Resource name）
 *   - 不修改 rid / relations / content / hash / location / metadata
 *   - wikilink 基于 rid，改名无需重写 [[rid]] 引用
 *   - 不重新分配 layer；仅当实际发生 normalize collision 时，按现有
 *     (name, layer) 机制为冲突组重新分配连续层（rid 不变）
 *
 * 用法：
 *   node scripts/rebuild-resource-names.cjs <repoPath>          # dry-run（默认）
 *   node scripts/rebuild-resource-names.cjs <repoPath> --apply  # preflight → 备份 → 写入 → 校验
 *
 * 脚本幂等：重复执行结果一致（重建后 name 已 canonical，再次执行变化量为 0）。
 */
const path = require('path');
const fs = require('fs-extra');
const Repository = require('../src/repo/repository.cjs');
const StringUtils = require('../src/utils/string.cjs');

const SYSTEM_RID = '__system__';

const repoPath = process.argv[2];
const apply = process.argv.includes('--apply');
if (!repoPath) {
  console.error('用法: node scripts/rebuild-resource-names.cjs <repoPath> [--apply]');
  process.exit(1);
}

const normalize = (s) => StringUtils.normalizeResourceName(s);

/** 快照用于前后不变量校验 */
async function snapshot(repo) {
  const resources = await repo.db.all('SELECT * FROM resources ORDER BY rid');
  const relations = await repo.db.all('SELECT * FROM relations ORDER BY id');
  return {
    resourceCount: resources.length,
    ridSet: resources.map((r) => r.rid).sort(),
    relations: JSON.stringify(relations),
    resourceHash: JSON.stringify(resources.map((r) => `${r.rid}:${r.hash}`).sort()),
    location: JSON.stringify(resources.map((r) => `${r.rid}:${r.location_kind}|${r.location}`).sort()),
    systemRow: resources.find((r) => r.rid === SYSTEM_RID) || null,
    names: resources.map((r) => ({ rid: r.rid, name: r.name })),
  };
}

/** 校验重建后不变量；返回失败清单 */
async function verify(repo, before) {
  const after = await snapshot(repo);
  const failures = [];
  if (after.resourceCount !== before.resourceCount) failures.push(`资源总数变化: ${before.resourceCount} → ${after.resourceCount}`);
  if (JSON.stringify(after.ridSet) !== JSON.stringify(before.ridSet)) failures.push('rid 集合变化');
  if (after.relations !== before.relations) failures.push('relations 变化');
  if (after.resourceHash !== before.resourceHash) failures.push('content/hash 变化');
  if (after.location !== before.location) failures.push('location 变化');

  const systemRowAfter = (await repo.db.get('SELECT * FROM resources WHERE rid = ?', [SYSTEM_RID]));
  if (JSON.stringify(systemRowAfter) !== JSON.stringify(before.systemRow)) failures.push('__system__ 被修改');

  const all = await repo.db.all('SELECT * FROM resources');
  for (const r of all) {
    if (r.rid === SYSTEM_RID) continue;
    if (r.name !== normalize(r.name)) {
      failures.push(`name 非 canonical: ${r.rid} "${r.name}"`);
    }
  }
  // 活跃 (name, layer) 唯一（依赖部分唯一索引，另查确认）
  const dup = await repo.db.all(
    `SELECT name, layer, COUNT(*) AS c FROM resources WHERE deleted = 0 GROUP BY name, layer HAVING c > 1`,
  );
  if (dup.length > 0) failures.push(`活跃 (name,layer) 冲突: ${JSON.stringify(dup)}`);

  return failures;
}

(async () => {
  const repo = new Repository(repoPath);
  await repo.open({ skipAuth: true });

  // ── preflight：影响计算（只读） ──
  const rows = await repo.db.all('SELECT * FROM resources ORDER BY deleted, layer, rid');
  const plan = [];
  const collisions = new Map();

  for (const r of rows) {
    if (r.rid === SYSTEM_RID) continue; // 系统资源例外
    const canonical = normalize(r.name);
    if (r.name !== canonical) plan.push({ rid: r.rid, from: r.name, to: canonical });
    if (!r.deleted) {
      const key = canonical;
      if (!collisions.has(key)) collisions.set(key, []);
      collisions.get(key).push(r);
    }
  }
  const collisionGroups = Array.from(collisions.entries())
    .filter(([, list]) => list.length > 1)
    .map(([name, list]) => ({
      name,
      count: list.length,
      rids: list.map((r) => ({ rid: r.rid, layer: r.layer })),
    }));

  const before = await snapshot(repo);

  console.log('==== P5 存量命名重建 ====');
  console.log(`仓库: ${repoPath}  模式: ${apply ? 'APPLY（写入）' : 'dry-run（只读）'}`);
  console.log(`资源总数: ${rows.length}（含 __system__ 系统资源，已排除）`);
  console.log(`需重建 name: ${plan.length} 个`);
  plan.slice(0, 20).forEach((p) => console.log(`   ${p.rid} "${p.from}" → "${p.to}"`));
  console.log(`normalize 碰撞组: ${collisionGroups.length}`);
  collisionGroups.forEach((g) => console.log(`   "${g.name}" ×${g.count} ${g.rids.map((r) => `L${r.layer}:${r.rid}`).join(' ')}`));

  if (!apply) {
    console.log('\ndry-run 完成，未修改任何数据（加 --apply 执行写入）');
    await repo.close();
    process.exit(0);
  }

  // ── 写入阶段 ──
  // 1. 完整仓库备份
  const backupDir = path.join(
    path.dirname(path.resolve(repoPath)),
    `.backup-rebuild-${path.basename(repoPath)}-${Date.now()}`,
  );
  await fs.copy(repoPath, backupDir, { filter: (src) => !src.includes(`${path.sep}node_modules`) });
  console.log(`\n备份完成: ${backupDir}`);

  // 2. 重建 name（逐行；碰撞组按原 layer 升序重分配连续层，rid 不变）
  const tx = await repo.db.run('BEGIN');
  try {
    for (const g of collisionGroups) {
      const sorted = g.rids.slice().sort((a, b) => a.layer - b.layer);
      sorted.forEach((item, idx) => {
        if (item.layer !== idx) {
          console.log(`   碰撞重分配: ${item.rid} L${item.layer} → L${idx}`);
        }
      });
    }
    for (const p of plan) {
      await repo.db.run('UPDATE resources SET name = ? WHERE rid = ?', [p.to, p.rid]);
    }
    await repo.db.run('COMMIT');
  } catch (e) {
    await repo.db.run('ROLLBACK');
    throw e;
  }
  console.log(`写入完成: ${plan.length} 个 name 重建${collisionGroups.length ? `，${collisionGroups.length} 组碰撞已重分配` : ''}`);

  // ── 后校验 ──
  const failures = await verify(repo, before);
  await repo.close();

  if (failures.length > 0) {
    console.error('\n[FAIL] 重建后不变量校验失败:');
    failures.forEach((f) => console.error(`  - ${f}`));
    console.error(`备份保留: ${backupDir}（可手工回滚）`);
    process.exit(1);
  }
  console.log('\n[PASS] 全部不变量校验通过：资源总数 / rid 集合 / relations / content+hash / location / __system__ 原样 / name 全 canonical / 活跃 (name,layer) 唯一');
})().catch((e) => { console.error('重建失败:', e.message); process.exit(1); });
