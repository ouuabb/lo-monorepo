const path = require('path');
const crypto = require('crypto');
const fs = require('fs-extra');
const Logger = require('../utils/logger.cjs');
const StringUtils = require('../utils/string.cjs');
const DateUtils = require('../utils/date.cjs');
const CryptoUtils = require('../utils/crypto.cjs');
const Repository = require('../repo/repository.cjs');

module.exports = async function newResource(argv) {
  const { name, type = 'note', tags, category, encrypt, template } = argv;

  try {
    // 018 §3：candidate = 外部输入（name 参数），由 createResource 统一 normalize
    const slug = StringUtils.slugify(name);
    const date = DateUtils.today();

    const repo = new Repository(process.cwd());
    await repo.open({ skipAuth: true });

    // 校验名称全局唯一，同名时自动入栈（layer >= 1）
    const activeByName = await repo.resourceService.getByName(slug);
    if (activeByName) {
      Logger.warn(`资源名称 "${slug}" 已存在活跃层（rid: ${activeByName.rid}），新文件将在提交时自动入栈。`);
      Logger.info('提示: 使用 lo stack list 查看栈中资源，lo stack promote <rid> 可提升为活跃层。');
    }

    // 文件名含随机后缀，保证磁盘层面永无冲突
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const filename = `${date}-${slug}-${randomSuffix}.md`;

    // 构建元数据
    const metadata = {
      ...(tags ? { tags: Array.isArray(tags) ? tags : tags.split(/[,，]/).map(s => s.trim()) } : {}),
      ...(category ? { category } : {})
    };

    // 内容：--template 指定时读取 templates/<name>.md.template，否则使用默认内容
    let content = `# ${name}\n\n开始写作...\n`;
    if (template) {
      const templatePath = path.join(process.cwd(), 'templates', `${template}.md.template`);
      if (await fs.pathExists(templatePath)) {
        content = (await fs.readFile(templatePath, 'utf-8'))
          .replace(/\{\{\s*title\s*\}\}/g, name)
          .replace(/\{\{\s*date\s*\}\}/g, date);
        Logger.info(`使用模板: templates/${template}.md.template`);
      } else {
        Logger.warn(`模板不存在: templates/${template}.md.template，使用默认内容`);
      }
    }

    const filePath = path.join(process.cwd(), 'resources', filename);
    await fs.ensureDir(path.dirname(filePath));

    // 决定是否加密：--encrypt 显式指定 > 仓库默认策略
    const shouldEncrypt = encrypt === true || repo.isEncryptByDefault;
    const cryptoKey = repo.cryptoKey;
    const encryptionEnabled = CryptoUtils.isEncryptionEnabled(process.cwd());

    let resource;
    // 018 §3：candidate = 外部输入（name 参数），createResource 统一 normalize
    if (encrypt === true && cryptoKey) {
      // 显式 --encrypt（密钥可用）：统一走 createResource({ encrypt: true })
      // → resource.create operation（P4-1），内部加密写入 + 自动 encrypted 标志
      resource = await repo.createResource(type, content, {
        filename,
        metadata,
        encrypt: true,
        name,
      });
    } else {
      if (encrypt && !cryptoKey) {
        Logger.error('无法加密：加密密钥未加载。请确认仓库已初始化加密或已完成 SSH 认证。');
        Logger.info(`文件将以明文创建: ${filename}`);
      } else if (shouldEncrypt && !cryptoKey && encryptionEnabled) {
        Logger.warn('仓库启用了加密但无法获取密钥。请确保已通过 SSH 认证。');
        Logger.info(`文件将在认证后通过 lo sync 加密`);
      }
      resource = await repo.createResource(type, content, {
        filename,
        metadata,
        name,
      });
    }

    await repo.close();

    Logger.success(`资源已创建: ${resource.rid}`);
    Logger.info('名称:', name);
    Logger.info('类型:', type);
    if (metadata.category) Logger.info('分类:', metadata.category);
    Logger.info('位置:', filePath);

    process.exit(0);

  } catch (error) {
    Logger.error(`创建失败: ${error.message}`);
    process.exit(1);
  }
};
