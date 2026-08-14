/**
 * WorkflowRegistry — Workflow 定义注册表
 *
 * 管理 Workflow 定义的 CRUD 与持久化加载。
 * 注册/更新时执行定义校验。
 */

const WorkflowStore = require('./workflowStore.cjs');
const Workflow = require('./workflow.cjs');

class WorkflowRegistry {
  /**
   * @param {import('../repo/database.cjs')} db
   */
  constructor(db) {
    this.store = new WorkflowStore(db);
    /** @type {Map<string, Workflow>} */
    this._workflows = new Map();
  }

  /**
   * 注册工作流（已存在则报错）
   */
  async register(workflow) {
    return this.create(workflow);
  }

  /**
   * 创建工作流定义并持久化（已存在则报错，修改走 update）
   * @param {object} def — Workflow 构造参数
   * @returns {Promise<Workflow>}
   */
  async create(def) {
    const wf = def instanceof Workflow ? def : new Workflow(def);
    if (this._workflows.has(wf.id)) {
      throw new Error(`Workflow '${wf.id}' is already registered`);
    }
    const errors = wf.validate();
    if (errors.length > 0) {
      throw new Error(`Workflow validation failed: ${errors.join('; ')}`);
    }
    wf.updatedAt = Date.now();
    this._workflows.set(wf.id, wf);
    await this.store.saveDefinition(wf);
    return wf;
  }

  /**
   * 更新工作流定义
   * 定义结构变化（states/transitions）时版本由调用方显式提升（patch.version），
   * 已创建的实例保留创建时的 workflow_version。
   */
  async update(id, patch = {}) {
    const existing = this._workflows.get(id);
    if (!existing) throw new Error(`Workflow '${id}' not found`);

    const next = new Workflow({
      id,
      name: patch.name !== undefined ? patch.name : existing.name,
      description: patch.description !== undefined ? patch.description : existing.description,
      version: patch.version !== undefined ? patch.version : existing.version,
      applicableSchemas: patch.applicableSchemas !== undefined ? patch.applicableSchemas : existing.applicableSchemas,
      states: patch.states !== undefined ? patch.states : existing.states,
      transitions: patch.transitions !== undefined ? patch.transitions : existing.transitions,
      status: patch.status !== undefined ? patch.status : existing.status,
      metadata: patch.metadata !== undefined ? patch.metadata : existing.metadata
    });
    next.createdAt = existing.createdAt;
    next.updatedAt = Date.now();

    const errors = next.validate();
    if (errors.length > 0) {
      throw new Error(`Workflow validation failed: ${errors.join('; ')}`);
    }

    this._workflows.set(id, next);
    await this.store.saveDefinition(next);
    return next;
  }

  /**
   * 注销并软删除（status → deprecated）
   * Workflow 是知识资产：不物理删除，保留定义与全部实例/历史。
   * 若要彻底清理，调用 hardRemove。
   */
  async remove(id) {
    const existing = this._workflows.get(id);
    if (!existing) throw new Error(`Workflow '${id}' not found`);
    existing.status = 'deprecated';
    existing.updatedAt = Date.now();
    await this.store.saveDefinition(existing);
  }

  /**
   * 物理删除工作流（实例/日志级联删除）—— 仅彻底清理时使用
   */
  async hardRemove(id) {
    this._workflows.delete(id);
    await this.store.deleteDefinition(id);
  }

  /**
   * 获取
   */
  get(id) {
    return this._workflows.get(id) || null;
  }

  /**
   * 列出摘要
   */
  list() {
    return Array.from(this._workflows.values()).map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      version: w.version,
      status: w.status,
      applicableSchemas: w.applicableSchemas,
      stateCount: w.states.length,
      transitionCount: w.transitions.length
    }));
  }

  /**
   * 获取指定版本的定义快照（冻结的 definition，用于解释历史实例）
   */
  async getVersion(id, version) {
    return this.store.getDefinitionVersion(id, version);
  }

  /**
   * 列出定义的所有版本快照
   */
  async listVersions(id) {
    return this.store.listDefinitionVersions(id);
  }

  /**
   * 从存储加载
   */
  async load() {
    const defs = await this.store.listDefinitions();
    for (const def of defs) {
      const full = await this.store.getDefinition(def.id);
      if (full) {
        const wf = Workflow.fromJSON(full);
        this._workflows.set(wf.id, wf);
      }
    }
    return this._workflows.size;
  }
}

module.exports = WorkflowRegistry;
