/**
 * GlobalResourceId — 全局资源标识
 *
 * Phase 5.10: 解决多仓库环境下 Resource 唯一性问题。
 *
 * 格式: <namespace>:<localId>
 *
 * 示例:
 *   personal:note001
 *   projectA:file123
 *   github:openai/chatgpt
 *
 * 解析:
 *   GlobalRID.parse("personal:note001")
 *   → { namespace: "personal", localId: "note001" }
 */

const GLOBAL_ID_SEPARATOR = ':';

class GlobalRID {
  /**
   * @param {string} namespace
   * @param {string} localId
   */
  constructor(namespace, localId) {
    if (!namespace || !localId) {
      throw new Error('GlobalRID: namespace and localId are required');
    }
    if (namespace.includes(GLOBAL_ID_SEPARATOR)) {
      throw new Error(`GlobalRID: namespace must not contain "${GLOBAL_ID_SEPARATOR}"`);
    }
    this.namespace = namespace;
    this.localId = localId;
  }

  /**
   * 完整全局 ID 字符串
   */
  toString() {
    return `${this.namespace}${GLOBAL_ID_SEPARATOR}${this.localId}`;
  }

  /**
   * 判断是否为全局 ID
   */
  static isGlobal(id) {
    if (typeof id !== 'string') return false;
    const idx = id.indexOf(GLOBAL_ID_SEPARATOR);
    return idx > 0 && idx < id.length - 1;
  }

  /**
   * 解析全局 ID 字符串
   * @param {string} str - "namespace:localId"
   * @returns {GlobalRID|null}
   */
  static parse(str) {
    if (typeof str !== 'string') return null;

    const idx = str.indexOf(GLOBAL_ID_SEPARATOR);
    if (idx <= 0 || idx >= str.length - 1) return null;

    const ns = str.slice(0, idx);
    const lid = str.slice(idx + 1);

    if (!ns || !lid) return null;

    return new GlobalRID(ns, lid);
  }

  /**
   * 从 namespace + localId 创建全局 ID 字符串
   */
  static create(namespace, localId) {
    return new GlobalRID(namespace, localId).toString();
  }

  /**
   * 获取 namespace 部分
   */
  static namespace(str) {
    const idx = str.indexOf(GLOBAL_ID_SEPARATOR);
    if (idx <= 0) return null;
    return str.slice(0, idx);
  }

  /**
   * 获取 localId 部分
   */
  static localId(str) {
    const idx = str.indexOf(GLOBAL_ID_SEPARATOR);
    if (idx <= 0 || idx >= str.length - 1) return str;
    return str.slice(idx + 1);
  }

  /**
   * 当前 repo 的 rid 转换为全局 ID
   * @param {string} localRid
   * @param {string} defaultNamespace
   */
  static fromLocal(localRid, defaultNamespace) {
    if (!defaultNamespace) return localRid;
    return `${defaultNamespace}${GLOBAL_ID_SEPARATOR}${localRid}`;
  }

  /**
   * 全局 ID 剥离 namespace，只留 localId
   */
  static toLocal(globalId) {
    return GlobalRID.localId(globalId) || globalId;
  }

  toJSON() {
    return {
      namespace: this.namespace,
      localId: this.localId,
      globalId: this.toString()
    };
  }
}

module.exports = GlobalRID;
