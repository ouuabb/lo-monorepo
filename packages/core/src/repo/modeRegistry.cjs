/**
 * modeRegistry.cjs —— Usage Mode 注册表（U1）
 *
 * Mode 定义（U0 §2）：
 *   { modeId, semantics, applicableTo: { types?, capabilities? }, rules: { writable, interactive } }
 * builtin Mode 为代码种子（021 §3），不落 DB；插件贡献（U3）落 mode_definitions 表。
 */

class ModeRegistry {
  constructor() {
    this._modes = new Map();
  }

  /**
   * 注册 Mode；同 modeId 冲突抛错
   * @param {{ modeId: string, semantics: string, applicableTo: object, rules: object }} def
   */
  register(def) {
    if (!def || typeof def.modeId !== 'string' || !def.modeId) {
      throw new Error('Mode 定义缺少 modeId');
    }
    if (typeof def.semantics !== 'string' || !def.semantics) {
      throw new Error(`Mode ${def.modeId} 缺少 semantics`);
    }
    if (!def.applicableTo || typeof def.applicableTo !== 'object') {
      throw new Error(`Mode ${def.modeId} 缺少 applicableTo`);
    }
    if (!def.rules || typeof def.rules !== 'object') {
      throw new Error(`Mode ${def.modeId} 缺少 rules`);
    }
    if (this._modes.has(def.modeId)) {
      throw new Error(`Mode 已注册: ${def.modeId}`);
    }
    this._modes.set(def.modeId, { ...def });
    return this;
  }

  /** 取单个 Mode；不存在返回 null */
  get(modeId) {
    return this._modes.get(modeId) || null;
  }

  /** 全部 Mode（注册顺序） */
  list() {
    return [...this._modes.values()];
  }
}

/** builtin Mode（021 §3；annotating/metadata 属 epub 插件贡献，不在 builtin） */
const BUILTIN_MODES = [
  {
    modeId: 'editing',
    semantics: '以编辑方式使用（内容可写）',
    applicableTo: { types: ['note'] },
    rules: { writable: true, interactive: true },
  },
  {
    modeId: 'reading',
    semantics: '以阅读/沉浸方式使用（只读）',
    applicableTo: {
      types: ['pdf', 'image', 'video', 'audio', 'epub', 'html', 'document', 'spreadsheet', 'presentation'],
    },
    rules: { writable: false, interactive: true },
  },
  {
    modeId: 'preview',
    semantics: '只读通用查看（兜底）',
    applicableTo: {},
    rules: { writable: false, interactive: false },
  },
];

function createBuiltinModeRegistry() {
  const registry = new ModeRegistry();
  BUILTIN_MODES.forEach((def) => registry.register(def));
  return registry;
}

module.exports = { ModeRegistry, BUILTIN_MODES, createBuiltinModeRegistry };
