## encrypt — 加密资源

**用法:** `lo encrypt <rid> | lo encrypt --all`

将资源文件用 AES-256-GCM 加密为 LOEC 格式保存到磁盘。

### 选项

| 选项 | 说明 |
|------|------|
| `<rid>` | 资源 RID（加密单个文件） |
| `--all` | 加密所有未加密的文件 |

### 示例

```bash
lo encrypt res_abc123         # 加密指定资源
lo encrypt --all              # 批量加密所有明文文件
```

### 工作原理

1. 读取指定资源的明文内容
2. 使用仓库的 RepoKey 进行 AES-256-GCM 加密
3. 将加密后的 LOEC 格式数据覆写原文件
4. 更新数据库中 `encrypted` 标记为 1

加密后的文件将以 LOEC 二进制格式存储，无法直接阅读或编辑。需要用 `lo edit`、`lo show` 或 `lo decrypt` 才能解密查看。

### 加密模式说明

lo 提供三种加密粒度：

| 粒度 | 方式 | 效果 |
|------|------|------|
| 单文件按需 | `lo new --encrypt` / `lo encrypt <rid>` | 仅加密指定文件 |
| 全量批量 | `lo encrypt --all` | 一次性加密所有明文文件 |
| 全仓库默认 | `lo init --encrypt` | 所有新文件自动加密 |

### 注意事项

- 加密需要仓库已生成加密密钥（`lo init` 时自动生成）
- 如果已绑定 SSH 密钥保护，需完成认证后才能加密
- 已加密的文件再次执行 `lo encrypt` 会跳过，不重复操作
- 加密不影响已建立的关系（wikilink、标签等）

### 相关命令

- [decrypt](./decrypt.md) — 解密资源
- [new](./new.md) — 创建新资源（支持 --encrypt）
- [init](./init.md) — 初始化仓库（支持 --encrypt）
- [auth](./auth.md) — SSH 密钥认证
