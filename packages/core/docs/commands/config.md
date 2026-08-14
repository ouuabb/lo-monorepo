## config — 管理配置

**用法:** `lo config <list|add|rm> [key] [dir]`

管理仓库的配置项，支持列出所有配置、添加监控目录和移除配置项。

### 子命令

- `list` — 列出所有配置项
- `add <key>` — 添加配置项（如监控目录）
- `rm <key>` — 移除配置项

### 示例

```
lo config list                         # 查看配置
lo config add work ~/Documents/notes   # 添加监控目录
lo config rm work                      # 移除配置项
```

### 工作机制

- 配置存储于 `.note/config.json` 文件中
- 支持自定义默认分类: `lo config add category.defaultNote "名称"`
- 监控目录添加后可用于自动导入功能

### 注意事项

- 配置项变更立即生效，无需重启
- 配置格式为 key-value，key 不支持空格

### 相关命令

- lo new — 创建新资源（默认分类配置生效于此）
- lo docs — 参见 concepts 主题
