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

  test('defaultLayout：默认值（sidebar 220 可见，relations 开，editor 空）', () => {
    const l = defaultLayout();
    expect(l.version).toBe(LAYOUT_VERSION);
    expect(l.sidebar).toEqual({ visible: true, size: 220 });
    expect(l.panels).toEqual({ relations: true, settings: false, plugin: false });
    expect(l.editor).toBeNull();
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
      editor: null,
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

  // ── editor 分屏组（P1） ──

  test('normalizeEditorGroups：合法组（active 缺省回退首 rid）', () => {
    const g = paneLayout.normalizeEditorGroups([
      { id: 'g1', tabs: ['res_a', 'res_b'], active: 'res_b' },
      { id: 'g2', tabs: ['res_c'] },
    ]);
    expect(g).toEqual([
      { id: 'g1', tabs: ['res_a', 'res_b'], active: 'res_b' },
      { id: 'g2', tabs: ['res_c'], active: 'res_c' },
    ]);
  });

  test('normalizeEditorGroups：非法/空输入 → null', () => {
    expect(paneLayout.normalizeEditorGroups(null)).toBeNull();
    expect(paneLayout.normalizeEditorGroups([])).toBeNull();
    expect(paneLayout.normalizeEditorGroups([{ id: 'x', tabs: [] }])).toBeNull();
    expect(paneLayout.normalizeEditorGroups('x')).toBeNull();
  });

  test('normalizeEditorGroups：active 不在 tabs 中 → 回退首 rid；超限截断', () => {
    const g = paneLayout.normalizeEditorGroups([
      { id: 'g1', tabs: ['res_a', 'res_b'], active: 'res_missing' },
      { id: 'g2', tabs: ['res_c'] },
      { id: 'g3', tabs: ['res_d'] },
      { id: 'g4', tabs: ['res_e'] },
    ]);
    expect(g.length).toBe(3);
    expect(g[0].active).toBe('res_a');
  });

  test('buildLayout：带 groups 时 editor 序列化（rid 列表，无 draft）', () => {
    const l = buildLayout({
      sidebarVisible: true,
      sidebarWidth: 220,
      panels: { relations: true, settings: false, plugin: false },
      groups: [
        { id: 'g1', tabs: ['res_a', 'res_b'], active: 'res_b' },
        { id: 'g2', tabs: ['res_c'], active: 'res_c' },
      ],
    });
    expect(l.editor.groups).toEqual([
      { id: 'g1', tabs: ['res_a', 'res_b'], active: 'res_b' },
      { id: 'g2', tabs: ['res_c'], active: 'res_c' },
    ]);
  });

  test('applyLayout：editor 还原（缺失 → null）', () => {
    const app = applyLayout({
      sidebar: { visible: false, size: 300 },
      editor: { groups: [{ id: 'g1', tabs: ['res_x'], active: 'res_x' }] },
    });
    expect(app.editor).toEqual([{ id: 'g1', tabs: ['res_x'], active: 'res_x' }]);
    expect(applyLayout(null).editor).toBeNull();
  });

  // ── 关闭合并纯逻辑（P1） ──

  const G = (id, tabIds, activeId) => ({
    id,
    tabs: tabIds.map((tid) => ({ id: tid, rid: `res_${tid}` })),
    activeTabId: activeId,
  });

  test('closeTabInGroup：关闭非活动 tab，activeTabId 不变', () => {
    const g = G('g1', ['a', 'b', 'c'], 'b');
    const { group, removed } = paneLayout.closeTabInGroup(g, 'a');
    expect(removed).toBe(true);
    expect(group.activeTabId).toBe('b');
    expect(group.tabs.map((t) => t.id)).toEqual(['b', 'c']);
  });

  test('closeTabInGroup：关闭活动 tab，焦点移到前一个', () => {
    const g = G('g1', ['a', 'b', 'c'], 'c');
    const { group } = paneLayout.closeTabInGroup(g, 'c');
    expect(group.activeTabId).toBe('b');
  });

  test('closeTabInGroup：关闭第一个活动 tab，焦点移到新的第一个', () => {
    const g = G('g1', ['a', 'b'], 'a');
    const { group } = paneLayout.closeTabInGroup(g, 'a');
    expect(group.activeTabId).toBe('b');
  });

  test('closeTabInGroup：最后一个 tab 关闭 → group 置空', () => {
    const g = G('g1', ['a'], 'a');
    const { group, removed } = paneLayout.closeTabInGroup(g, 'a');
    expect(removed).toBe(true);
    expect(group).toBeNull();
  });

  test('closeTabInGroup：tab 不存在 → removed=false 且 group 为 null', () => {
    const g = G('g1', ['a'], 'a');
    expect(paneLayout.closeTabInGroup(g, 'zz').removed).toBe(false);
  });

  test('removeGroup：移除非焦点组，焦点不变', () => {
    const groups = [G('g1', ['a'], 'a'), G('g2', ['b'], 'b')];
    const r = paneLayout.removeGroup(groups, 'g2', 'g1');
    expect(r.groups.map((g) => g.id)).toEqual(['g1']);
    expect(r.activeGroupId).toBe('g1');
  });

  test('removeGroup：移除焦点组，焦点移到右侧相邻（无则左侧）', () => {
    const groups = [G('g1', ['a'], 'a'), G('g2', ['b'], 'b'), G('g3', ['c'], 'c')];
    const r = paneLayout.removeGroup(groups, 'g2', 'g2');
    expect(r.activeGroupId).toBe('g3');

    const r2 = paneLayout.removeGroup(groups, 'g3', 'g3');
    expect(r2.activeGroupId).toBe('g2');
  });

  test('removeGroup：移除最后一个组 → 焦点 null', () => {
    const groups = [G('g1', ['a'], 'a')];
    const r = paneLayout.removeGroup(groups, 'g1', 'g1');
    expect(r.groups).toEqual([]);
    expect(r.activeGroupId).toBeNull();
  });
});
