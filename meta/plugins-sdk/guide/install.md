# 安装到 lo 仓库

> lo 目前采用**仓库级插件目录**：每个 lo 仓库独立管理自己的插件集合（类似 git hooks 是仓库级而非全局）。
> 这点与 1.md §4.3 描述的 `~/.lo/plugins/`（全局目录）不同，但**设计更符合 lo 的定位：每个知识仓库通常要加载不同领域插件（写代码的 Git 仓库要 git 插件；写阅读笔记要 EPUB 插件，不会同时需要）。

---

## 目录结构

每个 lo 仓库：

```
your-lo-repo/
  .repo/
    plugins/
      epub/                      ← 一个插件 = 一个目录
        plugin.json              ← manifest：id/name/version/main/dependencies
        index.js                 ← 入口：export Plugin 子类
        package.json             ← （可选）如需要 3rd party deps
        node_modules/            ← （可选）npm i 后
      git-connector/
        plugin.json
        index.js
      ...
```

---

## plugin.json 字段

```json
{
  "id": "epub",
  "name": "EPUB Adapter",
  "version": "0.1.0",
  "description": "解析 EPUB 文件为 Book/Chapter/Annotation",
  "role": "adapter",
  "main": "index.js",
  "dependencies": ["base-resources? optional"],
  "contributes": {
    "resourceTypes": {
      "epub": { "extractMetadata": "builtIn" }
    },
    "commands": {
      "epub-import": { "description": "导入 EPUB" }
    }
  }
}
```

注意：
- `id` 必须全仓库唯一，且必须与目录名一致
- `dependencies`：若声明，lo 会按拓扑排序启用（先启用依赖再自己）
- `contributes`：声明式扩展点；等价于插件 register() 内代码注册，但更易读

---

## 命令控制

```bash
# 查看已加载插件
lo plugin list

# 启用/停用/重载
lo plugin enable epub
lo plugin disable epub
lo plugin reload epub

# 详情（看到 manifest + 注册的扩展点）
lo plugin info epub

# 运行扩展命令
lo ext epub-import ./book.epub
lo ext --list         # 列出所有扩展命令
```

> 未来 Plugin Repository 上线后，会支持 `lo plugin install <id>` 从分发仓库自动下载。
