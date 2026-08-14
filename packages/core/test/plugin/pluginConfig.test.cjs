/**
 * P0: 插件配置注入测试
 *
 * 验证修复：此前 PluginManager._activatePlugin 构建 PluginContext 时未传 config，
 * 导致 context.config() 永远返回 {}，chrome-translate 的 exportFilePath 等配置失效。
 *
 * 覆盖：
 *   1. 默认值合并（未设置时返回 manifest.config.default）
 *   2. 类型转换：string / boolean / number
 *   3. 设置未声明的 key → 抛错
 *   4. 类型校验失败 → 抛错
 *   5. 设置后已激活插件 context 立即生效（无需 reload）
 *   6. _activatePlugin 注入 config（context.config() 不再是空）
 *   7. reloadPlugin 保留配置
 *   8. unloadPlugin(deleteFiles=true) 清理配置；保留文件时保留配置
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');


const Repository = require('../../src/repo/repository.cjs');

const PLUGIN_ID = 'config-test';
const PLUGIN_VERSION = '1.0.0';

/** 假插件入口：鸭子类型 Plugin，记录 register 时收到的 config */
const PLUGIN_SRC = `
class ConfigTestPlugin {
  constructor() {
    this._receivedConfig = null;
    this._context = null;
  }
  get id() { return '${PLUGIN_ID}'; }
  get name() { return 'Config Test'; }
  get version() { return '${PLUGIN_VERSION}'; }
  manifest() {
    return {
      id: '${PLUGIN_ID}',
      name: 'Config Test',
      version: '${PLUGIN_VERSION}',
      config: {
        filePath: { type: 'string',  default: '',             description: '文件路径' },
        enabled:  { type: 'boolean', default: false },
        count:    { type: 'number',  default: 0 },
      },
    };
  }
  register(ctx) {
    this._context = ctx;
    this._receivedConfig = ctx.config();
  }
  initialize() {}
  enable() {}
  disable() {}
  dispose() {}
}
module.exports = ConfigTestPlugin;
`;

async function cleanupRepo(repo, tempDir) {
  if (repo && repo.db) {
    try { await repo.db.close(); } catch {}
  }
  if (tempDir && await fs.pathExists(tempDir)) {
    try { await fs.remove(tempDir); } catch {}
  }
}

