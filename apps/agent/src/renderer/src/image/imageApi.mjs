/**
 * imageApi.mjs —— Image Resource Manager 的数据访问层
 *
 * 唯一职责：把 Manager 的 UI/用户操作编排成对 loCore（preload 门面）的调用，
 * 再由 loCore → @lo/client → Core。不直接访问 Core HTTP / 数据库。
 *
 * getLoCore 可注入（DI），便于单测；默认取 window.loAgent.loCore。
 */

export function createImageApi(getLoCore = defaultGetLoCore) {
  return {
    /**
     * 查询 Image Resource 列表
     * @returns {Promise<Array>} 资源列表（type=image）
     */
    async list() {
      const api = requireApi(getLoCore());
      const res = await api.listNotes({ type: 'image', limit: 500 });
      if (!res || !res.ok) throw new Error((res && res.message) || '查询图片资源失败');
      return res.data || [];
    },

    /**
     * 导入图片为 Image Resource
     * @param {{ bytes: Uint8Array, mime: string, filename: string }} img
     * @returns {Promise<object>} Resource（含 rid）
     */
    async importImage({ bytes, mime, filename }) {
      const api = requireApi(getLoCore());
      const res = await api.importResource({
        buffer: bytes,
        filename,
        metadata: { mimetype: mime },
        type: 'image',
      });
      if (!res || !res.ok) throw new Error((res && res.message) || '导入图片失败');
      return res.data;
    },

    /**
     * 读取 Image Resource 二进制
     * @param {string} rid
     * @returns {Promise<{ mime: string, buffer: string, size: number }>} base64 + mime
     */
    async getBinary(rid) {
      const api = requireApi(getLoCore());
      const res = await api.getResourceBinary(rid);
      if (!res || !res.ok || !res.data) {
        throw new Error((res && res.message) || '读取图片二进制失败');
      }
      return res.data;
    },

    /**
     * 删除 Image Resource（软删，可 undo）
     * @param {string} rid
     */
    async remove(rid) {
      const api = requireApi(getLoCore());
      const res = await api.removeNote(rid);
      if (!res || !res.ok) throw new Error((res && res.message) || '删除图片失败');
      return res;
    },
  };
}

function defaultGetLoCore() {
  if (typeof window === 'undefined' || !window.loAgent || !window.loAgent.loCore) return null;
  return window.loAgent.loCore;
}

function requireApi(api) {
  if (!api) throw new Error('loCore 不可用：请先配置并登录 lo Core');
  return api;
}