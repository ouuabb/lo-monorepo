/**
 * RuleEngine — 转换规则引擎
 *
 * 评估 Workflow Transition 上的规则。规则只负责判断，不负责执行。
 * 规则面向"参与实例 + 传入上下文（如 Resource metadata）"求值。
 *
 * 支持的规则形态:
 *   - 表达式字符串: "score >= 0.5 and type == 'note'"
 *   - 对象形态: { expression: "..." }
 *   - 空规则 / null → 视为通过
 *
 * 表达式支持的引用:
 *   $resource.字段       — Resource metadata 字段（无 schema 时按通用字段/裸值）
 *   $metadata.字段       — 实例 metadata
 *   $context.字段        — 传入 context 的任意字段
 *   裸标识符           — 优先按 resource metadata 字段解析
 *
 * 支持的比较: == != >= <= > <
 * 支持的逻辑: and or not
 */

class RuleEngine {
  /**
   * @param {object} [services]
   * @param {object} [services.logger]
   */
  constructor(services = {}) {
    this.logger = services.logger || console;
  }

  /**
   * 评估规则集合（全部通过才为 true）
   * @param {Array|string|object|null} rules
   * @param {object} context — { resource: {rid, type, metadata, ...}, instance, workflow, ... }
   * @returns {boolean}
   */
  evaluateRules(rules, context) {
    if (!rules) return true;
    const list = Array.isArray(rules) ? rules : [rules];
    if (list.length === 0) return true;

    for (const rule of list) {
      const expression = typeof rule === 'string' ? rule : (rule && rule.expression);
      if (!expression) continue;
      if (!this.evaluate(expression, context)) {
        return false;
      }
    }
    return true;
  }

  /**
   * 评估单条规则表达式
   * @param {string} expression
   * @param {object} context
   * @returns {boolean}
   */
  evaluate(expression, context) {
    if (!expression || typeof expression !== 'string') return true;

    try {
      const resolved = this._resolveVariables(expression, context);
      return this._safeEvaluate(resolved);
    } catch (e) {
      this.logger.error(`[rule] Expression error: ${e.message}`);
      return false;
    }
  }

