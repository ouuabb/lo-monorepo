/**
 * EPUB 阅读插件 — 入口
 *
 * 能力：
 *   ① importers — lo import *.epub 自动创建 epub Resource
 *   ② commands — lo ext epub:read/note/highlight/bookmark 等
 *   ③ resourceTypes — 注册 epub 类型
 *   ④ relationTypes — 注册 source-of 关系（EPUB → 笔记）
 */
const EpubReaderPlugin = require('./plugin.cjs');

module.exports = EpubReaderPlugin;
