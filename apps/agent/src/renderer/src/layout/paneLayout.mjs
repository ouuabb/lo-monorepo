/**
 * paneLayout.js —— 布局状态序列化/还原（纯逻辑，不依赖 React/Electron/IPC）
 *
 * P0 范围：sidebar（显隐/宽度）+ 右侧面板显隐；
 * P1 扩展：编辑器分屏 groups（见 P1 阶段）。
 * 持久化只存布局结构与面板状态，不存 dirty 草稿。
 */
export const LAYOUT_VERSION = 1;

export const DEFAULT_SIDEBAR_WIDTH = 220;
export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 480;

/** 右侧面板 id 白名单（App 侧 3 个独立开关状态映射） */
export const PANEL_IDS = ['relations', 'settings', 'plugin'];

/** 面板默认显隐（与现状一致：relations 默认开，settings/plugin 默认关） */
export const PANEL_DEFAULTS = {
  relations: true,
  settings: false,
  plugin: false,
};

/** 默认布局 */
export function defaultLayout() {
  return {
    version: LAYOUT_VERSION,
    sidebar: { visible: true, size: DEFAULT_SIDEBAR_WIDTH },
    panels: { ...PANEL_DEFAULTS },
  };
}

/** 宽度 clamp 到合法区间（null/undefined/非数字 → 默认值） */
export function clampSidebarWidth(width) {
  if (width === null || width === undefined || width === '') {
    return DEFAULT_SIDEBAR_WIDTH;
  }
  const n = Number(width);
  if (!Number.isFinite(n)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(n)));
}

/** 非法/缺失输入 → 合并默认值，返回干净布局对象 */
export function normalizeLayout(raw) {
  const fallback = defaultLayout();
  if (!raw || typeof raw !== 'object') return fallback;

  const sidebarRaw = raw.sidebar && typeof raw.sidebar === 'object' ? raw.sidebar : {};
  const sidebar = {
    visible:
      typeof sidebarRaw.visible === 'boolean' ? sidebarRaw.visible : fallback.sidebar.visible,
    size: clampSidebarWidth(sidebarRaw.size ?? fallback.sidebar.size),
  };

  const panelsRaw = raw.panels && typeof raw.panels === 'object' ? raw.panels : {};
  const panels = { ...fallback.panels };
  for (const id of PANEL_IDS) {
    if (typeof panelsRaw[id] === 'boolean') panels[id] = panelsRaw[id];
  }

  return { version: LAYOUT_VERSION, sidebar, panels };
}

/** 序列化：App 当前状态 → 可持久化布局对象 */
export function buildLayout({ sidebarVisible, sidebarWidth, panels }) {
  return normalizeLayout({
    version: LAYOUT_VERSION,
    sidebar: {
      visible: !!sidebarVisible,
      size: clampSidebarWidth(sidebarWidth),
    },
    panels,
  });
}

/** 还原：持久化布局 → App 初始化状态（panel 显隐缺失时用默认） */
export function applyLayout(layout) {
  const normalized = normalizeLayout(layout);
  return {
    sidebar: { ...normalized.sidebar },
    panels: { ...normalized.panels },
  };
}
