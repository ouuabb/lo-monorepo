/**
 * AutomationRegistry — Automation 定义注册表
 *
 * 管理 Automation 定义的 CRUD 与持久化加载。
 * 注册/更新时执行定义校验。
 */

const AutomationStore = require('./AutomationStore.cjs');
const Automation = require('./Automation.cjs');

class AutomationRegistry {
  /**
   * @param {import('../repo/database.cjs')} db
   */
  constructor(db) {
    this.store = new AutomationStore(db);
    /** @type {Map<string, Automation>} */
    this._automations = new Map();
  }

  /**
   * 创建 Automation 定义并持久化（已存在则报错，修改走 update）
   * @param {object} def — Automation 构造参数
   * @returns {Promise<Automation>}
   */
  async create(def) {
    const auto = def instanceof Automation ? def : new Automation(def);
    if (this._automations.has(auto.id)) {
      throw new Error(`Automation '${auto.id}' is already registered`);
    }
    const errors = auto.validate();
    if (errors.length > 0) {
      throw new Error(`Automation validation failed: ${errors.join('; ')}`);
    }
    auto.updatedAt = Date.now();
    this._automations.set(auto.id, auto);
    await this.store.saveAutomation(auto);
    return auto;
  }

  /**
   * 更新 Automation 定义
   */
  async update(id, patch = {}) {
    const existing = this._automations.get(id);
    if (!existing) throw new Error(`Automation '${id}' not found`);

    const next = new Automation({
      id,
      name: patch.name !== undefined ? patch.name : existing.name,
      description: patch.description !== undefined ? patch.description : existing.description,
      source: patch.source !== undefined ? patch.source : existing.source,
      trigger: patch.trigger !== undefined ? patch.trigger : existing.trigger,
      condition: patch.condition !== undefined ? patch.condition : existing.condition,
      actions: patch.actions !== undefined ? patch.actions : existing.actions,
      policy: patch.policy !== undefined ? patch.policy : existing.policy,
      status: patch.status !== undefined ? patch.status : existing.status,
      metadata: patch.metadata !== undefined ? patch.metadata : existing.metadata
    });
    next.createdAt = existing.createdAt;
    next.updatedAt = Date.now();

    const errors = next.validate();
    if (errors.length > 0) {
      throw new Error(`Automation validation failed: ${errors.join('; ')}`);
    }

    this._automations.set(id, next);
    await this.store.saveAutomation(next);
    return next;
  }

  /**
   * 启用
   */
  async enable(id) {
    const existing = this._automations.get(id);
    if (!existing) throw new Error(`Automation '${id}' not found`);
    existing.status = 'active';
    existing.updatedAt = Date.now();
    await this.store.updateAutomationStatus(id, 'active');
    return existing;
  }

  /**
   * 停用
   */
  async disable(id) {
    const existing = this._automations.get(id);
    if (!existing) throw new Error(`Automation '${id}' not found`);
    existing.status = 'inactive';
    existing.updatedAt = Date.now();
    await this.store.updateAutomationStatus(id, 'inactive');
    return existing;
  }

  /**
   * 删除（物理删除定义及其历史）
   */
  async remove(id) {
    const existing = this._automations.get(id);
    if (!existing) throw new Error(`Automation '${id}' not found`);
    this._automations.delete(id);
    await this.store.deleteAutomation(id);
    await this.store.deleteRuns(id);
  }

  /**
   * 获取
   */
  get(id) {
    return this._automations.get(id) || null;
  }

  /**
   * 列出摘要
   */
  list() {
    return Array.from(this._automations.values()).map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      source: a.source,
      trigger: a.trigger,
      status: a.status,
      actionCount: a.actions.length,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt
    }));
  }

  /**
   * 按来源列出
   */
  listBySource(type) {
    return this.list().filter((a) => a.source && a.source.type === type);
  }

  /**
   * 从存储加载
   */
  async load() {
    const defs = await this.store.listAutomations();
    for (const def of defs) {
      const full = await this.store.getAutomation(def.id);
      if (full) {
        this._automations.set(full.id, full);
      }
    }
    return this._automations.size;
  }
}

module.exports = AutomationRegistry;