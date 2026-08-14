## show — 查看资源内容

**用法:** `lo show <rid|name|文件路径> [--raw]`

显示资源的详细信息和解密后的内容。

**三级查找:** rid 精确匹配 > name 查找活跃层 > path 降级匹配。按 name 查找时只返回活跃层（layer=0），栈中资源需通过 rid 访问。

- **RID:** 资源唯一标识符（如 res_abc123_xxxxxxxx），可通过 lo list 获取
- **name:** 资源逻辑名称，全局唯一（活跃层）
- **路径:** 支持绝对路径或相对于仓库根目录的路径
- **加密文件:** 自动解密后显示明文内容

### 选项

| 选项 | 说明 |
|------|------|
| `--raw` | 显示原始文件内容（加密文件显示 LOEC 密文） |

### 示例

```bash
lo show res_abc123                               # 按 RID 查看
lo show 笔记测试                                  # 按 name 查看
lo show "resources/2024-01-01-笔记.md"            # 按路径查看
lo show res_abc123 --raw                          # 查看原始内容
```

### 相关命令

- [edit](./edit.md) — 编辑资源
