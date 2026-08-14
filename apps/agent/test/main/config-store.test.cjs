const os = require('os');
const path = require('path');
const fs = require('fs');
const { ConfigStore } = require('../../src/main/config-store.cjs');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lo-agent-cfg-'));
}

describe('ConfigStore', () => {
  it('文件不存在时 load 返回 {}', () => {
    const store = new ConfigStore(tmpDir());
    expect(store.load()).toEqual({});
  });

  it('save 后 load 读取回写数据', () => {
    const dir = tmpDir();
    const store = new ConfigStore(dir);
    store.save({ host: '10.0.0.1', port: 9000 });
    expect(store.load()).toEqual({ host: '10.0.0.1', port: 9000 });
    expect(fs.existsSync(path.join(dir, 'lo-agent.json'))).toBe(true);
  });

  it('JSON 损坏时 load 返回 {}', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'lo-agent.json'), 'not json', 'utf8');
    const store = new ConfigStore(dir);
    expect(store.load()).toEqual({});
  });

  it('save 自动创建不存在的目录', () => {
    const dir = path.join(tmpDir(), 'a', 'b');
    const store = new ConfigStore(dir);
    store.save({ x: 1 });
    expect(store.load()).toEqual({ x: 1 });
  });
});
