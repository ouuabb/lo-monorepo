/**
 * viewerRegistry.cjs —— Usage Viewer 注册表（U1）
 *
 * Viewer 定义（U0 §4）：
 *   { viewerId, label, semantics, supports: { modes: string[] } }
 * Viewer 自行声明 supports.modes，不建立 Mode→Viewer 映射表（双向解耦）。
 * builtin Viewer 为代码种子（021 §3），不落 DB；插件贡献（U3）落 viewer_definitions 表。
 */

class ViewerRegistry {
  constructor() {
    this._viewers = new Map();
  }

  /**
   * 注册 Viewer；同 viewerId 冲突抛错
   * @param {{ viewerId: string, label: string, semantics: string, supports: object }} def
   */
  register(def) {
    if (!def || typeof def.viewerId !== 'string' || !def.viewerId) {
      throw new Error('Viewer 定义缺少 viewerId');
    }
    if (typeof def.label !== 'string' || !def.label) {
      throw new Error(`Viewer ${def.viewerId} 缺少 label`);
    }
    if (typeof def.semantics !== 'string' || !def.semantics) {
      throw new Error(`Viewer ${def.viewerId} 缺少 semantics`);
    }
    if (!def.supports || !Array.isArray(def.supports.modes)) {
      throw new Error(`Viewer ${def.viewerId} 缺少 supports.modes`);
    }
    if (this._viewers.has(def.viewerId)) {
      throw new Error(`Viewer 已注册: ${def.viewerId}`);
    }
    this._viewers.set(def.viewerId, { ...def });
    return this;
  }

  /** 取单个 Viewer；不存在返回 null */
  get(viewerId) {
    return this._viewers.get(viewerId) || null;
  }

  /** 全部 Viewer（注册顺序） */
  list() {
    return [...this._viewers.values()];
  }
}

/** builtin Viewer（021 §3） */
const BUILTIN_VIEWERS = [
  {
    viewerId: 'viewer.markdown-editor',
    label: 'Markdown 编辑器',
    semantics: 'Markdown 内容编辑',
    supports: { modes: ['editing'] },
  },
  {
    viewerId: 'viewer.generic-preview',
    label: '通用预览',
    semantics: '通用只读呈现',
    supports: { modes: ['reading', 'preview'] },
  },
];

function createBuiltinViewerRegistry() {
  const registry = new ViewerRegistry();
  BUILTIN_VIEWERS.forEach((def) => registry.register(def));
  return registry;
}

module.exports = { ViewerRegistry, BUILTIN_VIEWERS, createBuiltinViewerRegistry };
