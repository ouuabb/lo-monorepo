/**
 * pluginUi.js —— 渲染端插件 UI 挂载辅助（mountEl / isolated world）
 *
 * 运行在 App 主 world。职责：
 *   - 经 window.loAgent.plugins.getUi 读取插件渲染端入口源码 + worldId
 *   - 经 window.pluginUi（preload 受控桥）在 isolated world 中加载插件模块、
 *     执行 render/dispose
 *   - 维护 worldId 缓存与挂载容器生命周期
 *
 * 边界：本模块只经受控桥；插件 UI 在 isolated world 中只持 ctx，看不到 loAgent。
 */
const uiMetaCache = new Map(); // pluginId -> Promise<{ok:true, source, worldId} | {ok:false, error}>
const worldReady = new Map(); // pluginId -> Promise<worldId>

function bridgeReady() {
  return !!(window.loAgent && window.loAgent.plugins && window.loAgent.plugins.getUi && window.pluginUi);
}

function getUiMeta(pluginId) {
  if (uiMetaCache.has(pluginId)) return uiMetaCache.get(pluginId);
  const p = window.loAgent.plugins
    .getUi(pluginId)
    .then((res) =>
      res && res.ok
        ? { ok: true, source: res.source, worldId: res.worldId }
        : { ok: false, error: (res && res.error) || `插件未声明渲染端入口: ${pluginId}` },
    )
    .catch((e) => ({ ok: false, error: String(e) }));
  uiMetaCache.set(pluginId, p);
  return p;
}

function ensureUiWorld(pluginId, onNotify) {
  if (worldReady.has(pluginId)) return worldReady.get(pluginId);
  const p = (async () => {
    const meta = await getUiMeta(pluginId);
    if (!meta.ok) throw new Error(meta.error);
    const mountRes = await window.pluginUi.mount(meta.worldId, pluginId, meta.source, {
      onNotify,
    });
    if (!mountRes || mountRes.ok === false) {
      throw new Error((mountRes && mountRes.error) || `插件 UI 加载失败: ${pluginId}`);
    }
    return meta.worldId;
  })();
  worldReady.set(pluginId, p);
  p.catch(() => worldReady.delete(pluginId));
  return p;
}

let seq = 0;
function nextContainerId(pluginId) {
  return `lo-mount-${pluginId}-${Date.now()}-${++seq}`;
}

/**
 * 判断插件是否声明了渲染端入口（有则用 mountEl，无则回退 HTML 快照）
 * @returns {Promise<boolean>}
 */
export function hasUi(pluginId) {
  if (!bridgeReady()) return Promise.resolve(false);
  return getUiMeta(pluginId).then((meta) => meta.ok);
}

/**
 * 在指定容器内打开一个插件扩展点的 mountEl UI
 * @returns {Promise<{ worldId, containerId, close: Function }>}
 */
export async function openMount({ pluginId, extType, extId, container, onNotify }) {
  if (!bridgeReady()) throw new Error('插件 UI 桥未就绪');
  const worldId = await ensureUiWorld(pluginId, onNotify);
  const containerId = nextContainerId(pluginId);
  const el = document.createElement('div');
  el.id = containerId;
  el.className = 'plugin-mount';
  container.appendChild(el);
  let res;
  try {
    res = await window.pluginUi.render(worldId, containerId, extType, extId);
  } catch (e) {
    el.remove();
    throw new Error(`插件 UI 渲染失败: ${e.message}`);
  }
  if (!res || res.ok === false) {
    el.remove();
    throw new Error((res && res.error) || `插件 UI 渲染失败: ${extType}:${extId}`);
  }
  return {
    worldId,
    containerId,
    close: () => closeMount(worldId, containerId),
  };
}

/** 关闭挂载：在 isolated world 内执行 dispose（不跨 world 持函数引用）并移除容器 */
export async function closeMount(worldId, containerId) {
  try {
    await window.pluginUi.dispose(worldId, containerId);
  } catch (e) {
    // 忽略：world 可能已被回收
  }
  const el = document.getElementById(containerId);
  if (el) el.remove();
}
