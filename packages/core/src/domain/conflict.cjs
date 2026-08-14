/**
 * Conflict — 同步冲突模型
 *
 * Phase 5.10: 管理多仓库同步产生的冲突。
 *
 * 类型:
 *   content_conflict  — 内容不一致
 *   relation_conflict — 关系不一致
 *   identity_conflict — ID 冲突
 *
 * 状态:
 *   pending  — 待解决
 *   resolved — 已解决
 *   ignored  — 忽略
 *
 * 策略:
 *   local-win  — 本地版本优先
 *   remote-win — 远程版本优先
 *   manual     — 手动合并
 */

const { nanoid } = (() => {
  try { return require('nanoid'); } catch {
    return {
      nanoid: (n = 12) => {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let id = '';
        for (let i = 0; i < n; i++) id += chars[Math.floor(Math.random() * chars.length)];
        return id;
      }
    };
  }
})();

class Conflict {
  /**
   * @param {object} options
   * @param {string} [options.id]
   * @param {string} options.resource - 涉及资源 ID
   * @param {object} [options.local] - 本地版本数据
   * @param {object} [options.remote] - 远程版本数据
   * @param {'content_conflict'|'relation_conflict'|'identity_conflict'} [options.type]
   * @param {'pending'|'resolved'|'ignored'} [options.status]
   * @param {string} [options.strategy]
   * @param {object} [options.payload]
   * @param {number} [options.created]
   */
  constructor(options = {}) {
    this.id = options.id || `cf_${nanoid(12)}`;
    this.resource = options.resource || '';
    this.local = options.local || null;
    this.remote = options.remote || null;
    this.type = options.type || 'content_conflict';
    this.status = options.status || 'pending';
    this.strategy = options.strategy || '';
    this.payload = options.payload || {};
    this.created = options.created || Date.now();
  }

  /**
   * 解决冲突
   * @param {'local-win'|'remote-win'|'manual'} strategy
   * @returns {{ chosen: object, strategy: string }}
   */
  resolve(strategy) {
    this.strategy = strategy;
    this.status = 'resolved';

    if (strategy === 'local-win') {
      return { chosen: this.local, strategy };
    }
    if (strategy === 'remote-win') {
      return { chosen: this.remote, strategy };
    }
    // manual: caller handles
    return { chosen: null, strategy: 'manual' };
  }

  /**
   * 忽略冲突
   */
  ignore() {
    this.status = 'ignored';
    this.strategy = 'ignored';
  }

  /**
   * 是否待处理
   */
  isPending() {
    return this.status === 'pending';
  }

  /**
   * 是否是内容冲突
   */
  isContent() {
    return this.type === 'content_conflict';
  }

  /**
   * 检测两个值是否冲突
   * @param {object} localObj
   * @param {object} remoteObj
   * @param {Array<string>} [fields] - 要比较的字段
   * @returns {boolean}
   */
  static hasConflict(localObj, remoteObj, fields) {
    if (!localObj || !remoteObj) return true;
    const keys = fields || Object.keys({ ...localObj, ...remoteObj });
    for (const k of keys) {
      if (JSON.stringify(localObj[k]) !== JSON.stringify(remoteObj[k])) {
        return true;
      }
    }
    return false;
  }

  toJSON() {
    return {
      id: this.id,
      resource: this.resource,
      type: this.type,
      status: this.status,
      strategy: this.strategy,
      local: this.local,
      remote: this.remote,
      payload: this.payload,
      created: this.created
    };
  }
}

module.exports = Conflict;
