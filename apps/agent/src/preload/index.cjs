/**
 * lo-agent preload 脚本
 *
 * 通过 contextBridge 向渲染进程暴露受控 API。
 * loCore 子命名空间经由 ipcRenderer.invoke 调用主进程白名单通道。
 */
const { contextBridge, ipcRenderer, webFrame } = require('electron');

const CHANNEL = {
  CONFIG: 'lo-core:config',
  CONFIGURE: 'lo-core:configure',
  LOGIN: 'lo-core:login',
  STATUS: 'lo-core:status',
  LIST_NOTES: 'lo-core:list-notes',
  GET_NOTE: 'lo-core:get-note',
  UPDATE_NOTE: 'lo-core:update-note',
  LOGOUT: 'lo-core:logout',
  RELATIONS: 'lo-core:relations',
  OPERATIONS: 'lo-core:operations',
  OPERATION_UNDO: 'lo-core:operation-undo',
  EVENTS_SUBSCRIBE: 'lo-core:events-subscribe',
  EVENTS_UNSUBSCRIBE: 'lo-core:events-unsubscribe',
  EVENTS_PUSH: 'lo-core:event',
  PLUGINS_LIST: 'agent-plugins:list-commands',
  PLUGINS_EXECUTE: 'agent-plugins:execute-command',
  PLUGINS_VIEWS: 'agent-plugins:list-views',
  PLUGINS_RENDER_VIEW: 'agent-plugins:render-view',
  PLUGINS_PANELS: 'agent-plugins:list-panels',
  PLUGINS_RENDER_PANEL: 'agent-plugins:render-panel',
  PLUGINS_EDITORS: 'agent-plugins:list-editors',
  PLUGINS_RENDER_EDITOR: 'agent-plugins:render-editor',
  PLUGINS_SERVICES: 'agent-plugins:list-services',
  PLUGINS_GET_UI: 'agent-plugins:get-ui-module',
  PLUGINS_CTX: 'agent-plugins:ctx',
  PLUGINS_INSTALL: 'agent-plugins:install',
  PLUGINS_MANAGE_LIST: 'agent-plugins:list-plugins',
  PLUGINS_MANAGE_ENABLE: 'agent-plugins:enable',
  PLUGINS_MANAGE_DISABLE: 'agent-plugins:disable',
  PLUGINS_MANAGE_UNINSTALL: 'agent-plugins:uninstall',
  PLUGINS_MANAGE_GET_CONFIG: 'agent-plugins:get-plugin-config',
  PLUGINS_MANAGE_SET_CONFIG: 'agent-plugins:set-plugin-config',
  WIN_MINIMIZE: 'window:minimize',
  WIN_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WIN_CLOSE: 'window:close',
  WIN_IS_MAXIMIZED: 'window:is-maximized',
  WIN_ON_MAXIMIZE_CHANGE: 'window:maximized-change',
};

