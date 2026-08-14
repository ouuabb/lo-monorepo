/**
 * Runtime — 对外入口
 *
 * Phase 6.10: Knowledge Runtime 的对外接口。
 * 创建 RuntimeKernel 实例并管理其生命周期。
 */

const RuntimeKernel = require('./runtimeKernel.cjs');

/**
 * 创建 Runtime 实例
 * @param {object} services
 * @returns {RuntimeKernel}
 */
function createRuntime(services = {}) {
  return new RuntimeKernel(services);
}

module.exports = {
  createRuntime,
  RuntimeKernel,
  RuntimeState: require('./runtimeState.cjs'),
  RuntimeContext: require('./runtimeContext.cjs'),
  RuntimeRegistry: require('./runtimeRegistry.cjs'),
  RuntimeStore: require('./runtimeStore.cjs'),
  RuntimeScheduler: require('./runtimeScheduler.cjs'),
  RuntimeLoop: require('./runtimeLoop.cjs'),
  RuntimeMonitor: require('./runtimeMonitor.cjs'),
  ResourceRuntime: require('./resourceRuntime.cjs'),
  KnowledgeRuntime: require('./knowledgeRuntime.cjs'),
  RuntimeEvolution: require('./runtimeEvolution.cjs')
};
