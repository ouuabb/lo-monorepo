/**
 * paneLayout 契约测试（P0：布局序列化/还原）
 * 模块为 ESM（renderer 侧），测试经动态 import 加载。
 */
describe('paneLayout（P0：布局序列化/还原）', () => {
  let paneLayout;
  let LAYOUT_VERSION;
  let DEFAULT_SIDEBAR_WIDTH;
  let MIN_SIDEBAR_WIDTH;
  let MAX_SIDEBAR_WIDTH;
  let defaultLayout;
  let clampSidebarWidth;
  let normalizeLayout;
  let buildLayout;
  let applyLayout;

  beforeAll(async () => {
    paneLayout = await import('../../src/renderer/src/layout/paneLayout.mjs');
    ({
      LAYOUT_VERSION,
      DEFAULT_SIDEBAR_WIDTH,
      MIN_SIDEBAR_WIDTH,
      MAX_SIDEBAR_WIDTH,
      defaultLayout,
      clampSidebarWidth,
      normalizeLayout,
      buildLayout,
      applyLayout,
    } = paneLayout);
  });

  test('defaultLayout：默认值（sidebar 220 可见，relations 开）', () => {
    const l = defaultLayout();
    expect(l.version).toBe(LAYOUT_VERSION);
    expect(l.sidebar).toEqual({ visible: true, size: 220 });
    expect(l.panels).toEqual({ relations: true, settings: false, plugin: false });
  });

  test('clampSidebarWidth：合法/非法输入', () => {
    expect(clampSidebarWidth(220)).toBe(220);
    expect(clampSidebarWidth(MIN_SIDEBAR_WIDTH)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(50)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(9999)).toBe(MAX_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(220.6)).toBe(221);
    expect(clampSidebarWidth(null)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(clampSidebarWidth('abc')).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  test('normalizeLayout：null/非对象 → 默认布局', () => {
    expect(normalizeLayout(null)).toEqual(defaultLayout());
    expect(normalizeLayout('x')).toEqual(defaultLayout());
    expect(normalizeLayout(undefined)).toEqual(defaultLayout());
  });

  test('normalizeLayout：合法值原样保留', () => {
    const raw = {
      sidebar: { visible: false, size: 300 },
      panels: { relations: false, settings: true, plugin: false },
    };
    expect(normalizeLayout(raw)).toEqual({
      version: LAYOUT_VERSION,
      sidebar: { visible: false, size: 300 },
      panels: { relations: false, settings: true, plugin: false },
    });
  });

  test('normalizeLayout：越界/非法字段被修正为默认', () => {
    const raw = {
      sidebar: { visible: 'yes', size: 99999 },
      panels: { relations: 'on', settings: true, unknown: true },
    };
    const l = normalizeLayout(raw);
    expect(l.sidebar.visible).toBe(true);
    expect(l.sidebar.size).toBe(MAX_SIDEBAR_WIDTH);
    expect(l.panels.relations).toBe(true);
    expect(l.panels.settings).toBe(true);
    expect(l.panels.plugin).toBe(false);
    expect('unknown' in l.panels).toBe(false);
  });

  test('buildLayout：App 状态 → 布局对象（宽度 clamp）', () => {
    const l = buildLayout({
      sidebarVisible: false,
      sidebarWidth: 100,
      panels: { relations: true, settings: false, plugin: true },
    });
    expect(l.sidebar).toEqual({ visible: false, size: MIN_SIDEBAR_WIDTH });
    expect(l.panels.plugin).toBe(true);
  });

  test('applyLayout：持久化布局 → 初始化状态（缺失面板用默认）', () => {
    const app = applyLayout({
      sidebar: { visible: false, size: 350 },
      panels: { relations: false },
    });
    expect(app.sidebar).toEqual({ visible: false, size: 350 });
    expect(app.panels).toEqual({ relations: false, settings: false, plugin: false });
  });

  test('往返一致：buildLayout → normalizeLayout 幂等', () => {
    const first = buildLayout({
      sidebarVisible: true,
      sidebarWidth: 260,
      panels: { relations: true, settings: true, plugin: false },
    });
    expect(normalizeLayout(JSON.parse(JSON.stringify(first)))).toEqual(first);
  });
});
