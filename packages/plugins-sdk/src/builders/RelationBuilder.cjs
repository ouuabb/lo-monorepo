/**
 * RelationBuilder —— 构造符合 lo Core 契约的 Relation 对象
 *
 * 使用：
 *   const rel = RelationBuilder
 *     .from(bookRid)
 *     .to(chapter1Rid)
 *     .type('contains')
 *     .meta('order', 1)
 *     .build();
 *
 *   await context.relations.create(rel);
 */
class RelationBuilder {
  constructor() {
    this._fromRid = null;
    this._toRid = null;
    this._type = null;
    this._metadata = {};
  }

  /* ── 便捷工厂 ── */

  /** 创建 contains 关系（容器包含成员） */
  static contains(fromRid, toRid) {
    return new RelationBuilder().from(fromRid).to(toRid).type('contains');
  }

  /** 创建 link 关系（双向链接） */
  static link(fromRid, toRid) {
    return new RelationBuilder().from(fromRid).to(toRid).type('link');
  }

  /** 创建 references 关系（引用，如 MD 引用图片） */
  static references(fromRid, toRid) {
    return new RelationBuilder().from(fromRid).to(toRid).type('references');
  }

  /** 创建 depends 关系（依赖） */
  static depends(fromRid, toRid) {
    return new RelationBuilder().from(fromRid).to(toRid).type('depends');
  }

  /* ── 链式 setter ── */

  from(rid) {
    this._assertRid('fromRid', rid);
    this._fromRid = rid;
    return this;
  }

  to(rid) {
    this._assertRid('toRid', rid);
    this._toRid = rid;
    return this;
  }

  /**
   * 设置关系类型。
   * 常用预定义类型：contains / link / references / depends。
   * 但不限制，可传任意字符串。
   */
  type(t) {
    if (typeof t !== 'string' || !t.trim()) {
      throw new Error('[RelationBuilder] type 必须是非空字符串');
    }
    this._type = t.trim();
    return this;
  }

  /** 设置 metadata 字段 */
  meta(key, value) {
    if (typeof key !== 'string' || !key.trim()) {
      throw new Error('[RelationBuilder] meta key 必须是非空字符串');
    }
    const trimmedKey = key.trim();
    if (trimmedKey.includes(' ')) {
      throw new Error(`[RelationBuilder] meta key 非法: "${key}"`);
    }
    this._metadata[trimmedKey] = value;
    return this;
  }

  /** 批量设置 metadata */
  metas(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('[RelationBuilder] metas() 参数必须是普通对象');
    }
    for (const [k, v] of Object.entries(obj)) {
      this.meta(k, v);
    }
    return this;
  }

  /* ── 构建 ── */

  build() {
    if (!this._fromRid) throw new Error('[RelationBuilder] build 失败：fromRid 未设置');
    if (!this._toRid)   throw new Error('[RelationBuilder] build 失败：toRid 未设置');
    if (!this._type)    throw new Error('[RelationBuilder] build 失败：type 未设置');

    const rel = {
      from_rid: this._fromRid,
      to_rid: this._toRid,
      type: this._type
    };

    if (Object.keys(this._metadata).length > 0) {
      rel.metadata = this._metadata;
    }

    return rel;
  }

  /* ── 内部工具 ── */

  _assertRid(name, rid) {
    if (typeof rid !== 'string' || !rid.startsWith('res_')) {
      throw new Error(
        `[RelationBuilder] ${name} 必须是以 "res_" 开头的 rid 字符串，收到: ${JSON.stringify(rid)}`
      );
    }
  }
}

module.exports = RelationBuilder;
