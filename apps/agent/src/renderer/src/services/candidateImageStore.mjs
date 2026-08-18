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
 *   - 用户在 Monaco 编辑器粘贴/拖拽图片 → add(bytes, mime)
 *   - CandidateImagePanel 显示列表 + 缩略图 + 导入/删除/预览
 *   - 用户点击「导入」→ 调用方（lo-core:import-resource）拿到 RID
 *   - 导入成功后：调用方把返回的 RID 插入 Markdown（当前编辑器光标处）
 *
 * 浏览器环境约束（renderer 不接触 Node）：
 *   - 只使用 Uint8Array / Blob / URL.createObjectURL，不依赖 Node Buffer
 *   - previewUrl 由 Blob 生成 object URL；项移除/清空时 revoke 释放
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
 * @property {Uint8Array} bytes - 原始字节（renderer 用 Uint8Array，不依赖 Node Buffer）
 * @property {string} mime - MIME 类型
 * @property {string} filename - 建议文件名（含扩展名）
 * @property {string} alt - 默认 alt 文本（来源建议）
 * @property {string} previewUrl - Blob object URL（用于 UI 缩略图）
 * @property {string} source - 'paste' | 'drop' | 'file-select'
 * @property {string|null} rid - 上传成功后的 Image Resource rid（null = 未上传）
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
   * @param {Uint8Array|ArrayBuffer} params.bytes
   * @param {string} params.mime
   * @param {string} [params.filename]
   * @param {string} [params.source='paste']
   * @param {string} [params.alt]
   * @returns {CandidateImage}
   */
  add({ bytes, mime, filename, source = 'paste', alt = '' }) {
    if (!bytes) throw new Error('CandidateImageStore.add: bytes 必填');
    if (!mime) throw new Error('CandidateImageStore.add: mime 必填');
    if (!SUPPORTED_MIMES.has(mime.toLowerCase())) {
      throw new Error(`CandidateImageStore.add: 不支持的 MIME 类型 ${mime}`);
    }

    const buf =
      bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const id = `cand_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const ext = mimeToExt(mime);
    const finalFilename = filename || `pasted-${Date.now()}${ext}`;
    const blob = new Blob([buf], { type: mime });
    const previewUrl = URL.createObjectURL(blob);

    const item = {
      id,
      bytes: buf,
      mime,
      filename: finalFilename,
      alt: alt || finalFilename.replace(/\.[^.]+$/, ''),
      previewUrl,
      source,
      rid: null,
      createdAt: Date.now(),
    };

    // 内存上限保护：移除最旧的
    if (this._items.size >= MAX_CANDIDATES) {
      const oldest = [...this._items.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
      if (oldest) {
        this._release(oldest);
        this._items.delete(oldest.id);
      }
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
    const item = this._items.get(id);
    if (!item) return;
    this._release(item);
    this._items.delete(id);
    this._emit();
  }

  /**
   * 清空所有候选
   */
  clear() {
    if (this._items.size === 0) return;
    for (const item of this._items.values()) this._release(item);
    this._items.clear();
    this._emit();
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
   * 标记候选为「已上传成 Image Resource」并保留在列表（供用户后续主动插入）
   * 上传本身不修改 Markdown、不建立任何 embed relation（P4 验证项）
   * @param {string} id
   * @param {string} rid — Core 返回的 Image Resource rid
   * @returns {CandidateImage|null}
   */
  markImported(id, rid) {
    const item = this._items.get(id);
    if (!item) return null;
    item.rid = rid;
    this._emit();
    return item;
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
    this._release(item);
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

  _release(item) {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
      item.previewUrl = '';
    }
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
