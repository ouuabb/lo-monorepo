/**
 * 插件清单 — 声明插件元信息、依赖和扩展点
 *
 * resourceTypes: epub — EPUB 书籍资源类型
 * relationTypes: source-of — EPUB 与笔记/标注的来源关系
 * importers — lo import *.epub 时自动创建 epub Resource
 * commands — lo ext epub:read / epub:note / epub:highlight 等
 */
module.exports = {
  id: 'epub-reader',
  name: 'EPUB 阅读',
  version: '0.1.0',
  description: '为 EPUB 文件提供阅读、标注和笔记能力',
  author: 'lo Project',
  role: 'discovery',

  loVersion: '>=0.1.0',

  // 插件配置 schema
  config: {
    dataDir: {
      type: 'string',
      description: '阅读状态与标注数据存储目录（相对于 lo 仓库根目录）',
      default: '.lo/plugins/epub-reader',
    },
  },

  // 声明使用的扩展点
  extensions: [
    'resourceTypes',
    'relationTypes',
    'importers',
    'commands',
  ],

  // 声明式扩展点注册
  contributes: {
    // 注册 epub 资源类型及其 metadata 字段
    resourceTypes: [
      {
        type: 'epub',
        extensions: ['.epub'],
        metadataSchema: {
          title:          { type: 'string' },  // 书名
          author:         { type: 'string' },  // 作者
          publisher:      { type: 'string' },  // 出版社
          language:       { type: 'string' },  // 语言
          coverPath:      { type: 'string' },  // 封面图路径（提取到 .lo/plugins/epub-reader/covers/）
          spineCount:     { type: 'number' },  // 章节数量
          chapterTitles:  { type: 'array' },   // 章节标题列表
        },
      },
      {
        // 阅读笔记元数据字段（create/update 时 Core 按类型校验）
        type: 'note',
        metadataSchema: {
          sourceResource: { type: 'string' },  // 来源 EPUB Resource rid
          location:       { type: 'string' },  // 原文位置（CFI）
          quote:          { type: 'string' },  // 引用原文
          content:        { type: 'string' },  // 笔记内容
        },
      },
    ],

    // 注册来源关系类型：EPUB Resource → 笔记 Resource
    relationTypes: [
      {
        type: 'source-of',
        description: 'EPUB 来源关系：书籍是笔记的来源',
      },
    ],
  },
};
