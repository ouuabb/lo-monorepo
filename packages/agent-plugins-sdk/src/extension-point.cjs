/**
 * extension-point.cjs —— 扩展点声明数据
 *
 * 扩展点是插件声明的**纯数据**（无 Function），用于 Host 注册/查询/管理。
 * 可执行能力（命令执行等）经 `ctx.extensions.registerCommands` 运行时注册，
 * 由 Host ExtensionRegistry 持有 handler；声明数据本身始终为纯数据。
 *
 * 结构：
 *   pluginId  — 来源插件 ID
 *   type      — 扩展点类型（commands/views/panels/editors/services）
 *   id        — 扩展点 ID（插件内唯一）
 *   title     — 显示名（可选）
 *   metadata  — 类型特定元数据（可选）
 *
 * 设计原因：
 *   - ExtensionRegistry 需要可序列化
 *   - SDK 不持有运行时函数
 *   - 避免 SDK 与 Host 生命周期耦合
 */
const EXTENSION_TYPES = ['commands', 'views', 'panels', 'editors', 'services'];

/**
 * 构造扩展点声明数据（含基础校验）
 * @param {object} def
 * @param {string} def.pluginId
 * @param {string} def.type — EXTENSION_TYPES 之一
 * @param {string} def.id
 * @param {string} [def.title]
 * @param {object} [def.metadata]
 * @returns {{ pluginId, type, id, title, metadata }}
 * @throws {Error} 校验失败时抛错
 */
function createExtensionPoint(def = {}) {
  const errors = [];
  if (!def.pluginId || typeof def.pluginId !== 'string') {
    errors.push('pluginId 必填字符串');
  }
  if (!EXTENSION_TYPES.includes(def.type)) {
    errors.push(`type 必须是 ${EXTENSION_TYPES.join('/')} 之一`);
  }
  if (!def.id || typeof def.id !== 'string') {
    errors.push('id 必填字符串');
  }
  if (def.title !== undefined && typeof def.title !== 'string') {
    errors.push('title 必须是字符串');
  }
  if (def.metadata !== undefined && (typeof def.metadata !== 'object' || Array.isArray(def.metadata))) {
    errors.push('metadata 必须是普通对象');
  }
  if (errors.length > 0) {
    throw new Error(`[extension-point] ${errors.join('; ')}`);
  }

  const point = {
    pluginId: def.pluginId,
    type: def.type,
    id: def.id,
  };
  if (def.title !== undefined) point.title = def.title;
  if (def.metadata !== undefined) point.metadata = def.metadata;
  return point;
}

module.exports = { createExtensionPoint, EXTENSION_TYPES };
