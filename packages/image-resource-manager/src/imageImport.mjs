/**
 * imageImport.mjs —— Image Resource Manager 图片采集（纯函数）
 *
 * 统一 paste / drop / file-select 三种入口为 { bytes: Uint8Array, mime, filename, alt, source }。
 * 仅接受 SUPPORTED_MIMES 图片；非图片文件过滤。无副作用，可单测。
 */
import { SUPPORTED_MIMES, mimeExt, altFromFilename } from './imageUtils.mjs';

/**
 * 从 File 列表（drop / file-select / clipboardData.items）采集图片
 * @param {File[]} files
 * @returns {Promise<Array<{bytes: Uint8Array, mime: string, filename: string, alt: string, source: string}>>}
 */
export async function collectImageFiles(files, source) {
  const out = [];
  for (const file of files || []) {
    if (!file) continue;
    const mime = normalizeMime(file.type, file.name);
    if (!mime) continue;
    const buf = await file.arrayBuffer();
    out.push({
      bytes: new Uint8Array(buf),
      mime,
      filename: file.name || `image-${Date.now()}.${mimeExt(mime)}`,
      alt: altFromFilename(file.name),
      source,
    });
  }
  return out;
}

function normalizeMime(type, name) {
  const t = (type || '').toLowerCase();
  if (SUPPORTED_MIMES.has(t)) return t;
  const ext = (name || '').split('.').pop().toLowerCase();
  const byExt = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
  };
  const guessed = byExt[ext];
  return guessed && SUPPORTED_MIMES.has(guessed) ? guessed : null;
}