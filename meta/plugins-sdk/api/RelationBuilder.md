# RelationBuilder

链式构造 RelationCandidate。

```js
const { RelationBuilder } = require('@lo/plugins-sdk');

// 书籍包含章节（假设 bookRid / chapterRid 已存在）
await ctx.relations.create(
  RelationBuilder
    .contains(bookRid, chapterRid)
    .meta('order', 1)
    .build()
);

// 笔记引用图片
await ctx.relations.create(
  RelationBuilder.references(noteRid, imageRid).build()
);
```

---

## 便捷工厂

| 方法 | type | 说明 |
|------|------|------|
| `contains(fromRid, toRid)` | `contains` | 容器包含成员（书包含章节、集合包含笔记） |
| `link(fromRid, toRid)` | `link` | 双向链接（MD wiki-links 产生） |
| `references(fromRid, toRid)` | `references` | 引用（MD 引用图片/文档） |
| `depends(fromRid, toRid)` | `depends` | 依赖关系 |

---

## 链式 setter

| 方法 | 说明 |
|------|------|
| `.from(rid)` | 设置起始 rid（`res_xxx`） |
| `.to(rid)` | 设置目标 rid（`res_xxx`） |
| `.type(t)` | 设置关系类型字符串（可自定义） |
| `.meta(k, v)` | 设置 metadata 字段 |
| `.metas(obj)` | 批量设置 metadata |

---

## 构建

`.build()` 返回：
```ts
{
  from_rid: string;
  to_rid: string;
  type: string;
  metadata?: Record<string, unknown>;
}
```

缺失 from_rid / to_rid / type 会抛错。
