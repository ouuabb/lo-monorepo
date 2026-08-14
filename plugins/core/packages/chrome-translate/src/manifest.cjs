/**
 * 插件清单 — 声明插件元信息、依赖和扩展点
 */
module.exports = {
  id: 'chrome-translate',
  name: 'Chrome 划词翻译',
  version: '0.1.0',
  description: '同步 Chrome 划词翻译记录到 lo 仓库',
  author: 'lo Project',
  role: 'discovery',

  // 依赖的 lo 版本
  loVersion: '>=0.1.0',

  // 插件配置 schema（用户可配置）
  config: {
    exportFilePath: {
      type: 'string',
      description: 'Chrome 扩展导出的翻译记录文件路径',
      default: '',
    },
    autoDiscover: {
      type: 'boolean',
      description: '是否自动定期 discover 校验',
      default: false,
    },
  },

  // 声明使用的扩展点
  extensions: [
    'resourceProviders',
    'commands',
  ],

  // 声明式扩展点注册
  contributes: {
    // 注册 vocabulary 资源类型及其自定义 metadata 字段
    // PluginManager 激活时会把这些字段注册到 validateMetadata 的 EXTRA_FIELDS
    resourceTypes: [
      {
        type: 'vocabulary',
        metadataSchema: {
          recordId:    { type: 'string' }, // 翻译记录唯一 ID（去重用）
          original:    { type: 'string' }, // 原文（选中词/短语）
          translation: { type: 'string' }, // 译文
          sourceLang:  { type: 'string' }, // 源语言
          targetLang:  { type: 'string' }, // 目标语言
          context:     { type: 'string' }, // 选中词所在的句子
          url:         { type: 'string' }, // 页面 URL
          pageTitle:   { type: 'string' }, // 页面标题
          timestamp:   { type: 'string' }, // 翻译时间 ISO 8601
        },
      },
    ],
  },
};
