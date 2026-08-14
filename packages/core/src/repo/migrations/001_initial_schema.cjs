// 001_initial_schema — lo 首次发布完整数据库结构
// 此迁移包含全部 40 张表的最终结构，禁止修改已发布迁移

module.exports = {
  id: '001_initial_schema',
  description: 'Create full initial database schema (40 tables)',

  async up(db) {
    // ======================== 核心资源表 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS resources (
        rid               TEXT PRIMARY KEY,
        name              TEXT NOT NULL,
        layer             INTEGER NOT NULL DEFAULT 0,
        type              TEXT NOT NULL,
        path              TEXT NOT NULL,
        hash              TEXT,
        metadata          TEXT DEFAULT '{}',
        encrypted         INTEGER DEFAULT 0,
        created           INTEGER NOT NULL,
        updated           INTEGER NOT NULL,
        deleted           INTEGER DEFAULT 0,
        container_schema  TEXT DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);
      CREATE INDEX IF NOT EXISTS idx_resources_path ON resources(path);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_name_layer ON resources(name, layer);
      -- 同文件仅一条活跃 layer-0 记录（name-stack 的 layer>0 版本共享 path；path='' 虚拟资源不受约束）
      CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_path_active ON resources(path) WHERE deleted = 0 AND layer = 0 AND path <> '';
    `);

    // ======================== 标签 / 能力 / 容器忽略模式 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS resource_tags (
        resource_rid  TEXT NOT NULL,
        tag           TEXT NOT NULL,
        PRIMARY KEY (resource_rid, tag),
        FOREIGN KEY (resource_rid) REFERENCES resources(rid) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_rt_tag ON resource_tags(tag);

      CREATE TABLE IF NOT EXISTS resource_capabilities (
        resource_rid  TEXT NOT NULL,
        capability    TEXT NOT NULL,
        PRIMARY KEY (resource_rid, capability),
        FOREIGN KEY (resource_rid) REFERENCES resources(rid) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_rc_cap ON resource_capabilities(capability);

      CREATE TABLE IF NOT EXISTS container_ignore_patterns (
        container_rid  TEXT NOT NULL,
        pattern        TEXT NOT NULL,
        PRIMARY KEY (container_rid, pattern),
        FOREIGN KEY (container_rid) REFERENCES resources(rid) ON DELETE CASCADE
      );
    `);

    // ======================== 关系表 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS relations (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        from_rid  TEXT NOT NULL,
        to_rid    TEXT NOT NULL,
        type      TEXT NOT NULL,
        created   INTEGER NOT NULL,
        metadata  TEXT DEFAULT '{}',
        updated   INTEGER,
        deleted   INTEGER DEFAULT 0,
        UNIQUE(from_rid, to_rid, type)
      );
      CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_rid);
      CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_rid);
      CREATE INDEX IF NOT EXISTS idx_relations_deleted ON relations(deleted);
    `);

    // ======================== 同步 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS sync_log (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        action    TEXT NOT NULL,
        path      TEXT,
        details   TEXT
      );

      CREATE TABLE IF NOT EXISTS sync_config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_ops (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        op_id     TEXT NOT NULL UNIQUE,
        op_type   TEXT NOT NULL,
        rid       TEXT,
        data      TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        device_id TEXT NOT NULL,
        applied   INTEGER DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_sync_ops_timestamp ON sync_ops(timestamp);
      CREATE INDEX IF NOT EXISTS idx_sync_ops_device ON sync_ops(device_id);
    `);

    // ======================== 提交 / 暂存区 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS commits (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        message   TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        added     INTEGER DEFAULT 0,
        updated   INTEGER DEFAULT 0,
        deleted   INTEGER DEFAULT 0,
        renamed   INTEGER DEFAULT 0,
        metadata  INTEGER DEFAULT 0,
        merge     INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS staging_changes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        type        TEXT NOT NULL CHECK(type IN ('add','modify','delete','rename','metadata')),
        path        TEXT NOT NULL,
        old_path    TEXT,
        rid         TEXT,
        meta_json   TEXT,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_staging_type ON staging_changes(type);
    `);

    // ======================== 容器系统 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS resource_sources (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_rid  TEXT NOT NULL,
        source_type   TEXT NOT NULL,
        location      TEXT NOT NULL,
        enabled       INTEGER DEFAULT 1,
        sync_mode     TEXT DEFAULT 'manual',
        last_scan_at  INTEGER,
        metadata      TEXT DEFAULT '{}',
        created_at    INTEGER,
        updated_at    INTEGER,
        FOREIGN KEY (resource_rid) REFERENCES resources(rid) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_resource_sources_rid ON resource_sources(resource_rid);
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS container_members (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        container_rid     TEXT NOT NULL,
        source_id         INTEGER,
        resource_rid      TEXT,
        path              TEXT NOT NULL,
        name              TEXT NOT NULL,
        size              INTEGER DEFAULT 0,
        hash              TEXT,
        modified_time     INTEGER,
        status            TEXT DEFAULT 'indexed',
        force_ignore      INTEGER DEFAULT 0,
        source_deleted_at DATETIME,
        created_at        DATETIME DEFAULT (datetime('now')),
        updated_at        DATETIME DEFAULT (datetime('now')),
        metadata          TEXT DEFAULT '{}',
        FOREIGN KEY (container_rid) REFERENCES resources(rid) ON DELETE CASCADE,
        FOREIGN KEY (resource_rid) REFERENCES resources(rid) ON DELETE SET NULL,
        FOREIGN KEY (source_id) REFERENCES resource_sources(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_container_members_container ON container_members(container_rid);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_container_members_path ON container_members(container_rid, source_id, path);
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS container_sync_configs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        container_rid   TEXT NOT NULL,
        source_id       INTEGER NOT NULL,
        sync_mode       TEXT DEFAULT 'manual',
        delete_policy   TEXT DEFAULT 'soft',
        conflict_policy TEXT DEFAULT 'local',
        interval_ms     INTEGER,
        created_at      DATETIME DEFAULT (datetime('now')),
        updated_at      DATETIME DEFAULT (datetime('now')),
        FOREIGN KEY (container_rid) REFERENCES resources(rid) ON DELETE CASCADE,
        FOREIGN KEY (source_id) REFERENCES resource_sources(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sync_configs_container ON container_sync_configs(container_rid);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_configs_pair ON container_sync_configs(container_rid, source_id);
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS container_operations (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id        TEXT UNIQUE NOT NULL,
        container_rid       TEXT NOT NULL,
        type                TEXT NOT NULL,
        member_id           INTEGER,
        member_path         TEXT,
        source_id           INTEGER,
        before              TEXT,
        after               TEXT,
        created             INTEGER NOT NULL,
        status              TEXT DEFAULT 'success',
        parent_operation_id TEXT,
        error               TEXT,
        actor               TEXT,
        transaction_id      TEXT,
        FOREIGN KEY(container_rid) REFERENCES resources(rid) ON DELETE CASCADE,
        FOREIGN KEY(member_id) REFERENCES container_members(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ops_container ON container_operations(container_rid);
      CREATE INDEX IF NOT EXISTS idx_ops_type ON container_operations(type);
      CREATE INDEX IF NOT EXISTS idx_ops_member ON container_operations(member_id);
      CREATE INDEX IF NOT EXISTS idx_ops_parent ON container_operations(parent_operation_id);
      CREATE INDEX IF NOT EXISTS idx_ops_status ON container_operations(status);
      CREATE INDEX IF NOT EXISTS idx_ops_transaction ON container_operations(transaction_id);
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS container_transactions (
        transaction_id  TEXT PRIMARY KEY,
        container_rid   TEXT NOT NULL,
        type            TEXT NOT NULL,
        description     TEXT,
        status          TEXT NOT NULL DEFAULT 'pending',
        created         INTEGER,
        completed       INTEGER,
        error           TEXT,
        FOREIGN KEY(container_rid) REFERENCES resources(rid) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_tx_container ON container_transactions(container_rid);
      CREATE INDEX IF NOT EXISTS idx_tx_status ON container_transactions(status);
    `);

    // ======================== AI / 概念 / 交互 / 学习 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ai_suggestions (
        id          TEXT PRIMARY KEY,
        type        TEXT NOT NULL DEFAULT 'relation',
        source_rid  TEXT,
        target_rid  TEXT,
        payload     TEXT DEFAULT '{}',
        confidence  REAL DEFAULT 0,
        reason      TEXT,
        status      TEXT NOT NULL DEFAULT 'pending',
        created     INTEGER,
        updated     INTEGER,
        priority    TEXT DEFAULT 'medium',
        source      TEXT DEFAULT 'ai',
        expires     INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_ai_suggestions_status ON ai_suggestions(status);
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS ai_memory (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        type          TEXT,
        resource_rid  TEXT,
        concept       TEXT,
        value         TEXT,
        confidence    REAL DEFAULT 0.5,
        tags          TEXT,
        created_at    INTEGER
      );

      CREATE TABLE IF NOT EXISTS ai_concepts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT UNIQUE,
        meaning     TEXT,
        confidence  REAL DEFAULT 0.5,
        metadata    TEXT,
        relations   TEXT DEFAULT '[]',
        created_at  INTEGER
      );

      CREATE TABLE IF NOT EXISTS ai_interactions (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        request   TEXT,
        response  TEXT,
        actions   TEXT,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS ai_learning (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern     TEXT,
        feedback    TEXT,
        adjustment  TEXT,
        created_at  INTEGER
      );
    `);

    // ======================== 知识事件 / 快照 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_events (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        type    TEXT NOT NULL,
        rid     TEXT,
        payload TEXT DEFAULT '{}',
        created INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_knowledge_events_type ON knowledge_events(type);
      CREATE INDEX IF NOT EXISTS idx_knowledge_events_rid ON knowledge_events(rid);

      CREATE TABLE IF NOT EXISTS knowledge_snapshots (
        id              TEXT PRIMARY KEY,
        created_at      INTEGER,
        resource_count  INTEGER DEFAULT 0,
        relation_count  INTEGER DEFAULT 0,
        density         REAL DEFAULT 0,
        entropy         REAL DEFAULT 0,
        growth          REAL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_snapshots_created ON knowledge_snapshots(created_at);
    `);

    // ======================== 分布式同步 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS repositories (
        id        TEXT PRIMARY KEY,
        namespace TEXT NOT NULL UNIQUE,
        name      TEXT NOT NULL,
        path      TEXT NOT NULL,
        created   INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_repositories_namespace ON repositories(namespace);

      CREATE TABLE IF NOT EXISTS remote_resources (
        global_id TEXT PRIMARY KEY,
        namespace TEXT,
        metadata  TEXT DEFAULT '{}',
        hash      TEXT,
        updated   INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_remote_resources_ns ON remote_resources(namespace);

      CREATE TABLE IF NOT EXISTS sync_records (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        repository  TEXT NOT NULL,
        type        TEXT NOT NULL,
        status      TEXT DEFAULT 'success',
        changes     INTEGER DEFAULT 0,
        details     TEXT DEFAULT '{}',
        created     INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_sync_records_repo ON sync_records(repository);
      CREATE INDEX IF NOT EXISTS idx_sync_records_type ON sync_records(type);

      CREATE TABLE IF NOT EXISTS conflicts (
        id        TEXT PRIMARY KEY,
        resource  TEXT NOT NULL,
        type      TEXT DEFAULT 'content_conflict',
        status    TEXT DEFAULT 'pending',
        payload   TEXT DEFAULT '{}',
        created   INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_conflicts_resource ON conflicts(resource);
      CREATE INDEX IF NOT EXISTS idx_conflicts_status ON conflicts(status);
    `);

    // ======================== 插件 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS plugins (
        id            TEXT PRIMARY KEY,
        name          TEXT,
        version       TEXT,
        enabled       INTEGER DEFAULT 1,
        installed_at  INTEGER,
        updated_at    INTEGER
      );

      CREATE TABLE IF NOT EXISTS plugin_settings (
        plugin_id TEXT,
        key       TEXT,
        value     TEXT,
        PRIMARY KEY (plugin_id, key)
      );
    `);

    // ======================== 事件 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id          TEXT PRIMARY KEY,
        type        TEXT NOT NULL,
        source      TEXT DEFAULT 'system',
        payload     TEXT DEFAULT '{}',
        metadata    TEXT DEFAULT '{}',
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
    `);

    // ======================== 工作流（过程模型） ========================
    // Workflow 是独立一等系统：定义（states/transitions/rules/events/actions/version）
    // + 实例（Resource 在某个 Workflow 中的参与过程）。
    // definition 存 Workflow Definition JSON（含 applicable_schemas、states、transitions、version）。
    // Workflow 与 Schema 解耦：applicable_schemas 仅作为可选作用域限制，不是强绑定。
    await db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id                 TEXT PRIMARY KEY,
        name               TEXT,
        description        TEXT DEFAULT '',
        definition         TEXT,
        applicable_schemas TEXT DEFAULT '[]',
        version            INTEGER NOT NULL DEFAULT 1,
        status             TEXT DEFAULT 'active',
        created_at         INTEGER,
        updated_at         INTEGER
      );

      CREATE TABLE IF NOT EXISTS workflow_instances (
        id               TEXT PRIMARY KEY,
        workflow_id      TEXT NOT NULL,
        resource_rid     TEXT NOT NULL,
        current_state    TEXT NOT NULL,
        workflow_version INTEGER NOT NULL DEFAULT 1,
        status           TEXT NOT NULL DEFAULT 'active',
        metadata         TEXT DEFAULT '{}',
        created          INTEGER NOT NULL,
        updated          INTEGER NOT NULL,
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
        FOREIGN KEY (resource_rid) REFERENCES resources(rid) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_wfi_workflow ON workflow_instances(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_wfi_resource ON workflow_instances(resource_rid);
      CREATE INDEX IF NOT EXISTS idx_wfi_status ON workflow_instances(status);
      -- 同一 (workflow, resource) 对允许存在多条历史实例（detached/completed 保留），
      -- 但仅允许一条 active 实例（部分唯一索引）。重新 attach = 创建新实例，不覆盖历史。
      CREATE UNIQUE INDEX IF NOT EXISTS idx_wfi_pair_active ON workflow_instances(workflow_id, resource_rid) WHERE status = 'active';

      -- Workflow Definition 版本快照：每个版本冻结一份 definition，供历史实例解释。
      -- 定义升版时生成新快照，旧版本定义永久保留（类似 Git tag）。
      CREATE TABLE IF NOT EXISTS workflow_definition_versions (
        workflow_id TEXT NOT NULL,
        version     INTEGER NOT NULL,
        definition  TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        PRIMARY KEY (workflow_id, version),
        FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_wfdefver_workflow ON workflow_definition_versions(workflow_id);

      CREATE TABLE IF NOT EXISTS workflow_transition_log (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id   TEXT NOT NULL,
        workflow_id   TEXT NOT NULL,
        resource_rid  TEXT NOT NULL,
        from_state    TEXT,
        to_state      TEXT NOT NULL,
        actor         TEXT DEFAULT 'system',
        metadata      TEXT DEFAULT '{}',
        created       INTEGER NOT NULL,
        FOREIGN KEY (instance_id) REFERENCES workflow_instances(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_wftl_instance ON workflow_transition_log(instance_id);
      CREATE INDEX IF NOT EXISTS idx_wftl_workflow ON workflow_transition_log(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_wftl_resource ON workflow_transition_log(resource_rid);
      CREATE INDEX IF NOT EXISTS idx_wftl_created ON workflow_transition_log(created);
    `);

    // ======================== 权限 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS roles (
        id          TEXT PRIMARY KEY,
        name        TEXT,
        description TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id     TEXT NOT NULL,
        permission  TEXT NOT NULL,
        PRIMARY KEY (role_id, permission),
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_rp_role ON role_permissions(role_id);

      CREATE TABLE IF NOT EXISTS subjects_roles (
        subject_id  TEXT NOT NULL,
        role_id     TEXT NOT NULL,
        PRIMARY KEY (subject_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS permissions (
        id          TEXT PRIMARY KEY,
        subject_id  TEXT NOT NULL,
        action      TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS resource_acl (
        resource_id  TEXT NOT NULL,
        subject_id   TEXT NOT NULL,
        permission   TEXT NOT NULL,
        deny         INTEGER DEFAULT 0,
        PRIMARY KEY (resource_id, subject_id, permission)
      );

      CREATE TABLE IF NOT EXISTS permission_audit (
        id          TEXT PRIMARY KEY,
        subject     TEXT NOT NULL,
        action      TEXT NOT NULL,
        resource    TEXT DEFAULT '',
        allowed     INTEGER DEFAULT 1,
        reason      TEXT DEFAULT '',
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_perm_audit_subject ON permission_audit(subject);
      CREATE INDEX IF NOT EXISTS idx_perm_audit_created ON permission_audit(created_at);
    `);

    // ======================== 安全 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS identities (
        id          TEXT PRIMARY KEY,
        type        TEXT NOT NULL,
        name        TEXT,
        provider    TEXT DEFAULT 'local',
        metadata    TEXT DEFAULT '{}',
        created_at  INTEGER
      );

      CREATE TABLE IF NOT EXISTS policies (
        id              TEXT PRIMARY KEY,
        subject         TEXT NOT NULL,
        resource        TEXT NOT NULL,
        effect          TEXT NOT NULL DEFAULT 'allow',
        priority        INTEGER DEFAULT 0,
        condition_JSON  TEXT,
        metadata        TEXT DEFAULT '{}',
        created_at      INTEGER
      );

      CREATE TABLE IF NOT EXISTS policy_actions (
        policy_id  TEXT NOT NULL,
        action     TEXT NOT NULL,
        PRIMARY KEY (policy_id, action),
        FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_pa_policy ON policy_actions(policy_id);

      CREATE TABLE IF NOT EXISTS security_audit (
        id          TEXT PRIMARY KEY,
        actor       TEXT NOT NULL,
        action      TEXT NOT NULL,
        resource    TEXT DEFAULT '',
        result      TEXT DEFAULT '',
        reason      TEXT DEFAULT '',
        metadata    TEXT DEFAULT '{}',
        created_at  INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_sec_audit_actor ON security_audit(actor);
      CREATE INDEX IF NOT EXISTS idx_sec_audit_result ON security_audit(result);
      CREATE INDEX IF NOT EXISTS idx_sec_audit_created ON security_audit(created_at);

      CREATE TABLE IF NOT EXISTS credentials (
        id            TEXT PRIMARY KEY,
        identity_id   TEXT NOT NULL,
        type          TEXT NOT NULL DEFAULT 'api-key',
        token_hash    TEXT,
        expires_at    INTEGER,
        created_at    INTEGER,
        metadata      TEXT DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_cred_identity ON credentials(identity_id);
      CREATE INDEX IF NOT EXISTS idx_cred_hash ON credentials(token_hash);
    `);

    // ======================== Agent ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id          TEXT PRIMARY KEY,
        name        TEXT,
        type        TEXT,
        status      TEXT DEFAULT 'created',
        config      TEXT,
        created_at  INTEGER,
        updated_at  INTEGER
      );

      CREATE TABLE IF NOT EXISTS agent_runs (
        id          TEXT PRIMARY KEY,
        agent_id    TEXT,
        status      TEXT,
        input       TEXT,
        output      TEXT,
        created_at  INTEGER
      );

      CREATE TABLE IF NOT EXISTS agent_memory (
        id          TEXT PRIMARY KEY,
        agent_id    TEXT,
        type        TEXT,
        content     TEXT,
        created_at  INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_agmem_agent ON agent_memory(agent_id);
    `);

    // ======================== 协作 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS agent_messages (
        id          TEXT PRIMARY KEY,
        from_agent  TEXT,
        to_agent    TEXT,
        type        TEXT,
        payload     TEXT,
        created_at  INTEGER
      );

      CREATE TABLE IF NOT EXISTS agent_teams (
        id        TEXT PRIMARY KEY,
        name      TEXT,
        strategy  TEXT
      );

      CREATE TABLE IF NOT EXISTS agent_tasks (
        id      TEXT PRIMARY KEY,
        team_id TEXT,
        goal    TEXT,
        status  TEXT,
        result  TEXT
      );
    `);

    // ======================== 共享记忆 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS shared_memory (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id    TEXT UNIQUE NOT NULL,
        scope       TEXT NOT NULL,
        type        TEXT NOT NULL,
        content     TEXT,
        owner       TEXT DEFAULT 'system',
        visibility  TEXT DEFAULT 'all',
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_shared_scope_type ON shared_memory(scope, type);
    `);

    // ======================== 进化 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS evolution_states (
        id          TEXT PRIMARY KEY,
        version     TEXT,
        health      REAL,
        complexity  REAL,
        connectivity REAL,
        maturity    TEXT,
        snapshot    TEXT,
        score       INTEGER,
        created_at  INTEGER
      );

      CREATE TABLE IF NOT EXISTS evolution_actions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        type        TEXT,
        strategy    TEXT,
        action      TEXT,
        status      TEXT,
        result      TEXT,
        created_at  INTEGER
      );

      CREATE TABLE IF NOT EXISTS evolution_history (
        id            TEXT PRIMARY KEY,
        before_state  TEXT,
        after_state   TEXT,
        action        TEXT,
        improvement   REAL,
        result        TEXT,
        created_at    INTEGER
      );
    `);

    // ======================== 运行时 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS runtime_instances (
        id          TEXT PRIMARY KEY,
        type        TEXT,
        state       TEXT,
        updated_at  INTEGER,
        created_at  INTEGER
      );

      CREATE TABLE IF NOT EXISTS runtime_events (
        id          TEXT PRIMARY KEY,
        runtime_id  TEXT,
        event       TEXT,
        payload     TEXT DEFAULT '{}',
        created_at  INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_rte_runtime ON runtime_events(runtime_id);
      CREATE INDEX IF NOT EXISTS idx_rte_created ON runtime_events(created_at);

      CREATE TABLE IF NOT EXISTS runtime_state (
        key         TEXT PRIMARY KEY,
        value       TEXT,
        updated_at  INTEGER
      );
    `);

    // ======================== Schema 系统 ========================
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schemas (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL UNIQUE,
        version       INTEGER NOT NULL DEFAULT 1,
        fields        TEXT NOT NULL DEFAULT '[]',
        relations     TEXT NOT NULL DEFAULT '[]',
        status        TEXT NOT NULL DEFAULT 'active',
        metadata      TEXT DEFAULT '{}',
        behaviors     TEXT DEFAULT '{}',
        created       INTEGER NOT NULL,
        updated       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_schemas_status ON schemas(status);

      CREATE TABLE IF NOT EXISTS resource_schemas (
        resource_rid   TEXT PRIMARY KEY,
        schema_id      TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        attached_at    INTEGER NOT NULL,
        FOREIGN KEY (resource_rid) REFERENCES resources(rid) ON DELETE CASCADE,
        FOREIGN KEY (schema_id) REFERENCES schemas(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_resource_schemas_schema ON resource_schemas(schema_id);

      CREATE TABLE IF NOT EXISTS views (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL UNIQUE,
        query         TEXT NOT NULL DEFAULT '{}',      -- Query Definition（JSON）
        fields        TEXT NOT NULL DEFAULT '[]',      -- Field Projection（JSON）
        presentation  TEXT NOT NULL DEFAULT '{}',      -- Presentation Definition（JSON，含 type + config）
        status        TEXT NOT NULL DEFAULT 'active',
        metadata      TEXT DEFAULT '{}',
        created       INTEGER NOT NULL,
        updated       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_views_status ON views(status);
    `);

    // ======================== 系统种子数据 ========================
    const now = Date.now();
    await db.run(
      `INSERT OR IGNORE INTO resources (rid, name, layer, type, path, hash, metadata, encrypted, created, updated)
       VALUES ('__system__', '__system__', 0, 'system', '', '', '{}', 0, ?, ?)`,
      [now, now]
    );
  }
};
