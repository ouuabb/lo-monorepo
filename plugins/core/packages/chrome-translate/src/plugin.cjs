/**
 * ChromeTranslatePlugin — 划词翻译插件主类
 *
 * 继承 ResourceProvider，实现双通道同步：
 *   ① discover()  — 从导出文件全量读取，校验补录
 *   ② HTTP 端点   — 注册 commands 扩展点，接收实时推送
 *
 * Resource 模型：
 *   type:     vocabulary
 *   name:     原文（选中词/短语）
 *   metadata:
 *     recordId:     唯一记录 ID（去重用）
 *     original:     原文
 *     translation:  译文
 *     sourceLang:   源语言
 *     targetLang:   目标语言
 *     context:      上下文（选中词所在的句子）
 *     url:          页面 URL
 *     pageTitle:    页面标题
 *     timestamp:    翻译时间 ISO 8601
 */

const { ResourceProvider, ResourceBuilder } = require('@lo/plugins-sdk');
const fsp = require('fs/promises');
const nativeFs = require('fs');
const path = require('path');
const manifest = require('./manifest.cjs');

// 内置 fs 工具，避免外部依赖（插件分发时不依赖 fs-extra）
const fs = {
  pathExists: (p) => fsp.access(p).then(() => true).catch(() => false),
  readFile: fsp.readFile,
  ensureDir: (p) => fsp.mkdir(p, { recursive: true }),
};

class ChromeTranslatePlugin extends ResourceProvider {
  // ── 生命周期 ──

  manifest() {
    return manifest;
  }

  register(context) {
    // 获取配置
    const config = context.config() || {};
    this._exportFilePath = config.exportFilePath || '';

    // ① 注册 ResourceProvider 扩展点（父类自动注册）
    super.register(context);

    // ② 注册 commands 扩展点（HTTP 端点）
    const extRegistry = context.extensions;
    if (extRegistry && typeof extRegistry.register === 'function') {
      extRegistry.register(manifest.id, 'commands', 'chrome-translate:receive', {
        method: 'POST',
        path: '/api/plugins/chrome-translate/records',
        handler: this._handleHttpPost.bind(this),
        description: '接收 Chrome 扩展推送的翻译记录',
      });
    }
  }

  // ── 通道①：ResourceProvider discover（文件发现 + 全量校验）──

  /**
   * 从导出文件读取翻译记录，转换为 Resource 候选
   * 去重：跳过已存在 recordId 的记录
   */
  async discover(ctx, source) {
    const filePath = source || this._exportFilePath;
    if (!filePath) {
      throw new Error('未配置导出文件路径，请在插件配置中设置 exportFilePath');
    }

    if (!await fs.pathExists(filePath)) {
      ctx.logger.info(`[chrome-translate] 导出文件不存在: ${filePath}`);
      return [];
    }

    // 读取导出文件
    const raw = await fs.readFile(filePath, 'utf-8');
    let records;
    try {
      records = JSON.parse(raw);
    } catch (e) {
      throw new Error(`导出文件解析失败: ${e.message}`);
    }

    if (!Array.isArray(records)) {
      records = [records];
    }

    ctx.logger.info(`[chrome-translate] 读取到 ${records.length} 条翻译记录`);

    // 去重：查询已有 Resource 中的 recordId
    const existing = await this._getExistingRecordIds(ctx);
    const unsynced = records.filter(r => r.recordId && !existing.has(r.recordId));

    ctx.logger.info(
      `[chrome-translate] 去重后 ${unsynced.length} 条需要创建` +
      `（已有 ${existing.size} 条，跳过 ${records.length - unsynced.length} 条）`
    );

    // 转换为 Resource 候选
    return unsynced.map(record => this._recordToCandidate(record));
  }

  supports(source) {
    // source 是文件路径，且以 .json 结尾
    if (!source) return false;
    return source.endsWith('.json');
  }

  // ── 通道③：增量监听（可选，文件变化时自动 discover）──

