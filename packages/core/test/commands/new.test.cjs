/**
 * new 命令测试
 *
 * new 命令创建新资源文件 resources/<date>-<slug>-<random>.md，
 * --template 时读取 templates/<name>.md.template 并替换 {{title}}/{{date}}，
 * 模板不存在时回退默认内容。
 */

const path = require('path');
const fs = require('fs-extra');
const { setupTempRepo, teardownTempRepo } = require('./commandTestHelper.cjs');
const DateUtils = require('../../src/utils/date.cjs');
const StringUtils = require('../../src/utils/string.cjs');
const newCommand = require('../../src/commands/new.cjs');

describe('new command', () => {
  let ctx;

  beforeEach(async () => {
    ctx = await setupTempRepo();
  });

  afterEach(async () => {
    await teardownTempRepo(ctx);
  });

  function resourcesDir() {
    return path.join(ctx.tempDir, 'resources');
  }

  async function findCreatedFile(title) {
    const date = DateUtils.today();
    const slug = StringUtils.slugify(title);
    const files = await fs.readdir(resourcesDir());
    return files.find(f => f.startsWith(`${date}-${slug}-`));
  }

  async function readCreatedContent(title) {
    const file = await findCreatedFile(title);
    expect(file).toBeDefined();
    return fs.readFile(path.join(resourcesDir(), file), 'utf-8');
  }

  test('无模板时创建默认内容', async () => {
    await newCommand({ _: ['lo'], name: 'My Note' });

    const content = await readCreatedContent('My Note');
    expect(content).toContain('# My Note');
    expect(content).toContain('开始写作');
  });

  test('--template 使用模板内容并替换 {{title}}/{{date}}', async () => {
    const templateContent = '# {{title}}\n\n写作于 {{date}}\n';
    await fs.ensureDir(path.join(ctx.tempDir, 'templates'));
    await fs.writeFile(
      path.join(ctx.tempDir, 'templates', 'daily.md.template'),
      templateContent
    );

    await newCommand({ _: ['lo'], name: 'Meeting Notes', template: 'daily' });

    const content = await readCreatedContent('Meeting Notes');
    expect(content).toBe(`# Meeting Notes\n\n写作于 ${DateUtils.today()}\n`);
  });

  test('--template 指向不存在的模板时回退默认内容', async () => {
    await newCommand({ _: ['lo'], name: 'Plain Note', template: 'does-not-exist' });

    const content = await readCreatedContent('Plain Note');
    expect(content).toContain('# Plain Note');
    expect(content).toContain('开始写作');
    expect(content).not.toContain('模板不存在');
  });
});
