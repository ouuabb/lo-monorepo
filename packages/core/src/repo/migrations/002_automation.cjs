/**
 * Automation — 行为编排层持久化
 *
 * automations       — Automation Definition（trigger/condition/actions/policy/source/status）
 * automation_runs   — Automation 执行历史（含 trigger_source / execution_context / actions_result）
 */

module.exports = {
  id: '002_automation',
  description: 'Automation 行为编排层表结构',
  async up(db) {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS automations (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT DEFAULT '',
        source      TEXT DEFAULT '{}',
        trigger     TEXT DEFAULT '{}',
        condition   TEXT DEFAULT '{}',
        actions     TEXT DEFAULT '[]',
        policy      TEXT DEFAULT '{}',
        status      TEXT DEFAULT 'active',
        created     INTEGER,
        updated     INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_automations_status ON automations(status);

      CREATE TABLE IF NOT EXISTS automation_runs (
        id                TEXT PRIMARY KEY,
        automation_id     TEXT NOT NULL,
        trigger_source    TEXT DEFAULT 'cli',
        execution_context TEXT DEFAULT '{}',
        actions_result    TEXT DEFAULT '[]',
        status            TEXT DEFAULT 'running',
        started           INTEGER,
        finished          INTEGER,
        error             TEXT DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_id ON automation_runs(automation_id);
      CREATE INDEX IF NOT EXISTS idx_automation_runs_status ON automation_runs(status);
      CREATE INDEX IF NOT EXISTS idx_automation_runs_started ON automation_runs(started);
    `);
  }
};