describe('P0: 插件配置注入', () => {
  let tempDir, repo;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lo-p0-config-'));
    // 写入假插件到 .repo/plugins/<id>/
    const pluginDir = path.join(tempDir, '.repo', 'plugins', PLUGIN_ID);
    await fs.ensureDir(pluginDir);
    await fs.writeFile(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({ id: PLUGIN_ID, name: 'Config Test', version: PLUGIN_VERSION, main: 'index.cjs' })
    );
    await fs.writeFile(path.join(pluginDir, 'index.cjs'), PLUGIN_SRC);

    repo = new Repository(tempDir);
    await repo.init();
    await repo.initPluginSystem();
  });

  afterEach(async () => {
    await cleanupRepo(repo, tempDir);
  });

  // ── 1. 默认值合并 + 注入 ──

  test('未设置时 context.config() 返回 manifest 默认值（修复断链）', () => {
    const plugin = repo.getPluginManager().getPlugin(PLUGIN_ID);
    expect(plugin._receivedConfig).toEqual({ filePath: '', enabled: false, count: 0 });
  });

  test('context.config(key) 单键读取也可用', () => {
    const plugin = repo.getPluginManager().getPlugin(PLUGIN_ID);
    expect(plugin._context.config('filePath')).toBe('');
    expect(plugin._context.config('enabled')).toBe(false);
    expect(plugin._context.config('count')).toBe(0);
  });

  // ── 2. 类型转换 ──

  test('设置 string → 持久化 + 读取返回 string', async () => {
    await repo.setPluginConfig(PLUGIN_ID, 'filePath', '/tmp/export.json');
    const cfg = await repo.getPluginConfig(PLUGIN_ID);
    expect(cfg.filePath).toBe('/tmp/export.json');
    expect(typeof cfg.filePath).toBe('string');
  });

  test('设置 boolean（字符串 "true"/"false"）→ 读取返回 boolean', async () => {
    await repo.setPluginConfig(PLUGIN_ID, 'enabled', 'true');
    expect((await repo.getPluginConfig(PLUGIN_ID)).enabled).toBe(true);
    await repo.setPluginConfig(PLUGIN_ID, 'enabled', 'false');
    expect((await repo.getPluginConfig(PLUGIN_ID)).enabled).toBe(false);
  });

  test('设置 boolean（布尔字面量）→ 读取返回 boolean', async () => {
    await repo.setPluginConfig(PLUGIN_ID, 'enabled', true);
    expect((await repo.getPluginConfig(PLUGIN_ID)).enabled).toBe(true);
  });

  test('设置 number（字符串 "42"）→ 读取返回 number', async () => {
    await repo.setPluginConfig(PLUGIN_ID, 'count', '42');
    const cfg = await repo.getPluginConfig(PLUGIN_ID);
    expect(cfg.count).toBe(42);
    expect(typeof cfg.count).toBe('number');
  });

  test('设置 number（数字字面量）→ 读取返回 number', async () => {
    await repo.setPluginConfig(PLUGIN_ID, 'count', 7);
    expect((await repo.getPluginConfig(PLUGIN_ID)).count).toBe(7);
  });

  // ── 3. 校验失败 ──

  test('设置未声明的 key → 抛错', async () => {
    await expect(repo.setPluginConfig(PLUGIN_ID, 'unknownKey', 'x'))
      .rejects.toThrow(/未声明配置项/);
  });

  test('boolean 类型校验失败（非布尔字符串）→ 抛错', async () => {
    await expect(repo.setPluginConfig(PLUGIN_ID, 'enabled', 'notABool'))
      .rejects.toThrow(/期望 boolean/);
  });

  test('number 类型校验失败（非数字字符串）→ 抛错', async () => {
    await expect(repo.setPluginConfig(PLUGIN_ID, 'count', 'abc'))
      .rejects.toThrow(/期望 number/);
  });

  // ── 4. 已激活插件立即生效 ──

  test('设置后已激活插件 context 立即生效（无需 reload）', async () => {
    const plugin = repo.getPluginManager().getPlugin(PLUGIN_ID);
    expect(plugin._context.config('filePath')).toBe('');
    await repo.setPluginConfig(PLUGIN_ID, 'filePath', '/new/path.json');
    expect(plugin._context.config('filePath')).toBe('/new/path.json');
  });

  // ── 5. 持久化 / 卸载行为 ──

  test('reloadPlugin 保留配置', async () => {
    await repo.setPluginConfig(PLUGIN_ID, 'filePath', '/persist.json');
    await repo.reloadPlugin(PLUGIN_ID);
    const cfg = await repo.getPluginConfig(PLUGIN_ID);
    expect(cfg.filePath).toBe('/persist.json');
    // reload 后新实例 register 时收到的 config 也应包含持久化值
    const newPlugin = repo.getPluginManager().getPlugin(PLUGIN_ID);
    expect(newPlugin._receivedConfig.filePath).toBe('/persist.json');
  });

  test('unloadPlugin(deleteFiles=true) 清理配置', async () => {
    await repo.setPluginConfig(PLUGIN_ID, 'filePath', '/temp.json');
    await repo.uninstallPlugin(PLUGIN_ID, { deleteFiles: true });
    const rows = await repo.db.all(
      'SELECT * FROM plugin_settings WHERE plugin_id = ?', [PLUGIN_ID]
    );
    expect(rows.length).toBe(0);
  });

  test('unloadPlugin(保留文件) 保留配置', async () => {
    await repo.setPluginConfig(PLUGIN_ID, 'filePath', '/keep.json');
    await repo.uninstallPlugin(PLUGIN_ID, { deleteFiles: false });
    const rows = await repo.db.all(
      'SELECT * FROM plugin_settings WHERE plugin_id = ?', [PLUGIN_ID]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe('filePath');
    expect(rows[0].value).toBe('/keep.json');
  });

  // ── 6. ctx.setConfig（P0 修复 SDK 空头声明 bug） ──

  test('ctx.setConfig 写入后 ctx.config 立即读回', async () => {
    const plugin = repo.getPluginManager().getPlugin(PLUGIN_ID);
    await plugin._context.setConfig('filePath', '/ctx/write.json');
    expect(plugin._context.config('filePath')).toBe('/ctx/write.json');
  });

  test('ctx.setConfig 持久化到 DB（repo.getPluginConfig 一致）', async () => {
    const plugin = repo.getPluginManager().getPlugin(PLUGIN_ID);
    await plugin._context.setConfig('count', '99');
    const cfg = await repo.getPluginConfig(PLUGIN_ID);
    expect(cfg.count).toBe(99);
  });

  test('ctx.setConfig boolean 类型转换', async () => {
    const plugin = repo.getPluginManager().getPlugin(PLUGIN_ID);
    await plugin._context.setConfig('enabled', 'true');
    expect(plugin._context.config('enabled')).toBe(true);
  });

  test('ctx.setConfig 对未声明 key 抛错', async () => {
    const plugin = repo.getPluginManager().getPlugin(PLUGIN_ID);
    await expect(plugin._context.setConfig('unknownKey', 'x'))
      .rejects.toThrow(/未声明配置项/);
  });

  test('ctx.setConfig 类型校验失败抛错', async () => {
    const plugin = repo.getPluginManager().getPlugin(PLUGIN_ID);
    await expect(plugin._context.setConfig('count', 'abc'))
      .rejects.toThrow(/期望 number/);
  });

  // ── 7. 未加载插件读取配置 → 抛错 ──

  test('getPluginConfig 对未加载插件抛错', async () => {
    await repo.uninstallPlugin(PLUGIN_ID, { deleteFiles: true });
    await expect(repo.getPluginConfig(PLUGIN_ID))
      .rejects.toThrow(/not found/);
  });
});