contextBridge.exposeInMainWorld('loAgent', {
  version: '0.1.0',
  loCore: {
    getConfig: () => ipcRenderer.invoke(CHANNEL.CONFIG),
    configure: (config) => ipcRenderer.invoke(CHANNEL.CONFIGURE, config),
    login: (params) => ipcRenderer.invoke(CHANNEL.LOGIN, params),
    getStatus: () => ipcRenderer.invoke(CHANNEL.STATUS),
    listNotes: (query) => ipcRenderer.invoke(CHANNEL.LIST_NOTES, query),
    getNote: (rid) => ipcRenderer.invoke(CHANNEL.GET_NOTE, rid),
    updateNote: (rid, body) => ipcRenderer.invoke(CHANNEL.UPDATE_NOTE, rid, body),
    logout: () => ipcRenderer.invoke(CHANNEL.LOGOUT),
    relations: {
      list: (rid) => ipcRenderer.invoke(CHANNEL.RELATIONS, rid),
    },
    operations: {
      list: (query) => ipcRenderer.invoke(CHANNEL.OPERATIONS, query),
      undo: (id) => ipcRenderer.invoke(CHANNEL.OPERATION_UNDO, id),
    },
    events: {
      subscribe: (types) => ipcRenderer.invoke(CHANNEL.EVENTS_SUBSCRIBE, types),
      unsubscribe: () => ipcRenderer.invoke(CHANNEL.EVENTS_UNSUBSCRIBE),
      onEvent: (cb) => {
        const listener = (_e, event) => cb(event);
        ipcRenderer.on(CHANNEL.EVENTS_PUSH, listener);
        return () => ipcRenderer.removeListener(CHANNEL.EVENTS_PUSH, listener);
      },
    },
  },
  plugins: {
    list: () => ipcRenderer.invoke(CHANNEL.PLUGINS_LIST),
    execute: (commandId, args) =>
      ipcRenderer.invoke(CHANNEL.PLUGINS_EXECUTE, commandId, args),
    views: {
      list: () => ipcRenderer.invoke(CHANNEL.PLUGINS_VIEWS),
      render: (viewId, context) =>
        ipcRenderer.invoke(CHANNEL.PLUGINS_RENDER_VIEW, viewId, context),
    },
    panels: {
      list: () => ipcRenderer.invoke(CHANNEL.PLUGINS_PANELS),
      render: (panelId, context) =>
        ipcRenderer.invoke(CHANNEL.PLUGINS_RENDER_PANEL, panelId, context),
    },
    editors: {
      list: () => ipcRenderer.invoke(CHANNEL.PLUGINS_EDITORS),
      render: (editorId, context) =>
        ipcRenderer.invoke(CHANNEL.PLUGINS_RENDER_EDITOR, editorId, context),
    },
    services: {
      list: () => ipcRenderer.invoke(CHANNEL.PLUGINS_SERVICES),
    },
    getUi: (pluginId) => ipcRenderer.invoke(CHANNEL.PLUGINS_GET_UI, pluginId),
    install: (id, registryUrl, options) =>
      ipcRenderer.invoke(CHANNEL.PLUGINS_INSTALL, id, registryUrl, options),
    manage: {
      list: () => ipcRenderer.invoke(CHANNEL.PLUGINS_MANAGE_LIST),
      enable: (id) => ipcRenderer.invoke(CHANNEL.PLUGINS_MANAGE_ENABLE, id),
      disable: (id) => ipcRenderer.invoke(CHANNEL.PLUGINS_MANAGE_DISABLE, id),
      uninstall: (id) => ipcRenderer.invoke(CHANNEL.PLUGINS_MANAGE_UNINSTALL, id),
      getConfig: (id) => ipcRenderer.invoke(CHANNEL.PLUGINS_MANAGE_GET_CONFIG, id),
      setConfig: (id, key, value) =>
        ipcRenderer.invoke(CHANNEL.PLUGINS_MANAGE_SET_CONFIG, id, key, value),
    },
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke(CHANNEL.WIN_MINIMIZE),
    toggleMaximize: () => ipcRenderer.invoke(CHANNEL.WIN_TOGGLE_MAXIMIZE),
    close: () => ipcRenderer.invoke(CHANNEL.WIN_CLOSE),
    isMaximized: () => ipcRenderer.invoke(CHANNEL.WIN_IS_MAXIMIZED),
    onMaximizeChange: (cb) => {
      const listener = (_e, val) => cb(val);
      ipcRenderer.on(CHANNEL.WIN_ON_MAXIMIZE_CHANGE, listener);
      return () => ipcRenderer.removeListener(CHANNEL.WIN_ON_MAXIMIZE_CHANGE, listener);
    },
  },
});

// ── 插件渲染端 UI（mountEl / isolated world） ──
// pluginUi 桥只暴露给 App 主 world 的 mount 层；插件代码运行在 isolated world，
// 经 __loPluginCtx（exposeInIsolatedWorld 注入）拿能力，主 world 的 loAgent 对其不可见。