  /**
   * 解析变量引用
   * $resource.key → resource.metadata.key（回退到裸属性）
   * $metadata.key  → instance.metadata.key
   * $context.key   → context.key
   */
  _resolveVariables(expression, context) {
    const ctx = context || {};
    const resource = ctx.resource || {};
    const resourceMeta = (resource.metadata && typeof resource.metadata === 'object') ? resource.metadata : {};
    const instanceMeta = (ctx.instance && ctx.instance.metadata && typeof ctx.instance.metadata === 'object')
      ? ctx.instance.metadata
      : {};

    let resolved = expression;

    const replaceToken = (pattern, resolver) => {
      resolved = resolved.replace(pattern, (_, key) => {
        const val = resolver(key);
        if (val === undefined || val === null) return 'null';
        if (typeof val === 'string') return `'${val.replace(/'/g, "\\'")}'`;
        if (typeof val === 'boolean') return String(val);
        if (typeof val === 'number') return String(val);
        return JSON.stringify(val);
      });
    };

    replaceToken(/\$resource\.([\w.]+)/g, (key) => {
      const parts = key.split('.');
      const top = parts[0];
      if (top === 'metadata') {
        return parts.slice(1).reduce((acc, k) => (acc == null ? acc : acc[k]), resourceMeta);
      }
      if (Object.prototype.hasOwnProperty.call(resourceMeta, top)) {
        return parts.reduce((acc, k) => (acc == null ? acc : acc[k]), resourceMeta);
      }
      return parts.reduce((acc, k) => (acc == null ? acc : acc[k]), resource);
    });

    replaceToken(/\$metadata\.([\w.]+)/g, (key) =>
      key.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), instanceMeta)
    );

    replaceToken(/\$context\.([\w.]+)/g, (key) =>
      key.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), ctx)
    );

    // 裸标识符：按 resource metadata 字段解析（仅在引号外的位置替换，避免破坏字符串字面量）
    resolved = resolved.replace(/('[^']*'|"[^"]*")|\b([A-Za-z_][A-Za-z0-9_.]*)\b/g, (match, quoted, key) => {
      if (quoted !== undefined) return quoted; // 保留字符串字面量
      if (/^(true|false|null|and|or|not)$/i.test(key)) return match;
      const top = key.split('.')[0];
      const base = Object.prototype.hasOwnProperty.call(resourceMeta, top) ? resourceMeta : resource;
      if (Object.prototype.hasOwnProperty.call(base, top)) {
        const val = key.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), base);
        if (val === undefined || val === null) return 'null';
        if (typeof val === 'string') return `'${val.replace(/'/g, "\\'")}'`;
        if (typeof val === 'boolean') return String(val);
        if (typeof val === 'number') return String(val);
        return JSON.stringify(val);
      }
      return match;
    });

    return resolved;
  }

  /**
   * 安全求值（仅支持简单比较和逻辑运算）
   */
  _safeEvaluate(expression) {
    let expr = expression.trim();

    // 去掉包裹整体的一对括号（平衡括号），如 "(a == b)" → "a == b"
    expr = this._stripOuterParens(expr);

    // 处理逻辑 or / and（or 优先级最低，先拆分保证 and 绑定更紧）
    if (/\bor\b/i.test(expr)) {
      const parts = this._splitTopLevel(expr, /\bor\b/i);
      if (parts.length > 1) {
        return parts.some((p) => this._safeEvaluate(p.trim()));
      }
    }

    if (/\band\b/i.test(expr)) {
      const parts = this._splitTopLevel(expr, /\band\b/i);
      if (parts.length > 1) {
        return parts.every((p) => this._safeEvaluate(p.trim()));
      }
    }

    // 处理 not
    const notMatch = expr.match(/^not\s+(.+)$/i);
    if (notMatch) {
      return !this._safeEvaluate(notMatch[1].trim());
    }

    // 处理比较: a op b
    const compMatch = expr.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (compMatch) {
      const left = this._parseValue(compMatch[1].trim());
      const op = compMatch[2];
      const right = this._parseValue(compMatch[3].trim());

      switch (op) {
        case '==': return left == right;
        case '!=': return left != right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        case '>':  return left > right;
        case '<':  return left < right;
        default: return false;
      }
    }

    // 布尔值直接返回
    if (expr === 'true') return true;
    if (expr === 'false') return false;

    return false;
  }

  /**
   * 若整体被一对平衡括号包裹则剥离（仅最外层）。
   * 例: "(a and b)" → "a and b"；"(a) and (b)" → 不剥离。
   */
  _stripOuterParens(expr) {
    if (expr.length < 2 || expr[0] !== '(' || expr[expr.length - 1] !== ')') return expr;
    let depth = 0;
    let inQuote = null;
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (inQuote) {
        if (ch === inQuote) inQuote = null;
        continue;
      }
      if (ch === "'" || ch === '"') { inQuote = ch; continue; }
      if (ch === '(') depth++;
      if (ch === ')') {
        depth--;
        if (depth === 0 && i < expr.length - 1) return expr; // 最外层括号未包住整体
      }
    }
    if (depth !== 0) return expr;
    return expr.slice(1, -1).trim();
  }

  /**
   * 顶层分割逻辑操作符（不拆引号内的内容）
   */
  _splitTopLevel(expression, re) {
    const parts = [];
    let depth = 0;
    let inQuote = null;
    let current = '';

    for (let i = 0; i < expression.length; i++) {
      const ch = expression[i];
      if (inQuote) {
        current += ch;
        if (ch === inQuote) inQuote = null;
        continue;
      }
      if (ch === "'" || ch === '"') {
        inQuote = ch;
        current += ch;
        continue;
      }
      if (ch === '(') { depth++; current += ch; continue; }
      if (ch === ')') { depth--; current += ch; continue; }
      if (depth === 0) {
        const rest = expression.slice(i);
        const m = rest.match(re);
        if (m && m.index === 0) {
          parts.push(current);
          current = '';
          i += m[0].length - 1;
          continue;
        }
      }
      current += ch;
    }
    if (current.trim() !== '' || parts.length === 0) {
      parts.push(current);
    }
    return parts;
  }

  /**
   * 解析值
   */
  _parseValue(val) {
    if (val === 'null') return null;
    if (val === 'true') return true;
    if (val === 'false') return false;
    if ((val.startsWith("'") && val.endsWith("'")) ||
        (val.startsWith('"') && val.endsWith('"'))) {
      return val.slice(1, -1).replace(/\\'/g, "'");
    }
    const num = Number(val);
    if (!isNaN(num) && val !== '') return num;
    return val;
  }
}

module.exports = RuleEngine;
