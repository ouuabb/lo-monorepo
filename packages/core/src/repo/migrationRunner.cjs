const path = require('path');
const fs = require('fs');

/**
 * 数据库迁移执行器
 *
 * 职责：
 * - 创建 schema_migrations 追踪表
 * - 扫描 migrations/ 目录，加载所有 NNN_description.cjs 格式的迁移文件
 * - 按编号顺序执行尚未执行过的迁移
 * - 每个迁移在独立事务内执行，失败整组回滚
 * - 迁移失败 → process.exit(1)，拒绝在不确定状态下继续运行
 */

async function createMigrationsTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id TEXT PRIMARY KEY,
      executed_at  TEXT NOT NULL
    )
  `);
}

async function getExecutedMigrationIds(db) {
  const rows = await db.all('SELECT migration_id FROM schema_migrations ORDER BY migration_id');
  return new Set(rows.map(r => r.migration_id));
}

function scanMigrationFiles(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => /^\d{3}_.+\.cjs$/.test(f))
    .sort(); // 按文件名升序 = 按编号升序

  return files.map(file => {
    const migration = require(path.join(migrationsDir, file));

    // 校验导出
    if (!migration.id || !migration.description || typeof migration.up !== 'function') {
      throw new Error(
        `Invalid migration file: ${file}. Expected exports: { id, description, up }`
      );
    }

    // 校验 id 与文件名编号一致
    const expectedPrefix = file.substring(0, 3);
    const actualPrefix = migration.id.substring(0, 3);
    if (expectedPrefix !== actualPrefix) {
      throw new Error(
        `Migration id mismatch: file ${file} has prefix ${expectedPrefix} but exports id "${migration.id}"`
      );
    }

    return { file, migration };
  });
}

async function runMigrations(db, migrationsDir) {
  // 1. 确保追踪表存在（此调用自身不视为迁移）
  await createMigrationsTable(db);

  // 2. 读取已执行列表
  const executed = await getExecutedMigrationIds(db);

  // 3. 扫描迁移文件
  const migrations = scanMigrationFiles(migrationsDir);

  // 4. 找出待执行的
  const pending = migrations.filter(m => !executed.has(m.migration.id));

  if (pending.length === 0) {
    return; // 无待执行迁移，静默跳过
  }

  // 5. 逐个执行
  for (const { migration } of pending) {
    console.log(`[MIGRATION] Running ${migration.id} — ${migration.description}`);

    try {
      await db.exec('BEGIN');
      await migration.up(db);
      await db.run(
        'INSERT INTO schema_migrations (migration_id, executed_at) VALUES (?, ?)',
        [migration.id, new Date().toISOString()]
      );
      await db.exec('COMMIT');
      console.log(`[MIGRATION] Success ${migration.id}`);
    } catch (error) {
      // 回滚尝试（允许失败——回滚本身不应阻碍退出）
      try { await db.exec('ROLLBACK'); } catch {}

      console.error(`[MIGRATION] Failed ${migration.id}: ${error.message}`);
      process.exit(1);
    }
  }
}

module.exports = { runMigrations };