  /**
   * 监听导出文件变化，自动触发 discover 补录
   *
   * 使用 Node.js 内置 fs.watch（无外部依赖）。
   * 防抖 500ms，避免文件写入触发多次事件。
   *
   * @param {string} source — 导出文件路径
   * @param {Function} onChange — (candidates[]) => void，新候选回调
   * @returns {Promise<Function>} 停止监听的 dispose 函数
   */
  async watch(source, onChange) {
    const filePath = source || this._exportFilePath;
    if (!filePath) {
      throw new Error('未配置导出文件路径，无法 watch');
    }

    const ctx = this._context;
    let debounceTimer = null;

    // Node.js 内置 fs.watch 监听文件变化
    const watcher = nativeFs.watch(filePath, { persistent: false }, (eventType) => {
      if (eventType !== 'change') return;

      // 防抖：文件写入可能触发多次 change 事件
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const candidates = await this.discover(ctx, filePath);
          if (candidates.length > 0) {
            onChange(candidates);
          }
        } catch (e) {
          ctx.logger.error(`[chrome-translate] watch discover 失败: ${e.message}`);
        }
      }, 500);
    });

    watcher.on('error', (e) => {
      ctx.logger.error(`[chrome-translate] watch 错误: ${e.message}`);
    });

    ctx.logger.info(`[chrome-translate] 开始监听: ${filePath}`);

    // 返回停止函数
    return () => {
      clearTimeout(debounceTimer);
      watcher.close();
      ctx.logger.info(`[chrome-translate] 停止监听: ${filePath}`);
    };
  }

  // ── 通道②：HTTP 端点（实时推送）──

  /**
   * 处理 Chrome 扩展的 HTTP POST 请求
   * @param {object} req — { body: TranslationRecord | TranslationRecord[] }
   * @param {object} res — 响应对象
   */
  async _handleHttpPost(req, res) {
    try {
      const records = Array.isArray(req.body) ? req.body : [req.body];

      // 校验记录格式
      const valid = records.filter(r => r && r.original && r.translation);
      if (valid.length === 0) {
        return res.status(400).json({ error: '记录格式无效，需包含 original 和 translation' });
      }

      // 去重：查询已有 recordId
      const ctx = this._context;
      const existing = await this._getExistingRecordIds(ctx);
      const unsynced = valid.filter(r => r.recordId && !existing.has(r.recordId));

      // 创建 Resource
      const created = [];
      for (const record of unsynced) {
        const candidate = this._recordToCandidate(record);
        const resource = await ctx.resources.create(candidate);
        created.push({ rid: resource.rid, recordId: record.recordId });
      }

      ctx.logger.info(
        `[chrome-translate] HTTP 推送: 收到 ${records.length} 条, ` +
        `创建 ${created.length} 条, 跳过 ${records.length - created.length} 条`
      );

      res.json({
        ok: true,
        created: created.length,
        skipped: records.length - created.length,
        resources: created,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }

  // ── 内部方法 ──

  /**
   * 获取已存在的 recordId 集合
   * 通过 resources Facade 查询所有 vocabulary 资源
   */
  async _getExistingRecordIds(ctx) {
    const existing = new Set();
    try {
      const resources = await ctx.resources.list({ type: 'vocabulary' });
      for (const r of resources) {
        if (r.metadata && r.metadata.recordId) {
          existing.add(r.metadata.recordId);
        }
      }
    } catch (e) {
      // 查询失败不阻塞，返回空集合（会创建所有记录）
      ctx.logger.error(`[chrome-translate] 查询已有记录失败: ${e.message}`);
    }
    return existing;
  }

  /**
   * 将翻译记录转换为 Resource 候选对象
   * @param {object} record — 翻译记录
   * @returns {object} Resource 候选
   */
  _recordToCandidate(record) {
    const builder = ResourceBuilder.of('vocabulary');

    // 必填字段
    builder.name(record.original);

    // 元数据
    builder.meta('recordId', record.recordId);
    builder.meta('original', record.original);
    builder.meta('translation', record.translation);

    if (record.sourceLang) builder.meta('sourceLang', record.sourceLang);
    if (record.targetLang) builder.meta('targetLang', record.targetLang);
    if (record.context) builder.meta('context', record.context);
    if (record.url) builder.meta('url', record.url);
    if (record.pageTitle) builder.meta('pageTitle', record.pageTitle);
    if (record.timestamp) builder.meta('timestamp', record.timestamp);

    // 标签
    const tags = [];
    if (record.sourceLang) tags.push(`lang:${record.sourceLang}`);
    if (record.targetLang) tags.push(`lang:${record.targetLang}`);
    if (tags.length > 0) builder.tags(tags);

    return builder.build();
  }
}

module.exports = ChromeTranslatePlugin;
