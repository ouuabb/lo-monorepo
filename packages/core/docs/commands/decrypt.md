## decrypt — 解密资源

**用法:** `lo decrypt <rid> | lo decrypt --all`

将加密的资源文件解密为明文 Markdown 保存到磁盘。

### 选项

| 选项 | 说明 |
|------|------|
| `<rid>` | 资源 RID（解密单个文件） |
| `--all` | 解密所有已加密的文件 |

### 示例

```bash
lo decrypt res_abc123         # 解密指定资源
lo decrypt --all              # 批量解密所有密文文件
```

### 工作原理

1. 读取指定资源的 LOEC 加密格式内容
2. 使用仓库的 RepoKey 进行 AES-256-GCM 解密
3. 将解密后的明文内容覆写原文件
4. 更新数据库中 `encrypted` 标记为 0

解密后文件恢复为普通 Markdown 格式，可直接用任意编辑器打开编辑。

### 典型使用场景

| 场景 | 操作 |
|------|------|
| 需要直接编辑加密笔记 | `lo decrypt res_xxx` → 用 VS Code 打开编辑 |
| 取消全仓库加密 | `lo decrypt --all` → 所有文件恢复明文 |
| 分享笔记给他人 | 解密后文件可正常传输和阅读 |
| 临时调试/检查 | 解密查看原始内容后可用 `lo encrypt <rid>` 重新加密 |

### 注意事项

- 解密需要仓库的 RepoKey 可用（已生成密钥且完成认证）
- 如果已绑定 SSH 密钥保护，需先通过认证才能解密
- 已是明文的文件重复执行 `lo decrypt` 会跳过
- 解密不影响已建立的关系（wikilink、标签等）

### 相关命令

- [encrypt](./encrypt.md) — 加密资源
- [edit](./edit.md) — 编辑资源（自动处理加解密）
- [show](./show.md) — 查看资源内容
- [init](./init.md) — 初始化仓库
