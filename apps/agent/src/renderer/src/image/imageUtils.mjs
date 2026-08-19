/**
 * imageUtils.mjs —— Image Resource Manager 纯工具函数
 *
 * 浏览器环境约束（renderer 不接触 Node）：
 *   - 图片字节只以 Uint8Array 流转，不依赖 Node Buffer
 *   - base64 解码用 atob / Uint8Array（无 Buffer）
 */

/** 支持的图片 MIME 集合（与 Core ResourceType image 认定一致） */
export const SUPPORTED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
]);

/** MIME → 扩展名 */
export function mimeExt(mime) {
  switch ((mime || '').toLowerCase()) {
    case 'image/png': return 'png';
    case 'image/jpeg':
    case 'image/jpg': return 'jpg';
    case 'image/gif': return 'gif';
    case 'image/webp': return 'webp';
    case 'image/svg+xml': return 'svg';
    case 'image/bmp': return 'bmp';
    default: return 'bin';
  }
}

/** base64 → Uint8Array（无 Node Buffer） */
export function base64ToUint8(b64) {
  if (!b64 || typeof b64 !== 'string') return null;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (e) {
    return null;
  }
}

/** 字节数 → 人类可读大小 */
export function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 从文件名剥离扩展名得到 alt 建议 */
export function altFromFilename(filename) {
  if (!filename) return '';
  return filename.replace(/\.[^.]+$/, '');
}