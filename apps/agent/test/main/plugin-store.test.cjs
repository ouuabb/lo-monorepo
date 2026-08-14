const fs = require('fs');
const os = require('os');
const path = require('path');
const { PluginStore } = require('../../src/main/plugin/plugin-store.cjs');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-store-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('PluginStore', () => {
  it('config 初始为空', () => {
    const store = new PluginStore(tmpDir);
    expect(store.loadConfig()).toEqual({});
    expect(store.getPluginConfig('demo')).toEqual({});
  });

  it('setPluginConfig 写入并落盘，getPluginConfig 读取', () => {
    const store = new PluginStore(tmpDir);
    store.setPluginConfig('demo', 'greeting', '你好');
    expect(store.getPluginConfig('demo')).toEqual({ greeting: '你好' });

    // 新实例读同一文件（模拟重启）
    const store2 = new PluginStore(tmpDir);
    expect(store2.getPluginConfig('demo')).toEqual({ greeting: '你好' });
  });

  it('setPluginConfigAll 批量覆盖并保留已有项', () => {
    const store = new PluginStore(tmpDir);
    store.setPluginConfig('demo', 'a', 1);
    store.setPluginConfigAll('demo', { b: 2 });
    expect(store.getPluginConfig('demo')).toEqual({ a: 1, b: 2 });
  });

  it('clearPluginConfig 删除某插件配置', () => {
    const store = new PluginStore(tmpDir);
    store.setPluginConfig('demo', 'a', 1);
    store.setPluginConfig('other', 'x', 1);
    store.clearPluginConfig('demo');
    expect(store.getPluginConfig('demo')).toEqual({});
    expect(store.getPluginConfig('other')).toEqual({ x: 1 });
  });

  it('settings 沙箱：每插件独立文件', () => {
    const store = new PluginStore(tmpDir);
    store.setPluginSetting('a', 'k', 1);
    store.setPluginSetting('b', 'k', 2);
    expect(store.getPluginSettings('a')).toEqual({ k: 1 });
    expect(store.getPluginSettings('b')).toEqual({ k: 2 });
    // 文件隔离
    expect(fs.existsSync(path.join(tmpDir, 'plugin-settings', 'a.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'plugin-settings', 'b.json'))).toBe(true);
  });

  it('setPluginSettingsAll 批量覆盖', () => {
    const store = new PluginStore(tmpDir);
    store.setPluginSettingsAll('a', { x: 1, y: 2 });
    expect(store.getPluginSettings('a')).toEqual({ x: 1, y: 2 });
  });

  it('clearPluginSettings 删除设置文件', () => {
    const store = new PluginStore(tmpDir);
    store.setPluginSetting('a', 'k', 1);
    store.clearPluginSettings('a');
    expect(store.getPluginSettings('a')).toEqual({});
  });

  it('clearPlugin 同时清理配置与设置', () => {
    const store = new PluginStore(tmpDir);
    store.setPluginConfig('a', 'c', 1);
    store.setPluginSetting('a', 's', 1);
    store.clearPlugin('a');
    expect(store.getPluginConfig('a')).toEqual({});
    expect(store.getPluginSettings('a')).toEqual({});
  });

  it('JSON 损坏时返回空对象', () => {
    const store = new PluginStore(tmpDir);
    fs.writeFileSync(store.configFile, '{bad json', 'utf8');
    expect(store.loadConfig()).toEqual({});
  });
});
