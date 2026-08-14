## create resource — 创建容器资源

**用法:** `lo create resource <type> <path> [--name <名称>] [--no-scan]`

创建具有 Container Capability 的 Resource 实体。

Resource 是独立的一等公民实体，拥有唯一 RID、类型 (type)、能力列表 (capabilities) 和容器规则 (container_schema)。每个 Resource 可以绑定一个或多个 Content Source（内容来源），Content Source 可以是本地目录、Git 仓库等多种形式。

### Container Capability

具有 container 能力的 Resource 可以管理成员。创建时会自动扫描 Content Source 目录中的文件，将其作为 File Member 添加到容器的 container_members 中。

### 支持的资源类型

| 类型 | 说明 | 允许的成员类型 |
|------|------|---------------|
| `project` | 项目（代码、文档混合） | note, document, image, code, json, yaml, xml, csv, text |
| `album` | 相册 | image, video |
| `dataset` | 数据集 | csv, json, yaml, xml |
| `course` | 课程 | note, video, audio, document, image, pdf |
| `collection` | 集合 | 无限制 |

### 自动行为

- 根据 type 自动推导 capabilities 和 container_schema
- 自动绑定指定的 Content Source 目录
- 如果具有 container 能力，自动扫描目录中的文件为成员

### 选项

| 选项 | 说明 |
|------|------|
| `--name` | 资源名称（默认使用目录名） |
| `--no-scan` | 跳过自动扫描成员（仅绑定 Content Source） |

### 示例

```
lo create resource project ./fastapi-demo              # 创建项目
lo create resource album ./photos --name "旅行照片"     # 创建相册
lo create resource dataset ./data --no-scan            # 创建数据集（不扫描）
lo create resource course ./python-101                 # 创建课程
```

### 相关命令

- [container](container.md) — 容器管理命令集
- lo docs resource-container
