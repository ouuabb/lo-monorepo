## init — 初始化资源仓库

**用法:** `lo init [name] [--path <路径>] [--encrypt]`

在指定目录创建资源仓库结构。

执行 lo init 后会:
1. 创建 resources/ 资源目录
2. 创建 .repo/ 仓库元数据目录
3. 初始化 SQLite 数据库（database.sqlite）
4. 初始化暂存区（staging_changes 表）
5. 生成 AES-256-GCM 加密密钥（.repo/keys/repo.key）
6. 创建 templates/ 目录并预置 default / daily 两个模板
7. 生成 .gitignore

**加密模式**: 默认明文，文件可直接编辑。使用 `--encrypt` 开启全仓库加密。

### 选项

| 选项 | 说明 |
|------|------|
| `[name]` | 位置参数：仓库文件夹名称或路径（绝对路径直接用；相对路径拼接到 `--path` 下） |
| `--path` | 仓库根目录路径（默认: 当前工作目录） |
| `--encrypt` | 启用全仓库加密，所有文件落盘即 LOEC 密文（默认: false） |

### 示例

```bash
lo init                     # 明文仓库，文件可直接编辑
lo init --encrypt           # 加密仓库，所有文件自动加密
lo init --path ~/notes      # 在指定目录初始化
lo init mynotes             # 在当前目录下创建 mynotes/ 子目录仓库
lo init ~/notes             # 在绝对路径初始化
```

### 注意事项

- 加密密钥始终生成，无需加密时不会自动加密文件
- 明文仓库中可随时用 `lo encrypt <rid>` 加密单个文件，用 `lo decrypt <rid>` 解密
- 用 `lo encrypt --all` 可将明文仓库整体转为加密模式
- 生成的加密密钥权限为 0o600（仅所有者可读写）
- 密钥以明文存储时，建议运行 `lo auth add` 绑定 SSH 密钥保护

### 相关命令

- [new](./new.md) — 创建新资源
- [encrypt](./encrypt.md) — 加密资源
- [decrypt](./decrypt.md) — 解密资源
- [auth](./auth.md) — 绑定 SSH 密钥保护加密密钥
- [config](./config.md) — 管理仓库配置
