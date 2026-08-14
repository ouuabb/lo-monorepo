/**
 * Builtin Automation — knowledge.maintenance.daily
 *
 * 每天知识维护：扫描遗忘资源 → 修复诊断 → 生成建议。
 * 对应旧 KnowledgeScheduler.runAll()（Phase 5.9 知识调度器），
 * 现在作为内置 Automation，由 AutomationEngine 统一调度执行。
 */

const Automation = require('../Automation.cjs');

function knowledgeMaintenanceDefinition() {
  return new Automation({
    id: 'knowledge.maintenance.daily',
    name: '知识维护',
    description: '每天扫描遗忘资源、检测知识健康、生成维护建议',
    source: { type: 'builtin', id: 'knowledge.maintenance' },
    trigger: { type: 'schedule', schedule: { cadence: 'daily', time: '03:00' } },
    condition: {},
    actions: [
      { id: 'maintain', type: 'knowledge.maintenance', params: {}, dependsOn: [] }
    ],
    policy: { requireApproval: false, risk: 'low', failFast: false }
  });
}

module.exports = { knowledgeMaintenanceDefinition };