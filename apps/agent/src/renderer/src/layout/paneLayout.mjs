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

/** 编辑器分屏组上限（Monaco 多实例内存约束） */
export const MAX_GROUPS = 3;

/** 默认布局 */
export function defaultLayout() {
  return {
    version: LAYOUT_VERSION,
    sidebar: { visible: true, size: DEFAULT_SIDEBAR_WIDTH },
    panels: { ...PANEL_DEFAULTS },
    editor: null,
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

/**
 * 编辑器分屏组：仅保存布局结构与 rid 列表，不保存 draft。
 * @typedef {Object} EditorGroupState
 * @property {string} id — 组 id
 * @property {string[]} tabs — 组内 tab 的资源 rid 列表（按打开顺序）
 * @property {string|null} active — 活动 tab 的 rid（null/缺省 = 组内第一个）
 */
export function normalizeEditorGroups(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const groups = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object' || typeof g.id !== 'string') continue;
    const tabs = Array.isArray(g.tabs)
      ? g.tabs.filter((r) => typeof r === 'string' && r.length > 0).slice(0, 20)
      : [];
    if (tabs.length === 0) continue;
    groups.push({
      id: g.id,
      tabs,
      active: typeof g.active === 'string' && tabs.includes(g.active) ? g.active : tabs[0],
    });
    if (groups.length >= MAX_GROUPS) break;
  }
  return groups.length === 0 ? null : groups;
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

  return {
    version: LAYOUT_VERSION,
    sidebar,
    panels,
    editor: normalizeEditorGroups(raw.editor && raw.editor.groups),
  };
}

/** 序列化：App 当前状态 → 可持久化布局对象 */
export function buildLayout({ sidebarVisible, sidebarWidth, panels, groups = null }) {
  const layout = normalizeLayout({
    version: LAYOUT_VERSION,
    sidebar: {
      visible: !!sidebarVisible,
      size: clampSidebarWidth(sidebarWidth),
    },
    panels,
  });
  if (Array.isArray(groups) && groups.length > 0) {
    layout.editor = { groups: normalizeEditorGroups(groups) };
  } else {
    layout.editor = null;
  }
  return layout;
}

/** 还原：持久化布局 → App 初始化状态（panel 显隐缺失时用默认） */
export function applyLayout(layout) {
  const normalized = normalizeLayout(layout);
  return {
    sidebar: { ...normalized.sidebar },
    panels: { ...normalized.panels },
    editor: normalized.editor,
  };
}

// ── 编辑器分屏组运行时纯逻辑（关闭合并；不依赖 React/Electron） ──

/**
 * 关闭 group 内一个 tab：返回关闭后的 group（空组 → null）。
 * 关闭的是活动 tab 时，焦点移到前一个 tab（无前一个则第一个）。
 * @param {object} group — { id, tabs, activeTabId }
 * @param {string} tabId
 * @returns {{ group: object|null, removed: boolean }}
 */
export function closeTabInGroup(group, tabId) {
  const tIdx = group.tabs.findIndex((t) => t.id === tabId);
  if (tIdx === -1) return { group: null, removed: false };
  const tabs = group.tabs.filter((t) => t.id !== tabId);
  if (tabs.length === 0) return { group: null, removed: true };
  let activeTabId = group.activeTabId;
  if (activeTabId === tabId) {
    activeTabId = tabs[Math.max(0, tIdx - 1)].id;
  }
  return { group: { ...group, tabs, activeTabId }, removed: true };
}

/**
 * 移除一个 group（组内 tab 全部关闭后）：返回新 groups 与焦点组。
 * 移除的是焦点组时，焦点移到右侧相邻组（无则左侧，再无则 null）。
 * @param {Array} groups
 * @param {string} groupId
 * @param {string|null} activeGroupId
 * @returns {{ groups: Array, activeGroupId: string|null }}
 */
export function removeGroup(groups, groupId, activeGroupId) {
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx === -1) return { groups, activeGroupId };
  const next = groups.filter((g) => g.id !== groupId);
  let nextActive = activeGroupId;
  if (activeGroupId === groupId) {
    const fallback = next[Math.min(idx, next.length - 1)];
    nextActive = fallback ? fallback.id : null;
  }
  return { groups: next, activeGroupId: nextActive };
}
