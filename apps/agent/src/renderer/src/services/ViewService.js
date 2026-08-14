/**
 * ViewService —— Core View 消费适配层
 *
 * renderer 访问 Core View 的唯一入口（list/get/run）。
 * UI 组件不直接访问 preload 的 loCore.views，也不复制任何 Core View 语义
 * （query / fields / groups / presentation 均由 lo Core 决定，此处仅透传）。
 */
const api = window.loAgent && window.loAgent.loCore;

function guard() {
  if (!api || !api.views) {
    return { ok: false, message: 'preload 未就绪，无法访问 Core View' };
  }
  return null;
}

/** 获取 Core View 列表 */
export async function listViews(query = {}) {
  const g = guard();
  if (g) return g;
  try {
    const res = await api.views.list(query);
    return { ok: true, total: res.total, data: res.data };
  } catch (e) {
    return { ok: false, message: `获取视图列表失败: ${e.message}` };
  }
}

/** 获取单个 Core View 定义 */
export async function getView(id) {
  const g = guard();
  if (g) return g;
  try {
    const res = await api.views.get(id);
    return { ok: true, data: res.data };
  } catch (e) {
    return { ok: false, message: `获取视图失败: ${e.message}` };
  }
}

/** 运行 Core View，结构化结果原样透传 */
export async function runView(id, body = {}) {
  const g = guard();
  if (g) return g;
  try {
    const res = await api.views.run(id, body);
    return { ok: true, data: res.data };
  } catch (e) {
    return { ok: false, message: `运行视图失败: ${e.message}` };
  }
}