const LO_NS_METHODS = {
  operations: ['execute', 'list', 'get', 'undo'],
  relations: ['list', 'get', 'create', 'update', 'remove'],
  events: ['subscribe', 'history'],
  resources: ['list', 'get', 'search'],
  health: ['stats'],
};

function buildCtx(pluginId, onNotify) {
  // 统一走 agent-plugins:ctx；解包 {ok,result} 信封：失败抛错，成功返回 result
  const invokeCtx = (payload) =>
    ipcRenderer.invoke(CHANNEL.PLUGINS_CTX, payload).then((res) => {
      if (res && res.ok) return res.result;
      throw new Error((res && res.error) || 'ctx 调用失败');
    });
  const lo = {};
  for (const [ns, methods] of Object.entries(LO_NS_METHODS)) {
    lo[ns] = {};
    for (const method of methods) {
      lo[ns][method] = (...args) => invokeCtx({ pluginId, target: 'lo', ns, method, args });
    }
  }
  return {
    pluginId,
    lo,
    config: (key, defaultValue) =>
      invokeCtx({ pluginId, target: 'config', method: 'config', args: [key, defaultValue] }),
    executeCommand: (commandId, args) =>
      invokeCtx({ pluginId, target: 'executeCommand', method: 'execute', args: [commandId, args] }),
    notify: (message) => {
      if (typeof onNotify === 'function') onNotify(message);
    },
  };
}

const q = (v) => JSON.stringify(v);

function buildBootstrapCode() {
  return `(async () => {
    try {
      const url = URL.createObjectURL(new Blob([__loPluginBootstrap.source], { type: 'text/javascript' }));
      const mod = await import(url);
      URL.revokeObjectURL(url);
      window.__loPluginModule = mod;
      window.__loMounts = {};
      return { ok: true, exports: Object.keys(mod) };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  })()`;
}

function buildRenderCode(containerId, extType, extId) {
  return `(async () => {
    try {
      const m = window.__loPluginModule;
      const def = m && m[${q(extType)}] && m[${q(extType)}][${q(extId)}];
      if (!def || typeof def.render !== 'function') {
        return { ok: false, error: 'ui 模块缺少 render: ' + ${q(extType)} + ':' + ${q(extId)} };
      }
      const el = document.getElementById(${q(containerId)});
      if (!el) return { ok: false, error: '挂载容器不存在: ' + ${q(containerId)} };
      const ret = def.render(el, window.__loPluginCtx);
      const settled = ret && typeof ret.then === 'function' ? await ret : ret;
      const dispose = typeof settled === 'function' ? settled : (settled && typeof settled.dispose === 'function' ? settled.dispose : null);
      window.__loMounts = window.__loMounts || {};
      window.__loMounts[${q(containerId)}] = dispose || null;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  })()`;
}

function buildDisposeCode(containerId) {
  return `(async () => {
    try {
      const d = (window.__loMounts || {})[${q(containerId)}];
      delete (window.__loMounts || {})[${q(containerId)}];
      if (d) await d();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  })()`;
}

contextBridge.exposeInMainWorld('pluginUi', {
  hasWebFrame: () =>
    typeof webFrame === 'object' &&
    typeof webFrame.executeJavaScriptInIsolatedWorld === 'function',
  mount: async (worldId, pluginId, source, options) => {
    contextBridge.exposeInIsolatedWorld(worldId, '__loPluginBootstrap', { source });
    contextBridge.exposeInIsolatedWorld(
      worldId,
      '__loPluginCtx',
      buildCtx(pluginId, options && options.onNotify),
    );
    return webFrame.executeJavaScriptInIsolatedWorld(worldId, [{ code: buildBootstrapCode() }], true);
  },
  render: (worldId, containerId, extType, extId) =>
    webFrame.executeJavaScriptInIsolatedWorld(
      worldId,
      [{ code: buildRenderCode(containerId, extType, extId) }],
      true,
    ),
  dispose: (worldId, containerId) =>
    webFrame.executeJavaScriptInIsolatedWorld(
      worldId,
      [{ code: buildDisposeCode(containerId) }],
      true,
    ),
});
