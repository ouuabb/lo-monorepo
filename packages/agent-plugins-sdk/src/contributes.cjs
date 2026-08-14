/**
 * contributes.cjs —— 解析 manifest.contributes 为扩展点声明列表
 *
 * manifest.contributes 结构（纯数据）：
 *   {
 *     commands: [{ id, title }],
 *     views:    [{ id, title, type, ... }],
 *     panels:   [{ id, title }],
 *     editors:  [{ id, title, resourceType }],
 *     services: [{ id, expose }],
 *   }
 *
 * parseContributes 将每个条目结构化为 ExtensionPoint（纯数据，无 handler）。
 * SDK 只做解析/校验；注册与管理由 Host ExtensionRegistry 负责。
 */
const { createExtensionPoint, EXTENSION_TYPES } = require('./extension-point.cjs');

/**
 * 解析 manifest.contributes 为扩展点列表
 * @param {object} manifest — 插件 manifest
 * @returns {Array<object>} ExtensionPoint[]（纯数据）
 */
function parseContributes(manifest = {}) {
  const contributes = manifest.contributes || {};
  const pluginId = manifest.id;
  const points = [];

  if (!pluginId) return points;

  for (const type of EXTENSION_TYPES) {
    const entries = Array.isArray(contributes[type]) ? contributes[type] : [];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      try {
        const point = createExtensionPoint({
          pluginId,
          type,
          id: entry.id,
          title: entry.title,
          metadata: entry.metadata || pickMetadata(type, entry),
        });
        points.push(point);
      } catch (e) {
        console.error(`[contributes] ${pluginId} 扩展点解析失败 (${type}): ${e.message}`);
      }
    }
  }

  return points;
}

/**
 * 从条目提取类型特定 metadata（不含 id/title）
 */
function pickMetadata(type, entry) {
  const meta = { ...entry };
  delete meta.id;
  delete meta.title;
  if (type === 'views' && meta.type === undefined) delete meta.type;
  return meta;
}

module.exports = { parseContributes };
