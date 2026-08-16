/**
 * usageResolver.cjs —— Mode / Viewer 解析（U1）
 *
 * 解析规则（021 §2/§5）：
 *   - resolveModes：type 精确 > capability 条件 > preview 兜底；有序（注册顺序）返回
 *   - resolveViewers：supports.modes 包含 modeId → 注册顺序；空结果返回 []
 *   - 合并 builtin（代码）∪ 插件（表）；插件与 builtin 同 modeId/viewerId 冲突抛错
 *   - 注册表仅接受 Mode/Viewer 语义，不接收 operations/permission/schema 字段（U0 §6）
 */

const { BUILTIN_MODES } = require('./modeRegistry.cjs');
const { BUILTIN_VIEWERS } = require('./viewerRegistry.cjs');

/** 序列化输出形状（API/调用方所见）：{ modeId, semantics, rules } */
function toModeView(mode) {
  return { modeId: mode.modeId, semantics: mode.semantics, rules: mode.rules };
}

/** 序列化输出形状：{ viewerId, label, semantics, supports } */
function toViewerView(viewer) {
  return { viewerId: viewer.viewerId, label: viewer.label, semantics: viewer.semantics, supports: viewer.supports };
}

function mergeCandidates(builtin, plugin, idKey, kind) {
  const seen = new Map();
  builtin.forEach((def) => seen.set(def[idKey], def));
  for (const def of plugin) {
    if (!def || typeof def[idKey] !== 'string' || !def[idKey]) {
      throw new Error(`${kind} 插件定义缺少 ${idKey}`);
    }
    if (seen.has(def[idKey])) {
      throw new Error(`${kind} 冲突: 插件 ${def[idKey]} 与 builtin 重复`);
    }
    seen.set(def[idKey], def);
  }
  return [...seen.values()];
}

/**
 * 解析资源可用的 Mode（有序）
 * @param {{ type: string, capabilities?: string[] }} resource
 * @param {Array} [pluginModes] — mode_definitions 表读取的插件贡献（U3 写入；U1 读取路径）
 * @returns {Array<{ modeId, semantics, rules }>}
 */
function resolveModes(resource, pluginModes = []) {
  if (!resource || typeof resource.type !== 'string' || !resource.type) {
    throw new Error('resolveModes 需要 resource.type');
  }
  const candidates = mergeCandidates(BUILTIN_MODES, pluginModes, 'modeId', 'Mode');
  const capabilities = Array.isArray(resource.capabilities) ? resource.capabilities : [];

  const matched = [];
  for (const mode of candidates) {
    const applicableTo = mode.applicableTo || {};
    const types = applicableTo.types || [];
    const reqCaps = applicableTo.capabilities || [];
    const typeHit = types.includes(resource.type);
    const capHit = reqCaps.length > 0 && reqCaps.some((c) => capabilities.includes(c));
    if (typeHit || capHit) {
      matched.push(toModeView(mode));
    }
  }
  if (matched.length) return matched;

  const preview = candidates.find((m) => {
    const applicableTo = m.applicableTo || {};
    const types = applicableTo.types || [];
    const reqCaps = applicableTo.capabilities || [];
    return !types.length && !reqCaps.length;
  });
  return preview ? [toModeView(preview)] : [];
}

/**
 * 解析 Mode 可用的 Viewer（有序；空结果返回 []）
 * @param {string} modeId
 * @param {Array} [pluginViewers] — viewer_definitions 表读取的插件贡献（U3 写入；U1 读取路径）
 * @returns {Array<{ viewerId, label, semantics, supports }>}
 */
function resolveViewers(modeId, pluginViewers = []) {
  if (typeof modeId !== 'string' || !modeId) return [];
  const candidates = mergeCandidates(BUILTIN_VIEWERS, pluginViewers, 'viewerId', 'Viewer');
  return candidates
    .filter((v) => Array.isArray(v.supports && v.supports.modes) && v.supports.modes.includes(modeId))
    .map(toViewerView);
}

module.exports = { resolveModes, resolveViewers };
