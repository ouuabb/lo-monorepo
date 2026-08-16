/**
 * viewerRegistry.js —— Agent 侧 Viewer 渲染注册表（U2）
 *
 * 根据 session.viewerId 选择 renderer；builtin 注册表（U3 起插件可扩展）。
 * Viewer 自行声明 supports.modes（与 Core 双向解耦）；组件按 viewer 语义渲染。
 */
import NoteEditor from '../editor/NoteEditor.jsx';

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
};

/**
 * 解析 viewerId → { component, readOnly? }；未注册返回 null（由调用方处理）
 * @param {string} viewerId
 */
export function resolveViewerComponent(viewerId) {
  if (!viewerId) return null;
  return VIEWERS[viewerId] || null;
}
