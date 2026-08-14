## edit — 编辑资源

**用法:** `lo edit <rid|文件路径> [--editor <编辑器>]`

使用编辑器打开资源文件进行编辑。

**加密文件处理流程:**
1. 解密文件到临时目录
2. 打开编辑器编辑临时文件
3. 编辑完成后重新加密并写回原文件
4. 自动调用 refresh() 更新数据库中的散列值和元数据（标题、字数等自动重新提取，标签/状态保留不变）

### 选项

| 选项 | 说明 |
|------|------|
| `--editor` | 指定编辑器命令（如 "code --wait"、"vim"），不指定则使用系统默认编辑器 |

### 示例

```bash
lo edit res_abc123                           # 使用默认编辑器
lo edit res_abc123 --editor "code --wait"    # 使用 VS Code
lo edit "resources/笔记.md" --editor vim     # 使用 vim
```

### 相关命令

- [show](./show.md) — 查看资源内容
