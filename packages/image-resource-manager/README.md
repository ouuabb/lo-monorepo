# @lo/image-resource-manager

图片 Resource 管理（渲染端独立包）。收敛 lo-agent 图片采集 / 导入 / 列表 / 预览 /
插入 / 删除，从宿主 App 中抽出为独立 workspace 包，功能与接线契约不变。

## 内容

| 文件 | 职责 |
|---|---|
| `src/imageUtils.mjs` | 纯工具（SUPPORTED_MIMES / mimeExt / base64ToUint8 / formatSize / altFromFilename） |
| `src/imageImport.mjs` | `collectImageFiles` 三入口归一（paste / drop / file-select） |
| `src/imageApi.mjs` | `createImageApi` 数据访问层（list / importImage / getBinary / remove） |
| `src/ImageManager.jsx` | Manager UI（导入 / 列表 / 缩略图 / 预览 / 插入 / 删除） |
| `src/ImagePreviewModal.jsx` | 大图预览遮罩 |
| `src/image-manager.css` | 组件样式（依赖宿主 `:root` 设计 token） |
| `types/index.d.ts` | 类型声明 |

## 依赖与边界

- **React 为 peer**（宿主提供）；本包不声明运行时依赖，不依赖宿主内部文件。
- **loCore 门面由宿主注入**：`createImageApi(getLoCore)` 默认取
  `window.loAgent.loCore`（preload 门面），可注入以便单测。
- 数据访问链：`imageApi → loCore → @lo/client → Core`；**不直接访问 Core HTTP /
  数据库**，不内嵌 `@lo/client`。
- 样式使用宿主 `:root` 提供的设计 token（`--muted` / `--border-strong` / `--panel` /
  `--bg` / `--text` / `--border` / `--accent`）；本包不定义主题。

## 使用（宿主）

```jsx
import ImageManager from '@lo/image-resource-manager';

<ImageManager onInsert={handleInsertImageToActiveEditor} />
```

插入回调契约为三位置参数 `onInsert(rid, alt, filename)`（与 NoteEditor.insertImage
`![alt](res_xxx)` 契约一致，见 meta `markdown-image-relations.md`）。

## 命令

```bash
pnpm --filter @lo/image-resource-manager test    # Jest（--experimental-vm-modules）
pnpm --filter @lo/image-resource-manager lint
pnpm --filter @lo/image-resource-manager format
```