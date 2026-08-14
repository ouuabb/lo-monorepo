/**
 * P3 searchProviders 扩展点消费测试
 *
 * 验证 lo find 聚合核心搜索与插件 searchProviders 的行为：
 *   A. aggregateSearchResults 纯函数：合并/去重/过滤/截断/错误隔离（直接覆盖每个失败分支）
 *   B. 端到端：真实插件系统注册 searchProvider → find 聚合
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');


const Repository = require('../../src/repo/repository.cjs');
const findModule = require('../../src/commands/find.cjs');
const { aggregateSearchResults } = findModule;
const findCommand = findModule;
const { setupTempRepo, teardownTempRepo } = require('../commands/commandTestHelper.cjs');

// ── 工具：构造 provider entry ──
function provider(key, pluginId, handler) {
  return { key, pluginId, handler };
}

// ── 工具：在 .repo/plugins/ 下创建一个 searchProvider 插件 ──
/**
 * @param {string} pluginsDir — .repo/plugins/ 路径
 * @param {string} id — 插件 ID
 * @param {object} opts
 * @param {string} [opts.providerKey] — 注册的 searchProvider key，默认等于 id
 * @param {Array}  [opts.results]     — search() 返回的结果
 * @param {boolean}[opts.throwInSearch] — search() 抛错
 * @param {boolean}[opts.throwInSupports] — supports() 抛错
 * @param {boolean}[opts.supportsFalse]  — supports() 返回 false
 * @param {boolean}[opts.noSearchMethod] — handler 不含 search()
 * @param {boolean}[opts.functionForm]   — handler 为函数形式
 * @param {*}      [opts.returnNonArray] — search() 返回非数组
 */
async function createSearchPlugin(pluginsDir, id, opts = {}) {
  const dir = path.join(pluginsDir, id);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({
    id, name: id, version: '0.0.1', main: 'index.cjs',
  }));

  const providerKey = opts.providerKey || id;
  const results = JSON.stringify(opts.results || []);
  const throwSearch = opts.throwInSearch ? `throw new Error('${id} search 故意失败');` : '';
  const throwSupports = opts.throwInSupports ? `throw new Error('${id} supports 故意失败');` : '';
  const supportsFalse = opts.supportsFalse ? 'return false;' : 'return true;';
  const returnNonArray = opts.returnNonArray !== undefined
    ? `return ${JSON.stringify(opts.returnNonArray)};`
    : `return ${results};`;

  // 构造 handler 源码
  let handlerSrc;
  if (opts.noSearchMethod) {
    handlerSrc = `{ id: '${providerKey}' }`; // 无 search()
  } else if (opts.functionForm) {
    handlerSrc = `async (query, options) => {
      ${throwSearch}
      ${returnNonArray}
    }`;
  } else {
    handlerSrc = `{
      id: '${providerKey}',
      supports(query) { ${throwSupports} ${supportsFalse} },
      async search(query, options) {
        ${throwSearch}
        ${returnNonArray}
      }
    }`;
  }

  await fs.writeFile(path.join(dir, 'index.cjs'), `
    const { Plugin } = require('@lo/plugins-sdk');
    class P extends Plugin {
      manifest() { return { id: '${id}', name: '${id}', version: '0.0.1' }; }
      register(context) {
        const ext = context.extensions;
        if (ext && typeof ext.register === 'function') {
          ext.register('${id}', 'searchProviders', '${providerKey}', ${handlerSrc});
        }
      }
    }
    module.exports = P;
  `);
}

async function cleanupRepo(repo, tempDir) {
  if (repo && repo.db) {
    try { await repo.db.close(); } catch {}
  }
  if (tempDir && await fs.pathExists(tempDir)) {
    try { await fs.remove(tempDir); } catch {}
  }
}

// ── 工具：创建一个 register() 抛错的坏插件（非 searchProvider） ──
async function createBadRegisterPlugin(pluginsDir, id) {
  const dir = path.join(pluginsDir, id);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({
    id, name: id, version: '0.0.1', main: 'index.cjs',
  }));
  await fs.writeFile(path.join(dir, 'index.cjs'), `
    const { Plugin } = require('@lo/plugins-sdk');
    class P extends Plugin {
      manifest() { return { id: '${id}', name: '${id}', version: '0.0.1' }; }
      register() { throw new Error('${id} register 故意失败'); }
    }
    module.exports = P;
  `);
}

