/**
 * 插件清单 — EPUB 书库展示插件
 *
 * 只读插件：通过 commands 扩展点注册 HTTP 端点，查询 lo 仓库的 epub Resource 并渲染 3D 书架页面。
 * 不注册 resourceTypes / importers / resourceProviders — 不干涉 lo 核心流程。
 */
module.exports = {
  id: 'epub-library',
  name: 'EPUB 书库',
  version: '0.1.0',
  description: '3D 书库展示插件，读取 lo 仓库中的 EPUB 资源并渲染为实体书架',
  author: 'lo Project',
  role: 'general',

  loVersion: '>=0.1.0',

  extensions: [
    'commands',
  ],

  contributes: {},
};
