/**
 * viewerRegistry.js —— Agent 侧 Viewer 渲染注册表（U2/U3）
 *
 * 根据 session.viewerId 选择 renderer；内置注册表 + 插件贡献合并（U3）：
 *   内置 Viewer → React 组件直接渲染；
 *   插件 Viewer（manifest contributes.viewers / ctx.extensions.registerViewer）
 *   → 经 agent-plugins:render-viewer 渲染桥（HTML 快照，同 editors 模型）。
 * Viewer 自行声明 supports.modes（与 Core 双向解耦）。
 */
import NoteEditor from '../editor/NoteEditor.jsx';
import MarkdownPreview from '../components/MarkdownPreview.jsx';

const VIEWERS = {
  'viewer.markdown-editor': {
    component: NoteEditor,
    // 编辑 Mode（writable）：交互式 Markdown 编辑
  },
  'viewer.generic-preview': {
    component: NoteEditor,
    // 通用只读呈现：只读 Monaco
    readOnly: true,
  },
  'viewer.markdown-preview': {
    component: MarkdownPreview,
    // Markdown 只读预览：含 RID-embed 图片渲染（极简内联解析）
    readOnly: true,
  },
};

/**
 * 解析 viewerId → 渲染描述
 * 内置：{ component, readOnly? }；插件：{ plugin: { viewerId, label, pluginId } }；未注册：null
 * @param {string} viewerId
 * @param {Array<{ viewerId: string, label: string, pluginId: string }>} [pluginViewers]
 */
export function resolveViewerComponent(viewerId, pluginViewers = []) {
  if (!viewerId) return null;
  if (VIEWERS[viewerId]) return VIEWERS[viewerId];
  const plugin = (pluginViewers || []).find((v) => v.viewerId === viewerId);
  if (plugin) return { plugin };
  return null;
}
