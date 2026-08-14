# 状态与资源

登录成功后，工作台会并行拉取仓库状态与资源列表。

## 仓库状态

- 来源：`loCore.getStatus()` → `LoCoreService.getStatus()` → `@lo/client` 的 `health.stats()`。
- 对应 serve `GET /api/stats`，返回资源数、关系数等统计。
- 前端展示为 JSON（`JSON.stringify` 美化输出）。

## 资源列表

- 来源：`loCore.listNotes({ limit: 50 })` → `client.notes.list()`。
- 对应 serve `GET /api/notes?limit=50`。
- 返回 `{ ok: true, total, data }`；前端渲染 `data` 中每条：
  - `rid`：不可变资源 ID
  - 标题：`metadata.title ?? name`
  - `type`：资源类型

## 刷新

- 「刷新状态与资源」再次并行调用上面两个接口，覆盖旧数据。
- 未登录或未配置时，两个调用会返回 `{ ok: false, error: 'unknown', message: '请先配置仓库地址(configure)' }`。

## 空态

- 状态未获取时显示「尚未获取。请先登录。」
- 资源为空时显示「暂无资源。」