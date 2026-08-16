/**
 * SessionService 契约测试（U2：Agent Session 运行时模型 + readOnly 迁移）
 * 用例（022 §5）：createSession(note/pdf/epub)、override 强制、toggle、
 * readOnly 重算、resolveReadOnly（右键菜单判定）。
 * 模块为 ESM（renderer 侧），测试经动态 import 加载。
 */
describe('SessionService（U2：Session 模型 + readOnly 迁移）', () => {
  let SessionService;

  beforeAll(async () => {
    SessionService = await import(
      '../../src/renderer/src/services/SessionService.mjs'
    );
  });

  const modesApi = (modes) => ({
    modes: {
      resolve: jest.fn(async () => ({ ok: true, modes })),
    },
    viewers: {
      list: jest.fn(async () => ({
        ok: true,
        viewers: [
          { viewerId: 'viewer.markdown-editor' },
          { viewerId: 'viewer.generic-preview' },
        ],
      })),
    },
  });

  const apiWith = (overrides = {}) => ({
    modes: {
      resolve: jest.fn(async () => ({ ok: true, modes: overrides.modes })),
    },
    viewers: {
      list: jest.fn(async (modeId) => ({
        ok: true,
        viewers: (overrides.viewers || {})[modeId] || [],
      })),
    },
  });

  test('createSession(note) → mode=editing → state.readOnly=false', async () => {
    const api = apiWith({
      modes: [
        { modeId: 'editing', semantics: '编辑', rules: { writable: true, interactive: true } },
      ],
      viewers: { editing: [{ viewerId: 'viewer.markdown-editor' }] },
    });
    const s = await SessionService.createSession(
      { rid: 'res_note' },
      api,
    );
    expect(s.modeId).toBe('editing');
    expect(s.viewerId).toBe('viewer.markdown-editor');
    expect(s.state.readOnly).toBe(false);
  });

  test('createSession(pdf) → mode=reading → state.readOnly=true', async () => {
    const api = apiWith({
      modes: [
        { modeId: 'reading', semantics: '阅读', rules: { writable: false, interactive: true } },
      ],
      viewers: { reading: [{ viewerId: 'viewer.generic-preview' }] },
    });
    const s = await SessionService.createSession({ rid: 'res_pdf' }, api);
    expect(s.modeId).toBe('reading');
    expect(s.state.readOnly).toBe(true);
  });

  test('createSession(epub) 插件未装态 → mode=reading → viewer=generic-preview', async () => {
    const api = apiWith({
      modes: [
        { modeId: 'reading', semantics: '阅读', rules: { writable: false, interactive: true } },
      ],
      viewers: { reading: [{ viewerId: 'viewer.generic-preview' }] },
    });
    const s = await SessionService.createSession({ rid: 'res_epub' }, api);
    expect(s.modeId).toBe('reading');
    expect(s.viewerId).toBe('viewer.generic-preview');
    expect(s.state.readOnly).toBe(true);
  });

  test('override 强制：globalOverrides 含 rid → readOnly=true（editing 亦然）', async () => {
    const api = apiWith({
      modes: [
        { modeId: 'editing', semantics: '编辑', rules: { writable: true, interactive: true } },
      ],
      viewers: { editing: [{ viewerId: 'viewer.markdown-editor' }] },
    });
    const s = await SessionService.createSession(
      { rid: 'res_1' },
      api,
      new Set(['res_1']),
    );
    expect(s.state.readOnly).toBe(true);
    expect(s.overrides.has('res_1')).toBe(true);
  });

  test('toggle：翻转 override → state.readOnly 翻转（可写 mode）', () => {
    const session = {
      resourceRid: 'res_1',
      modeId: 'editing',
      viewerId: 'viewer.markdown-editor',
      writable: true,
      state: { readOnly: false, dirty: false, scroll: 0 },
      overrides: new Set(),
    };
    const { nextSession, nextOverrides } = SessionService.toggleReadOnly(
      session,
      'res_1',
      new Set(),
    );
    expect(nextOverrides.has('res_1')).toBe(true);
    expect(nextSession.state.readOnly).toBe(true);

    const back = SessionService.toggleReadOnly(nextSession, 'res_1', nextOverrides);
    expect(back.nextOverrides.has('res_1')).toBe(false);
    expect(back.nextSession.state.readOnly).toBe(false);
  });

  test('toggle 对不可写 mode 无效（writable=false → readOnly 恒 true）', () => {
    const session = {
      resourceRid: 'res_pdf',
      modeId: 'reading',
      viewerId: 'viewer.generic-preview',
      writable: false,
      state: { readOnly: true, dirty: false, scroll: 0 },
      overrides: new Set(['res_pdf']),
    };
    const { nextSession, nextOverrides } = SessionService.toggleReadOnly(
      session,
      'res_pdf',
      new Set(['res_pdf']),
    );
    expect(nextOverrides.has('res_pdf')).toBe(false);
    expect(nextSession.state.readOnly).toBe(true);
  });

  test('createSession：mode 为空 → 抛错；viewer 为空 → 抛错', async () => {
    await expect(
      SessionService.createSession({ rid: 'res_x' }, modesApi([])),
    ).rejects.toThrow(/Mode/);

    const api = apiWith({
      modes: [
        { modeId: 'editing', rules: { writable: true, interactive: true } },
      ],
      viewers: {},
    });
    await expect(
      SessionService.createSession({ rid: 'res_x' }, api),
    ).rejects.toThrow(/Viewer/);
  });

  test('resolveReadOnly：已有 Session 优先；未打开经 modes.resolve', async () => {
    const existing = {
      resourceRid: 'res_1',
      state: { readOnly: true },
    };
    expect(
      await SessionService.resolveReadOnly({ rid: 'res_1' }, null, new Set(), existing),
    ).toBe(true);

    const api = apiWith({
      modes: [
        { modeId: 'editing', rules: { writable: true, interactive: true } },
      ],
      viewers: {},
    });
    expect(
      await SessionService.resolveReadOnly({ rid: 'res_2' }, api, new Set()),
    ).toBe(false);

    const readApi = apiWith({
      modes: [
        { modeId: 'reading', rules: { writable: false, interactive: true } },
      ],
      viewers: {},
    });
    expect(
      await SessionService.resolveReadOnly({ rid: 'res_3' }, readApi, new Set()),
    ).toBe(true);
  });

  test('resolveReadOnly：api 缺失时仅凭 override 集合判定', async () => {
    expect(
      await SessionService.resolveReadOnly({ rid: 'res_1' }, null, new Set(['res_1'])),
    ).toBe(true);
    expect(
      await SessionService.resolveReadOnly({ rid: 'res_1' }, null, new Set()),
    ).toBe(false);
  });
});
