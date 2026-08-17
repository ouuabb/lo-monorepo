/**
 * CandidateImageStore —— Agent 候选图片内存存储
 *
 * 设计原则（来自 Markdown 图片架构重构决策）：
 *   1. 候选图片 ≠ Resource：仅 Agent 内存状态，不进入 lo Core 数据库
 *   2. 不落盘：不写 resources/、不写 .repo/、不写 IndexedDB
 *   3. 不自动创建：用户必须在 CandidateImagePanel 中主动选择「导入」
 *   4. 重启即丢失：这是设计，不是 bug
 *
 * 用途：
 *   - 用户在 Monaco 编辑器粘贴/拖拽图片 → add(buffer, mime)
 *   - CandidateImagePanel 显示列表 + 缩略图 + 导入/删除/预览
 *   - 用户点击「导入」→ importCandidate(id) → 调 lo-core:import-resource
 *   - 导入成功后：调用方把返回的 RID 插入 Markdown
 *
 * EventTarget 设计：
 *   - 单一事件总线 'change'，add/remove/import 触发
 *   - 任何 UI 订阅者只需 addEventListener('change', () => read())
 */

const MAX_CANDIDATES = 50; // 内存上限，防止用户无脑粘贴占满内存
const SUPPORTED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
]);

/**
 * @typedef {object} CandidateImage
 * @property {string} id - 本地唯一 ID（uuid-like）
 * @property {Buffer} buffer - 原始字节
 * @property {string} mime - MIME 类型
 * @property {string} filename - 建议文件名（含扩展名）
 * @property {string} alt - 默认 alt 文本（来源建议）
 * @property {string} previewUrl - data: URL（用于 UI 缩略图）
 * @property {string} source - 'paste' | 'drop' | 'file-select'
 * @property {number} createdAt - Date.now()
 */

class CandidateImageStore extends EventTarget {
  constructor() {
    super();
    /** @type {Map<string, CandidateImage>} */
    this._items = new Map();
  }

  /**
   * 添加候选图片
   * @param {object} params
   * @param {Buffer|Uint8Array} params.buffer
   * @param {string} params.mime
   * @param {string} [params.filename]
   * @param {string} [params.source='paste']
   * @param {string} [params.alt]
   * @returns {CandidateImage}
   */
  add({ buffer, mime, filename, source = 'paste', alt = '' }) {
    if (!buffer) throw new Error('CandidateImageStore.add: buffer 必填');
    if (!mime) throw new Error('CandidateImageStore.add: mime 必填');
    if (!SUPPORTED_MIMES.has(mime.toLowerCase())) {
      throw new Error(`CandidateImageStore.add: 不支持的 MIME 类型 ${mime}`);
    }

    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const id = `cand_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const ext = mimeToExt(mime);
    const finalFilename = filename || `pasted-${Date.now()}${ext}`;
    const previewUrl = `data:${mime};base64,${buf.toString('base64')}`;

    const item = {
      id,
      buffer: buf,
      mime,
      filename: finalFilename,
      alt: alt || finalFilename.replace(/\.[^.]+$/, ''),
      previewUrl,
      source,
      createdAt: Date.now(),
    };

    // 内存上限保护：移除最旧的
    if (this._items.size >= MAX_CANDIDATES) {
      const oldest = [...this._items.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
      if (oldest) this._items.delete(oldest.id);
    }

    this._items.set(id, item);
    this._emit();
    return item;
  }

  /**
   * 移除候选图片
   * @param {string} id
   */
  remove(id) {
    if (this._items.delete(id)) {
      this._emit();
    }
  }

  /**
   * 清空所有候选
   */
  clear() {
    if (this._items.size > 0) {
      this._items.clear();
      this._emit();
    }
  }

  /**
   * 读取所有候选
   * @returns {CandidateImage[]}
   */
  list() {
    return [...this._items.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 获取单个候选
   * @param {string} id
   * @returns {CandidateImage|undefined}
   */
  get(id) {
    return this._items.get(id);
  }

  /**
   * 标记候选为「已导入」并从候选列表移除
   * 调用方负责实际导入（lo-core:import-resource）
   * @param {string} id
   * @returns {CandidateImage|null}
   */
  consume(id) {
    const item = this._items.get(id);
    if (!item) return null;
    this._items.delete(id);
    this._emit();
    return item;
  }

  /**
   * 当前候选数量
   * @returns {number}
   */
  size() {
    return this._items.size;
  }

  /**
   * 订阅变更
   * @param {() => void} listener
   * @returns {() => void} unsubscribe
   */
  subscribe(listener) {
    this.addEventListener('change', listener);
    return () => this.removeEventListener('change', listener);
  }

  _emit() {
    this.dispatchEvent(new Event('change'));
  }
}

function mimeToExt(mime) {
  switch (mime.toLowerCase()) {
    case 'image/png': return '.png';
    case 'image/jpeg':
    case 'image/jpg': return '.jpg';
    case 'image/gif': return '.gif';
    case 'image/webp': return '.webp';
    case 'image/svg+xml': return '.svg';
    case 'image/bmp': return '.bmp';
    default: return '.bin';
  }
}

// 单例（App 级别共享）
const store = new CandidateImageStore();

export default store;
export { CandidateImageStore, SUPPORTED_MIMES };
