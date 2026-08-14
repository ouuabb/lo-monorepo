/**
 * ResourceBuilder —— 构造符合 lo Core 契约的 Resource 对象
 *
 * 使用：
 *   const res = ResourceBuilder
 *     .note()
 *     .name('项目计划')
 *     .path('notes/project.md')
 *     .meta('title', '项目规划 2026')
 *     .tag('计划').tag('OKR')
 *     .capability('searchable')
 *     .build();
 *
 *   await context.resources.create(res);
 *
 * 注意：
 *   1. build() 时会严格校验字段，错误早暴露而不是塞进 DB 才炸
 *   2. metadata 已知字段：title/wordCount/tags/category/status/conflict/original_rid/mimetype/size
 *      未知字段会在 Core 的 validateMetadata 阶段再次拦截，
 *      但 Builder 不硬编码已知字段列表（保留 forward-compatibility：Core 新增字段时 SDK 不必升级）。
 *   3. 合法 type 列表来自 lo Core 的 TYPE_MAP，但 SDK 不硬编码，
 *      可以用 .type('xxx') 指定任意 type；未知 type Core 会兜底成 'unknown'。
 */
class ResourceBuilder {
  constructor(type = 'unknown') {
    if (typeof type !== 'string' || !type.trim()) {
      throw new Error('[ResourceBuilder] type 必须是非空字符串');
    }
    this._type = type.trim();
    this._path = null;
    this._name = null;
    this._rid = null;
    this._metadata = {};
    this._capabilities = [];
    this._containerSchema = null;
  }

  /* ── 便捷工厂方法（常用 type） ── */

  static note()      { return new ResourceBuilder('note'); }
  static pdf()       { return new ResourceBuilder('pdf'); }
  static image()     { return new ResourceBuilder('image'); }
  static video()     { return new ResourceBuilder('video'); }
  static audio()     { return new ResourceBuilder('audio'); }
  static html()      { return new ResourceBuilder('html'); }
  static text()      { return new ResourceBuilder('text'); }
  static code()      { return new ResourceBuilder('code'); }
  static json()      { return new ResourceBuilder('json'); }
  static yaml()      { return new ResourceBuilder('yaml'); }
  static config()    { return new ResourceBuilder('config'); }
  static document()  { return new ResourceBuilder('document'); }
  static spreadsheet(){ return new ResourceBuilder('spreadsheet'); }
  static presentation(){ return new ResourceBuilder('presentation'); }
  static data()      { return new ResourceBuilder('data'); }
  static unknown()   { return new ResourceBuilder('unknown'); }

  /** 任意 type（当快捷方法不够时使用） */
  static of(type) {
    return new ResourceBuilder(type);
  }

  /* ── 链式 setter ── */

  /** 设置资源类型 */
  type(t) {
    if (typeof t !== 'string' || !t.trim()) {
      throw new Error('[ResourceBuilder] type 必须是非空字符串');
    }
    this._type = t.trim();
    return this;
  }

  /** 设置文件路径（绝对或相对仓库根） */
  path(p) {
    if (p !== null && p !== undefined && typeof p !== 'string') {
      throw new Error('[ResourceBuilder] path 必须是字符串或 null/undefined');
    }
    this._path = p;
    return this;
  }

  /** 设置显示名 */
  name(n) {
    if (n !== null && n !== undefined && typeof n !== 'string') {
      throw new Error('[ResourceBuilder] name 必须是字符串或 null/undefined');
    }
    this._name = n;
    return this;
  }

  /**
   * 设置一个 metadata 字段
   * 已知合法字段：title/wordCount/tags/category/status/conflict/original_rid/mimetype/size
   */
  meta(key, value) {
    if (typeof key !== 'string' || !key.trim()) {
      throw new Error('[ResourceBuilder] meta key 必须是非空字符串');
    }
    const trimmedKey = key.trim();
    if (trimmedKey.includes(' ')) {
      throw new Error(`[ResourceBuilder] meta key 非法: "${key}"（key 不能包含空格）`);
    }
    this._metadata[trimmedKey] = value;
    return this;
  }

