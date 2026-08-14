/**
 * Permission — 权限模型
 *
 * Phase 6.4: 定义权限格式。
 *
 * 格式: domain.action
 *
 * 示例:
 *   resource.read
 *   resource.write
 *   resource.delete
 *   relation.create
 *   relation.delete
 *   workflow.execute
 *   workflow.cancel
 *   plugin.install
 *   plugin.enable
 *   plugin.execute
 *   event.subscribe
 *   event.subscribe.resource.created
 *   suggestion.approve
 */

// 内置全局权限定义
const BUILTIN_PERMISSIONS = {
  // Resource
  "resource.read": {
    domain: "resource",
    action: "read",
    description: "读取资源",
  },
  "resource.write": {
    domain: "resource",
    action: "write",
    description: "创建/修改资源",
  },
  "resource.delete": {
    domain: "resource",
    action: "delete",
    description: "删除资源",
  },
  "resource.export": {
    domain: "resource",
    action: "export",
    description: "导出资源",
  },

  // Relation
  "relation.create": {
    domain: "relation",
    action: "create",
    description: "创建关系",
  },
  "relation.delete": {
    domain: "relation",
    action: "delete",
    description: "删除关系",
  },
  "relation.read": {
    domain: "relation",
    action: "read",
    description: "读取关系",
  },

  // Graph
  "graph.view": { domain: "graph", action: "view", description: "查看图谱" },
  "graph.analyze": {
    domain: "graph",
    action: "analyze",
    description: "图谱分析",
  },
  "graph.export": {
    domain: "graph",
    action: "export",
    description: "导出图谱",
  },

  // Workflow
  "workflow.execute": {
    domain: "workflow",
    action: "execute",
    description: "执行工作流",
  },
  "workflow.cancel": {
    domain: "workflow",
    action: "cancel",
    description: "取消工作流",
  },
  "workflow.modify": {
    domain: "workflow",
    action: "modify",
    description: "修改工作流",
  },
  "workflow.create": {
    domain: "workflow",
    action: "create",
    description: "创建工作流",
  },

  // Plugin
  "plugin.install": {
    domain: "plugin",
    action: "install",
    description: "安装插件",
  },
  "plugin.enable": {
    domain: "plugin",
    action: "enable",
    description: "启用插件",
  },
  "plugin.disable": {
    domain: "plugin",
    action: "disable",
    description: "禁用插件",
  },
  "plugin.execute": {
    domain: "plugin",
    action: "execute",
    description: "执行插件",
  },

  // Event
  "event.subscribe": {
    domain: "event",
    action: "subscribe",
    description: "订阅事件",
  },
  "event.publish": {
    domain: "event",
    action: "publish",
    description: "发布事件",
  },

  // Suggestion / AI
  "suggestion.create": {
    domain: "suggestion",
    action: "create",
    description: "创建建议",
  },
  "suggestion.approve": {
    domain: "suggestion",
    action: "approve",
    description: "批准建议",
  },
  "suggestion.reject": {
    domain: "suggestion",
    action: "reject",
    description: "拒绝建议",
  },
  "ai.analyze": { domain: "ai", action: "analyze", description: "AI 分析" },
  "ai.summarize": { domain: "ai", action: "summarize", description: "AI 摘要" },

  // Federation / Sync
  "federation.manage": {
    domain: "federation",
    action: "manage",
    description: "联邦管理",
  },
  "sync.execute": {
    domain: "sync",
    action: "execute",
    description: "执行同步",
  },

  // System
  "system.admin": {
    domain: "system",
    action: "admin",
    description: "系统管理",
  },
  "system.audit": {
    domain: "system",
    action: "audit",
    description: "审计查看",
  },

  // Wildcard
  "*": { domain: "*", action: "*", description: "所有权限" },
};

class Permission {
  /**
   * @param {string} code — 'resource.read' 或 '*'
   */
  constructor(code) {
    if (!code) throw new Error("Permission code is required");
    this.code = code;

    const def = BUILTIN_PERMISSIONS[code];
    if (def) {
      this.domain = def.domain;
      this.action = def.action;
      this.description = def.description;
    } else {
      // 解析 domain.action 格式
      const parts = code.split(".");
      this.domain = parts[0] || "";
      this.action = parts.slice(1).join(".") || "";
      this.description = "";
    }
  }

  /**
   * 是否匹配另一个权限
   * 支持通配符: '*' matches all, 'resource.*' matches resource domain
   */
  matches(other) {
    const otherCode = typeof other === "string" ? other : other.code || other;

    if (this.code === "*") return true;
    if (otherCode === "*") return true;

    if (this.code === otherCode) return true;

    // domain.* 通配
    if (this.code === `${this.domain}.*`) {
      return otherCode.startsWith(`${this.domain}.`);
    }
    if (otherCode.endsWith(".*")) {
      const otherDomain = otherCode.replace(".*", "");
      return this.code.startsWith(`${otherDomain}.`);
    }

    return false;
  }

  toString() {
    return this.code;
  }

  toJSON() {
    return {
      code: this.code,
      domain: this.domain,
      action: this.action,
      description: this.description,
    };
  }

  static get builtins() {
    return Object.keys(BUILTIN_PERMISSIONS).filter((k) => k !== "*");
  }
}

module.exports = Permission;
