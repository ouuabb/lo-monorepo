const Logger = require("../utils/logger.cjs");
const Repository = require("../repo/repository.cjs");

/**
 * 构建分类树
 * @param {string[]} categoryPaths - 所有分类路径（"/" 分隔）
 * @returns {Object} 树形结构
 */
function buildTree(categoryPaths) {
  const tree = {};
  for (const cat of categoryPaths) {
    if (!cat || !cat.trim()) {
      const key = "(未分类)";
      if (!tree[key]) tree[key] = {};
      continue;
    }
    const parts = cat
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean);
    let node = tree;
    for (const part of parts) {
      if (!node[part]) node[part] = {};
      node = node[part];
    }
  }
  return tree;
}

/**
 * 打印树形结构
 */
function printTree(tree, indent = "") {
  const entries = Object.entries(tree);
  entries.forEach(([name, children], i) => {
    const last = i === entries.length - 1;
    const hasChildren = Object.keys(children).length > 0;

    const connector = last ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
    const childIndent = last ? "    " : "\u2502   ";

    console.log(`${indent}${connector}${name}`);
    if (hasChildren) {
      printTree(children, indent + childIndent);
    }
  });
}

module.exports = async function category(argv) {
  const { action, rid, category: catValue } = argv;

  try {
    const repo = new Repository(process.cwd());
    await repo.open();

    // === 树形展示 ===
    if (action === "tree") {
      const all = await repo.query({ type: "note" });
      const cats = new Set();
      for (const r of all) {
        const cat = r.metadata?.category;
        if (cat && cat.trim()) cats.add(cat.trim());
      }
      if (cats.size === 0) {
        Logger.info("暂无分类");
      } else {
        Logger.title("分类树");
        const tree = buildTree([...cats]);
        printTree(tree);
      }
      process.exit(0);
      return;
    }

    // === 列出所有分类（扁平） ===
    if (action === "list" && !rid) {
      const all = await repo.query({ type: "note" });
      const categories = new Set();
      for (const r of all) {
        const cat = r.metadata?.category;
        if (cat && cat.trim()) categories.add(cat.trim());
      }
      if (categories.size === 0) {
        Logger.info("暂无分类");
      } else {
        Logger.title("所有分类");
        for (const c of [...categories].sort()) {
          console.log(`  ${c}`);
        }
      }
      process.exit(0);
      return;
    }

    if (!rid) {
      Logger.error("请指定资源 RID 或文件路径");
      process.exit(1);
    }

    const resource = await repo.resolveResource(rid);

    if (!resource) {
      Logger.error(`资源不存在: ${rid}`);
      process.exit(1);
    }

    const staging = repo.staging;
    const stagingStatus = await staging.getStatus();

    switch (action) {
      case "set":
        if (!catValue) {
          Logger.error("请指定分类名称（支持多级: 父/子/孙）");
          process.exit(1);
        }
        {
          // 规范化路径：去除首尾空格和多余斜杠
          const normalized = catValue
            .split("/")
            .map((s) => s.trim())
            .filter(Boolean)
            .join("/");
          if (!normalized) {
            Logger.error("分类名称不能为空");
            process.exit(1);
          }
          await staging.stageMetadata(resource.rid, { category: normalized });
          Logger.success(
            `已暂存分类变更: "${normalized}"（需 lo commit 提交）`,
          );
        }
        break;

      case "rm":
        {
          await staging.stageMetadata(resource.rid, { category: "" });
          Logger.success("已暂存分类移除（需 lo commit 提交）");
        }
        break;

      case "list":
        Logger.title(`资源 "${resource.name || "未命名"}" 的分类`);
        console.log(resource.metadata.category || "(未设置)");
        const pendingMeta = (stagingStatus.metadata || []).find(
          (m) => m.rid === resource.rid,
        );
        if (pendingMeta && pendingMeta.category !== undefined) {
          Logger.warn(
            `暂存区有未提交的分类变更: "${pendingMeta.category || "(已移除)"}"`,
          );
        }
        break;

      default:
        Logger.error("请指定操作: set, rm, list, tree");
        process.exit(1);
    }

    await repo.close();

    process.exit(0);
  } catch (error) {
    Logger.error(`分类操作失败: ${error.message}`);
    process.exit(1);
  }
};
