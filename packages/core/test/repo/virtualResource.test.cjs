/**
 * 无文件资源（虚拟资源）测试
 *
 * 覆盖 resourceService.create 在 path 为空时的行为：
 *   - 跳过文件操作（fs.stat / fs.readFile / hash 计算）
 *   - path 存为空字符串（DB NOT NULL 约束）
 *   - metadata 正确保存
 *   - 后续可查询
 */

const fs = require('fs-extra');
const path = require('path');
const ResourceService = require('../../src/repo/resourceService.cjs');
const Database = require('../../src/repo/database.cjs');
const { registerMetadataField } = require('../../src/utils/validateMetadata.cjs');

describe('无文件资源（虚拟资源）', () => {
  let tempDir, db, resourceService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'lo-test-vres-'));
    await fs.ensureDir(path.join(tempDir, '.repo'));
    db = new Database(tempDir);
    await db.init();
    resourceService = new ResourceService(db);

    // 注册测试用自定义字段（模拟插件注册）
    registerMetadataField('testRecordId', {
      type: 'string',
      check: (v) => typeof v === 'string',
    });
    registerMetadataField('testTranslation', {
      type: 'string',
      check: (v) => typeof v === 'string',
    });
  });

  afterEach(async () => {
    if (db) await db.close();
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  test('create 不传 path 时成功创建虚拟资源', async () => {
    const resource = await resourceService.create({
      type: 'vocabulary',
      name: 'serendipity',
      metadata: {
        testRecordId: 'tr_001',
        testTranslation: '偶然发现的珍品',
      },
    });

    expect(resource).not.toBeNull();
    expect(resource.rid).toMatch(/^res_/);
    expect(resource.type).toBe('vocabulary');
    expect(resource.name).toBe('serendipity');
    expect(resource.path).toBe(''); // 空字符串，不是 null/undefined
    expect(resource.hash).toBe(''); // 无文件无 hash
  });

  test('create 传空字符串 path 时也创建虚拟资源', async () => {
    const resource = await resourceService.create({
      type: 'vocabulary',
      path: '',
      name: 'test',
    });

    expect(resource).not.toBeNull();
    expect(resource.path).toBe('');
  });

  test('虚拟资源的 metadata 正确保存', async () => {
    const created = await resourceService.create({
      type: 'vocabulary',
      name: 'ephemeral',
      metadata: {
        testRecordId: 'tr_002',
        testTranslation: '短暂的',
      },
    });

    const retrieved = await resourceService.getByRid(created.rid);
    expect(retrieved).not.toBeNull();
    expect(retrieved.metadata.testRecordId).toBe('tr_002');
    expect(retrieved.metadata.testTranslation).toBe('短暂的');
  });

  test('虚拟资源可通过 name 查询', async () => {
    await resourceService.create({
      type: 'vocabulary',
      name: 'unique-virtual-word',
      metadata: { testRecordId: 'tr_003' },
    });

    const retrieved = await resourceService.getByName('unique-virtual-word');
    expect(retrieved).not.toBeNull();
    expect(retrieved.name).toBe('unique-virtual-word');
    expect(retrieved.path).toBe('');
  });

  test('虚拟资源不加密（encrypted 为 0）', async () => {
    const created = await resourceService.create({
      type: 'vocabulary',
      name: 'test-encrypted',
    });

    expect(created.encrypted).toBe(false);
  });

  test('有文件资源仍正常工作（回归测试）', async () => {
    const filePath = path.join(tempDir, 'resources', 'note.md');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, '# Note');

    const resource = await resourceService.create({
      type: 'note',
      path: filePath,
      name: 'note-test',
    });

    expect(resource).not.toBeNull();
    expect(resource.path).toBe(filePath);
    expect(resource.hash).not.toBe(''); // 有文件有 hash
  });
});
