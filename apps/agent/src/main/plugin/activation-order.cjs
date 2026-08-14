/**
 * activation-order.cjs —— 插件激活顺序（依赖拓扑排序）
 *
 * 依据 manifest.dependsOn 计算激活顺序（Kahn's algorithm）：
 *   - 提供者（被依赖方）先激活，消费者（依赖方）后激活
 *   - 依赖不存在的插件 / 依赖自身：在排序层忽略（manifest 校验已拒绝自身依赖）
 *   - 循环依赖：无法定序的节点按原加载顺序稳定兜底，并随结果返回供宿主告警
 *
 * @param {Array<{ id: string, manifest: object }>} plugins
 * @returns {{ ordered: string[], cycles: string[] }}
 */
function resolveActivationOrder(plugins = []) {
  const byId = new Map(plugins.map((p) => [p.id, p]));
  const deps = new Map();
  const dependents = new Map();
  const indegree = new Map();

  for (const p of plugins) {
    const declared = Array.isArray(p.manifest && p.manifest.dependsOn)
      ? p.manifest.dependsOn
      : [];
    const resolvable = declared.filter((dep) => dep !== p.id && byId.has(dep));
    deps.set(p.id, resolvable);
    indegree.set(p.id, resolvable.length);
    for (const dep of resolvable) {
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep).push(p.id);
    }
  }

  const queue = plugins.map((p) => p.id).filter((id) => indegree.get(id) === 0);
  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    ordered.push(id);
    for (const dependent of dependents.get(id) || []) {
      indegree.set(dependent, indegree.get(dependent) - 1);
      if (indegree.get(dependent) === 0) queue.push(dependent);
    }
  }

  const remaining = plugins.map((p) => p.id).filter((id) => !ordered.includes(id));
  return { ordered: [...ordered, ...remaining], cycles: remaining };
}

module.exports = { resolveActivationOrder };