  /** 批量设置 metadata */
  metas(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('[ResourceBuilder] metas() 参数必须是普通对象');
    }
    for (const [k, v] of Object.entries(obj)) {
      this.meta(k, v);
    }
    return this;
  }

  /** 添加一个 tag（等价于 meta('tags', [...])，但支持链式且自动去重） */
  tag(tag) {
    if (typeof tag !== 'string' || !tag.trim()) {
      throw new Error('[ResourceBuilder] tag 必须是非空字符串');
    }
    const t = tag.trim();
    if (!this._metadata.tags) this._metadata.tags = [];
    if (!Array.isArray(this._metadata.tags)) {
      throw new Error('[ResourceBuilder] tags 已被设置为非数组，无法追加 tag');
    }
    if (!this._metadata.tags.includes(t)) {
      this._metadata.tags.push(t);
    }
    return this;
  }

  /** 批量添加 tags */
  tags(list) {
    if (!Array.isArray(list)) {
      throw new Error('[ResourceBuilder] tags() 参数必须是字符串数组');
    }
    list.forEach(t => this.tag(t));
    return this;
  }

  /** 添加一个能力标签 */
  capability(cap) {
    if (typeof cap !== 'string' || !cap.trim()) {
      throw new Error('[ResourceBuilder] capability 必须是非空字符串');
    }
    const c = cap.trim();
    if (!this._capabilities.includes(c)) {
      this._capabilities.push(c);
    }
    return this;
  }

  /** 批量设置 capabilities */
  capabilities(list) {
    if (!Array.isArray(list)) {
      throw new Error('[ResourceBuilder] capabilities() 参数必须是字符串数组');
    }
    list.forEach(c => this.capability(c));
    return this;
  }

  /** 设置自定义 rid（通常不需要，Core 会自动生成；一般用于导入/恢复场景） */
  rid(id) {
    if (id !== null && id !== undefined) {
      if (typeof id !== 'string' || !id.startsWith('res_')) {
        throw new Error('[ResourceBuilder] rid 必须以 "res_" 开头');
      }
    }
    this._rid = id;
    return this;
  }

  /**
   * 设置容器 schema（仅 type='container' 时有效）
   * @param {string[]} ignoredPatterns 容器内忽略的 glob 模式数组
   */
  containerSchema(ignoredPatterns = []) {
    if (!Array.isArray(ignoredPatterns)) {
      throw new Error('[ResourceBuilder] containerSchema 参数必须是字符串数组');
    }
    this._containerSchema = {
      ignored_patterns: ignoredPatterns
    };
    return this;
  }

  /* ── 构建 ── */

  /**
   * 构建 Resource 对象。
   * 注意：这里做 SDK 层的基础校验，Core 的 validateMetadata 会做更严格的二次校验。
   *
   * @returns {object} ResourceCandidate —— 传给 context.resources.create() 的参数
   */
  build() {
    if (!this._type) {
      throw new Error('[ResourceBuilder] build 失败：type 未设置');
    }

    const candidate = {
      type: this._type,
    };

    if (this._path !== null && this._path !== undefined) {
      candidate.path = this._path;
    }
    if (this._name !== null && this._name !== undefined) {
      candidate.name = this._name;
    }
    if (this._rid !== null && this._rid !== undefined) {
      candidate.rid = this._rid;
    }

    if (Object.keys(this._metadata).length > 0) {
      candidate.metadata = this._metadata;
    }
    if (this._capabilities.length > 0) {
      candidate.capabilities = [...this._capabilities];
    }
    if (this._containerSchema !== null) {
      candidate.container_schema = this._containerSchema;
    }

    return candidate;
  }

  /** 创建一个 Builder 的深拷贝（从同一个模板派生出多个相似 Resource） */
  clone() {
    const b = new ResourceBuilder(this._type);
    b._path = this._path;
    b._name = this._name;
    b._rid = this._rid;
    b._metadata = JSON.parse(JSON.stringify(this._metadata));
    b._capabilities = [...this._capabilities];
    b._containerSchema = this._containerSchema
      ? JSON.parse(JSON.stringify(this._containerSchema)) : null;
    return b;
  }
}

module.exports = ResourceBuilder;
