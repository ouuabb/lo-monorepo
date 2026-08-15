// 003_name_layer_partial_unique — (name, layer) 唯一约束改为部分唯一（018 §6/§8）
// 软删记录（deleted=1）不再占用 (name, layer) → 删除不再修改 name，
// 删除后同名 layer0 可重建；undo 原样恢复。

module.exports = {
  id: '003_name_layer_partial_unique',
  description: 'Restrict name-layer uniqueness to active resources',

  async up(db) {
    await db.exec('DROP INDEX IF EXISTS idx_resources_name_layer');
    await db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_name_layer
        ON resources(name, layer)
        WHERE deleted = 0
    `);
  },
};
