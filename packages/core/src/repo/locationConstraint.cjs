/**
 * locationConstraint.cjs —— Resource Location 唯一性约束错误工具
 *
 * 唯一性语义（016 §6 定稿）：只有 local Resource Location 具有仓库内物理路径
 * 唯一性约束（active + layer=0）；external 同一绝对路径可被多个 Resource 引用；
 * virtual 不参与。数据库唯一索引（idx_resources_location_active）负责最终一致性，
 * 应用层只负责把约束冲突转换为可读的 LOCATION_CONFLICT 错误。
 */

/** 判断错误是否为 resources.location 唯一约束冲突（idx_resources_location_active） */
function isLocationConstraintError(e) {
  if (!e) return false;
  const msg = e && e.message ? e.message : '';
  return /UNIQUE constraint failed: resources\.location/i.test(msg);
}

/**
 * 构造可读的 LOCATION_CONFLICT 错误（与 RESOURCE_EXISTS 同风格：Error + code）
 * @param {object} [context] — { location, rid, operation }
 */
function locationConflictError(context = {}) {
  const parts = [
    'LOCATION_CONFLICT: 目标 local location 已被占用',
  ];
  if (context.location) parts.push(`location=${context.location}`);
  if (context.rid) parts.push(`rid=${context.rid}`);
  if (context.operation) parts.push(`operation=${context.operation}`);
  const err = new Error(
    `${parts.join('；')}（external/virtual 不参与 location 唯一性）`,
  );
  err.code = 'LOCATION_CONFLICT';
  return err;
}

module.exports = {
  isLocationConstraintError,
  locationConflictError,
};
