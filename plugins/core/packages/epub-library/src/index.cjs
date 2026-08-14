/**
 * EPUB 书库插件 — 入口
 *
 * 只读展示插件：读取 lo 仓库的 epub Resource，渲染 3D 书架页面。
 * 不注册任何 resourceTypes / importers / resourceProviders，不干涉 lo 核心流程。
 */
const EpubLibraryPlugin = require('./plugin.cjs');

module.exports = EpubLibraryPlugin;