// ── 工具：创建一个声明循环依赖的插件（使 initPluginSystem 顶层抛错） ──
async function createCyclicPlugin(pluginsDir, id, dependsOn) {
  const dir = path.join(pluginsDir, id);
  await fs.ensureDir(dir);
  await fs.writeFile(path.join(dir, 'plugin.json'), JSON.stringify({
    id, name: id, version: '0.0.1', main: 'index.cjs',
  }));
  await fs.writeFile(path.join(dir, 'index.cjs'), `
    const { Plugin } = require('@lo/plugins-sdk');
    class P extends Plugin {
      manifest() {
        return { id: '${id}', name: '${id}', version: '0.0.1', dependencies: ${JSON.stringify([dependsOn])} };
      }
    }
    module.exports = P;
  `);
}

// ─────────────────────────────────────────────────────────────
// A. aggregateSearchResults 纯函数测试
// ─────────────────────────────────────────────────────────────
describe('P3 aggregateSearchResults — 纯函数', () => {
  const coreResults = [
    { rid: 'r1', type: 'note', path: '/a.md', metadata: { title: 'Core A' }, created: '2026-08-01' },
  ];

  test('无 provider → 仅返回 core 结果，标记 source=core', async () => {
    const out = await aggregateSearchResults(coreResults, [], 'foo', { limit: 10 });
    expect(out.length).toBe(1);
    expect(out[0].source).toBe('core');
    expect(out[0].pluginId).toBeNull();
  });

  test('core + 1 个 provider → 合并，provider 结果带 source/pluginId', async () => {
    const providers = [
      provider('p1', 'plugin-1', { search: async () => [
        { rid: 'r2', type: 'vocabulary', path: '/b', metadata: { title: 'P1 B' } },
      ] }),
    ];
    const out = await aggregateSearchResults(coreResults, providers, 'foo', { limit: 10 });
    expect(out.length).toBe(2);
    expect(out[0].source).toBe('core');
    expect(out[1].source).toBe('p1');
    expect(out[1].pluginId).toBe('plugin-1');
  });

  test('core + 2 个 provider → 全部合并', async () => {
    const providers = [
      provider('p1', 'plugin-1', { search: async () => [{ rid: 'r2', type: 't1' }] }),
      provider('p2', 'plugin-2', { search: async () => [{ rid: 'r3', type: 't2' }] }),
    ];
    const out = await aggregateSearchResults(coreResults, providers, 'foo', { limit: 10 });
    expect(out.length).toBe(3);
    expect(out.map(r => r.source)).toEqual(['core', 'p1', 'p2']);
  });

  test('rid 去重：core 与 provider 相同 rid → 保留 core，丢弃 provider 重复', async () => {
    const providers = [
      provider('p1', 'plugin-1', { search: async () => [
        { rid: 'r1', type: 'note', metadata: { title: 'dup' } },
      ] }),
    ];
    const out = await aggregateSearchResults(coreResults, providers, 'foo', { limit: 10 });
    expect(out.length).toBe(1);
    expect(out[0].source).toBe('core');
  });

  test('path 去重：无 rid 时按 path 去重，保留先出现者', async () => {
    const core = [{ type: 'note', path: '/x.md', metadata: { title: 'core x' } }];
    const providers = [
      provider('p1', 'plugin-1', { search: async () => [
        { type: 'note', path: '/x.md', metadata: { title: 'dup x' } },
        { type: 'note', path: '/y.md', metadata: { title: 'p y' } },
      ] }),
    ];
    const out = await aggregateSearchResults(core, providers, 'foo', { limit: 10 });
    expect(out.length).toBe(2);
    expect(out[0].metadata.title).toBe('core x');
    expect(out[1].metadata.title).toBe('p y');
  });

  test('type 过滤作用于聚合后的全集', async () => {
    const providers = [
      provider('p1', 'plugin-1', { search: async () => [
        { rid: 'r2', type: 'vocabulary', metadata: {} },
        { rid: 'r3', type: 'note', metadata: {} },
      ] }),
    ];
    const out = await aggregateSearchResults(coreResults, providers, 'foo', { limit: 10, type: 'vocabulary' });
    expect(out.length).toBe(1);
    expect(out[0].type).toBe('vocabulary');
  });

  test('limit 截断作用于聚合后的全集', async () => {
    const providers = [
      provider('p1', 'plugin-1', { search: async () => [
        { rid: 'r2', type: 't1' }, { rid: 'r3', type: 't1' }, { rid: 'r4', type: 't1' },
      ] }),
    ];
    const out = await aggregateSearchResults(coreResults, providers, 'foo', { limit: 2 });
    expect(out.length).toBe(2);
  });

  test('错误隔离：provider search() 抛错 → 跳过该 provider，core 和其他 provider 正常', async () => {
    const logs = [];
    const logger = { error: (m) => logs.push(m) };
    const providers = [
      provider('bad', 'plugin-bad', { search: async () => { throw new Error('boom'); } }),
      provider('good', 'plugin-good', { search: async () => [{ rid: 'r9', type: 't' }] }),
    ];
    const out = await aggregateSearchResults(coreResults, providers, 'foo', { limit: 10 }, logger);
    expect(out.length).toBe(2); // core + good
    expect(out.map(r => r.source)).toEqual(['core', 'good']);
    expect(logs.some(m => m.includes("'bad'"))).toBe(true);
  });

  test('provider 缺少 search() 方法 → 跳过', async () => {
    const logs = [];
    const logger = { error: (m) => logs.push(m) };
    const providers = [provider('p1', 'plugin-1', { id: 'p1' })]; // 无 search
    const out = await aggregateSearchResults(coreResults, providers, 'foo', { limit: 10 }, logger);
    expect(out.length).toBe(1);
    expect(out[0].source).toBe('core');
    expect(logs.some(m => m.includes("缺少 search()"))).toBe(true);
  });

  test('provider supports() 返回 false → 跳过', async () => {
    const providers = [provider('p1', 'plugin-1', {
      supports: () => false,
      search: async () => [{ rid: 'r2', type: 't' }],
    })];
    const out = await aggregateSearchResults(coreResults, providers, 'foo', { limit: 10 });
    expect(out.length).toBe(1);
    expect(out[0].source).toBe('core');
  });

  test('provider supports() 抛错 → 跳过', async () => {
    const logs = [];
    const logger = { error: (m) => logs.push(m) };
    const providers = [provider('p1', 'plugin-1', {
      supports: () => { throw new Error('supports boom'); },
      search: async () => [{ rid: 'r2', type: 't' }],
    })];
    const out = await aggregateSearchResults(coreResults, providers, 'foo', { limit: 10 }, logger);
    expect(out.length).toBe(1);
    expect(logs.some(m => m.includes('supports()'))).toBe(true);
  });

  test('provider 返回非数组 → 跳过', async () => {
    const providers = [provider('p1', 'plugin-1', { search: async () => ({ not: 'array' }) })];
    const out = await aggregateSearchResults(coreResults, providers, 'foo', { limit: 10 });
    expect(out.length).toBe(1);
    expect(out[0].source).toBe('core');
  });

  test('函数形式 handler → 正常工作', async () => {
    const providers = [
      provider('p1', 'plugin-1', async () => [{ rid: 'r2', type: 't' }]),
    ];
    const out = await aggregateSearchResults(coreResults, providers, 'foo', { limit: 10 });
    expect(out.length).toBe(2);
    expect(out[1].source).toBe('p1');
  });

  test('core 结果无 rid/path → 保留（不去重）', async () => {
    const core = [{ type: 'note', metadata: { title: 'no ids' } }];
    const out = await aggregateSearchResults(core, [], 'foo', { limit: 10 });
    expect(out.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// B. 端到端：真实插件系统注册 searchProvider
// ─────────────────────────────────────────────────────────────
describe('P3 searchProviders — 端到端', () => {
  let tempDir, repo;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-searchp-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    repo = new Repository(tempDir);
    await repo.init();
  });

  afterEach(async () => {
    await cleanupRepo(repo, tempDir);
  });

  test('真实 searchProvider 插件 → find 聚合 core + provider 结果', async () => {
    const pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await createSearchPlugin(pluginsDir, 'my-search', {
      providerKey: 'my-search',
      results: [
        { rid: 'sp-1', type: 'vocabulary', path: '/vocab/serendipity', name: 'serendipity', metadata: { title: 'serendipity' } },
        { rid: 'sp-2', type: 'vocabulary', path: '/vocab/ephemeral', name: 'ephemeral', metadata: { title: 'ephemeral' } },
      ],
    });

    await repo.db.close();
    repo = new Repository(tempDir);
    await repo.init();
    await repo.initPluginSystem();

    const extRegistry = repo.getPluginExtensionRegistry();
    const providers = extRegistry.list('searchProviders');
    expect(providers.length).toBe(1);
    expect(providers[0].key).toBe('my-search');

    // 核心无结果，provider 提供 2 条
    const out = await aggregateSearchResults([], providers, 'serendipity', { limit: 10 });
    expect(out.length).toBe(2);
    expect(out.every(r => r.source === 'my-search')).toBe(true);
    expect(out[0].pluginId).toBe('my-search');
  });

  test('坏 searchProvider + 好 searchProvider → 坏的跳过，好的与 core 正常（端到端错误隔离）', async () => {
    const pluginsDir = path.join(tempDir, '.repo', 'plugins');
    await createSearchPlugin(pluginsDir, 'bad-search', {
      throwInSearch: true,
      results: [],
    });
    await createSearchPlugin(pluginsDir, 'good-search', {
      results: [
        { rid: 'good-1', type: 'vocabulary', metadata: { title: 'good' } },
      ],
    });

    await repo.db.close();
    repo = new Repository(tempDir);
    await repo.init();
    await repo.initPluginSystem();

    const extRegistry = repo.getPluginExtensionRegistry();
    const providers = extRegistry.list('searchProviders');
    expect(providers.length).toBe(2);

    const coreResults = [
      { rid: 'core-1', type: 'note', path: '/core.md', metadata: { title: 'core' } },
    ];
    const logs = [];
    const out = await aggregateSearchResults(coreResults, providers, 'foo', { limit: 10 }, { error: (m) => logs.push(m) });
    expect(out.length).toBe(2); // core + good-search
    expect(out.map(r => r.source)).toEqual(['core', 'good-search']);
    expect(logs.some(m => m.includes("'bad-search'"))).toBe(true);
  });

  test('插件系统未启用（无插件）→ 仅 core 结果，不抛错', async () => {
    // 不调用 initPluginSystem，直接构造空 providers
    const extRegistry = repo.getPluginExtensionRegistry();
    const providers = extRegistry.list('searchProviders');
    expect(providers.length).toBe(0);

    const out = await aggregateSearchResults(coreResultsFixture(), providers, 'foo', { limit: 10 });
    expect(out.length).toBe(1);
    expect(out[0].source).toBe('core');
  });
});

function coreResultsFixture() {
  return [{ rid: 'c1', type: 'note', path: '/c.md', metadata: { title: 'c' } }];
}

// ─────────────────────────────────────────────────────────────
// C. find 命令包装层端到端（直接覆盖 initPluginSystem / 聚合 / 输出 全链路）
// ─────────────────────────────────────────────────────────────
describe('P3 find 命令 — 全链路', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  // 捕获 console.log 输出（Logger.title/info 与结果行均走 console.log）
  function captureConsole() {
    const logs = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    return { logs, restore: () => spy.mockRestore() };
  }

  test('find 命令聚合 searchProvider 插件结果（输出含 [providerKey] 标记）', async () => {
    const pluginsDir = path.join(ctx.tempDir, '.repo', 'plugins');
    await createSearchPlugin(pluginsDir, 'cmd-search', {
      providerKey: 'cmd-search',
      results: [
        { rid: 'cmd-1', type: 'vocabulary', path: '/v/word', name: 'serendipity', metadata: { title: 'serendipity' } },
      ],
    });

    const { logs, restore } = captureConsole();
    await findCommand({ query: 'serendipity', limit: 10, type: undefined });
    restore();

    const joined = logs.join('\n');
    expect(joined).toContain('serendipity');
    expect(joined).toContain('[cmd-search]');
  });

  test('find 命令在坏插件（非 searchProvider）+ 好 searchProvider 下仍正常（P2+P3 隔离）', async () => {
    const pluginsDir = path.join(ctx.tempDir, '.repo', 'plugins');
    await createBadRegisterPlugin(pluginsDir, 'bad-other');
    await createSearchPlugin(pluginsDir, 'good-search', {
      results: [{ rid: 'g-1', type: 'note', name: 'goodword', metadata: { title: 'goodword' } }],
    });

    const { logs, restore } = captureConsole();
    await findCommand({ query: 'goodword', limit: 10 });
    restore();

    const joined = logs.join('\n');
    expect(joined).toContain('goodword');
    expect(joined).toContain('[good-search]');
  });

  test('find 命令无插件 → 仅核心搜索，不抛错（向后兼容）', async () => {
    // 无插件目录，find 应正常走核心搜索（空结果路径）
    const { logs, restore } = captureConsole();
    await findCommand({ query: 'anything', limit: 10 });
    restore();

    // 空仓库核心搜索无结果 → 输出 "未找到"
    expect(logs.join('\n')).toContain('未找到');
  });

  test('find 命令在 initPluginSystem 抛错（循环依赖）时回退为核心搜索', async () => {
    // 两个互相依赖的插件 → detectCycles 顶层抛错 → initPluginSystem throw
    const pluginsDir = path.join(ctx.tempDir, '.repo', 'plugins');
    await createCyclicPlugin(pluginsDir, 'cyc-a', 'cyc-b');
    await createCyclicPlugin(pluginsDir, 'cyc-b', 'cyc-a');

    const { logs, restore } = captureConsole();
    await findCommand({ query: 'anything', limit: 10 });
    restore();

    const joined = logs.join('\n');
    // 直接验证 catch 分支：Logger.warn 输出了回退提示
    expect(joined).toContain('插件系统未启用');
    // 回退后核心搜索正常（空仓库 → 未找到）
    expect(joined).toContain('未找到');
  });
});

