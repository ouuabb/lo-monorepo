/**
 * @lo/image-resource-manager —— 图片 Resource 管理（渲染端独立包）
 *
 * 收敛 lo-agent Image Resource Manager 的采集 / 导入 / 列表 / 预览 / 插入 / 删除：
 *   - imageUtils / imageImport：纯函数（浏览器环境，无 Node Buffer）
 *   - imageApi：数据访问层（loCore 门面 DI，宿主注入）
 *   - ImageManager / ImagePreviewModal：React UI 组件（React 为 peer，宿主提供）
 *
 * 数据访问一律经 imageApi → loCore（preload 门面）→ @lo/client → Core；
 * 不直接访问 Core HTTP / 数据库；不内嵌 @lo/client。
 *
 * 样式：本包提供 `image-manager.css`，由宿主显式导入
 * （`import '@lo/image-resource-manager/image-manager.css'`）；
 * 依赖宿主在 `:root` 提供的设计 token（--muted / --border-strong / --panel /
 * --bg / --text / --border / --accent）。
 */
export { SUPPORTED_MIMES, mimeExt, base64ToUint8, formatSize, altFromFilename } from './imageUtils.mjs';
export { collectImageFiles } from './imageImport.mjs';
export { createImageApi } from './imageApi.mjs';
export { default as ImageManager } from './ImageManager.jsx';
export { default as ImagePreviewModal } from './ImagePreviewModal.jsx';
export { default } from './ImageManager.jsx';