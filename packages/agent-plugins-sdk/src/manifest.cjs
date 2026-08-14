/**
 * manifest.cjs —— 插件 Manifest Schema 与校验
 *
 * manifest 是插件 ↔ 宿主(lo-agent)的稳定契约。
 * SDK 定义完整 schema；Host 在加载插件时校验。
 *
 * 结构:
 *   id / name / version / main        —— 必填
 *   description / author              —— 可选元信息
 *   engines: { agent, core }          —— 版本约束
 *   dependsOn: [...]                  —— 依赖插件 ID（激活顺序：提供者先于消费者）
 *   ui                                —— 渲染端入口（mountEl UI，可选）
 *   activationEvents: [...]           —— 延迟激活触发点
 *   contributes: { commands, views, panels, editors, services }
 *   permissions: { lo, storage, network, shell }
 *   config: { key: { type, default, description } }
 */
const REQUIRED_FIELDS = ['id', 'name', 'version', 'main'];

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

const CONTRIBUTE_TYPES = ['commands', 'views', 'panels', 'editors', 'services'];
const PERMISSION_LO_CAPABILITIES = [
  'operations.read',
  'operations.write',
  'relations.read',
  'relations.write',
  'events.read',
  'resources.read',
  'resources.write',
  'health.read',
];

/** activationEvents 触发点前缀（延迟激活触发类型） */
const ACTIVATION_TRIGGER_PREFIXES = ['onCommand', 'onView', 'onPanel', 'onEditor'];
const ACTIVATION_TRIGGER_PATTERN = new RegExp(
  `^(?:\\*|onStartup|(?:${ACTIVATION_TRIGGER_PREFIXES.join('|')}):[^\\s]+)$`,
);

/**
 * manifestSchema —— Manifest 规范的机器可读描述
 *
 * 独立规范文档见 `docs/manifest-spec.md`。本对象与 validateManifest 同源
 * （常量复用，避免规范与校验器漂移），供插件开发者 / 编排工具 / IDE
 * 静态检查 manifest 时引用。
 */
const manifestSchema = {
  $id: 'https://lo.dev/specs/agent-plugin-manifest',
  title: 'lo-agent 插件 Manifest 规范',
  version: '0.1.0',
  required: [...REQUIRED_FIELDS],
  idPattern: ID_PATTERN.toString(),
  semanticVersion: SEMVER_PATTERN.toString(),
  contributesTypes: [...CONTRIBUTE_TYPES],
  permissionsLoValues: [...PERMISSION_LO_CAPABILITIES],
  activationEventPrefixes: [...ACTIVATION_TRIGGER_PREFIXES],
  properties: {
    id: {
      type: 'string',
      required: true,
      pattern: ID_PATTERN.toString(),
      description: '插件唯一 ID（kebab-case：小写字母/数字/中划线）',
    },
    name: { type: 'string', required: true, description: '插件显示名' },
    version: {
      type: 'string',
      required: true,
      pattern: SEMVER_PATTERN.toString(),
      description: '语义化版本 x.y.z',
    },
    main: { type: 'string', required: true, description: '插件入口文件（相对插件目录）' },
    description: { type: 'string', description: '插件说明' },
    author: { type: 'string', description: '作者' },
    agentVersion: { type: 'string', description: '兼容的 lo-agent 版本约束' },
    engines: {
      type: 'object',
      description: '环境约束',
      properties: {
        agent: { type: 'string', description: 'lo-agent 版本约束' },
        core: { type: 'string', description: 'lo Core 版本约束' },
      },
    },
    dependsOn: {
      type: 'array',
      items: { type: 'string', pattern: ID_PATTERN.toString() },
      description: '依赖插件 ID 列表（激活顺序：提供者先于消费者；不得依赖自身）',
    },
    ui: {
      type: 'string',
      description: '渲染端入口（mountEl UI）：单文件自包含 ESM，相对插件目录，如 ui/index.mjs',
    },
    activationEvents: {
      type: 'array',
      items: { type: 'string' },
      description: '延迟激活触发点：onStartup / *（启动激活）或 onCommand:<id> / onView:<id> / onPanel:<id> / onEditor:<id>',
    },
    contributes: {
      type: 'object',
      allowedTypes: [...CONTRIBUTE_TYPES],
      description: '扩展点纯数据声明（handler/render/api 属运行时 ctx.extensions 注册）',
      properties: {
        commands: {
          type: 'array',
          items: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, title: { type: 'string' } } },
        },
        views: {
          type: 'array',
          items: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, title: { type: 'string' }, type: { type: 'string' } } },
        },
        panels: { type: 'array', items: { type: 'object', required: ['id'] } },
        editors: { type: 'array', items: { type: 'object', required: ['id'] } },
        services: {
          type: 'array',
          items: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, title: { type: 'string' } } },
        },
      },
    },
    permissions: {
      type: 'object',
      description: '能力声明（最小权限：默认只读，无存储/网络/shell）',
      properties: {
        lo: {
          type: 'array',
          items: { type: 'string', allowedValues: [...PERMISSION_LO_CAPABILITIES] },
          description: '允许的 @lo/client 能力（ctx.lo 白名单）',
        },
        storage: { type: 'boolean', description: '是否可访问插件私有存储目录' },
        network: { type: 'boolean', description: '是否可发起网络请求（默认 false）' },
        shell: { type: 'boolean', description: '是否可执行外部命令（默认 false）' },
      },
    },
    config: {
      type: 'object',
      description: '配置 schema：key → { type, default?, description? }',
    },
  },
};

/**
 * 校验 manifest
 * @param {object} manifest
 * @returns {{ ok: true, manifest } | { ok: false, errors: string[] }}
 */
function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, errors: ['manifest 必须是普通对象'] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (typeof manifest[field] !== 'string' || !manifest[field].trim()) {
      errors.push(`manifest 缺少必填字符串字段 "${field}"`);
    }
  }

  if (manifest.id && !ID_PATTERN.test(manifest.id)) {
    errors.push(`manifest.id 非法: "${manifest.id}"(须为小写字母/数字/中划线,kebab-case)`);
  }

  if (manifest.version && !SEMVER_PATTERN.test(manifest.version)) {
    errors.push(`manifest.version 非法: "${manifest.version}"(须为 x.y.z 语义化版本)`);
  }

  if (manifest.engines && typeof manifest.engines !== 'object') {
    errors.push('manifest.engines 必须是对象({ agent?, core? })');
  }

  if (manifest.activationEvents !== undefined &&
    !Array.isArray(manifest.activationEvents)
  ) {
    errors.push('manifest.activationEvents 必须是字符串数组');
  } else if (Array.isArray(manifest.activationEvents)) {
    for (const ev of manifest.activationEvents) {
      if (typeof ev !== 'string' || !ACTIVATION_TRIGGER_PATTERN.test(ev)) {
        errors.push(
          `manifest.activationEvents 含非法触发点 "${ev}"（支持 onStartup / * / ` +
            `${ACTIVATION_TRIGGER_PREFIXES.map((p) => `${p}:<id>`).join(' / ')}）`,
        );
      }
    }
  }

  if (manifest.dependsOn !== undefined) {
    if (!Array.isArray(manifest.dependsOn)) {
      errors.push('manifest.dependsOn 必须是字符串数组（依赖插件 ID 列表）');
    } else {
      for (const dep of manifest.dependsOn) {
        if (typeof dep !== 'string' || !ID_PATTERN.test(dep)) {
          errors.push(`manifest.dependsOn 含非法插件 ID "${dep}"（须为 kebab-case）`);
        }
        if (dep === manifest.id) {
          errors.push(`manifest.dependsOn 不能依赖自身 (${dep})`);
        }
      }
    }
  }

  if (manifest.ui !== undefined && typeof manifest.ui !== 'string') {
    errors.push('manifest.ui 必须是字符串（渲染端入口文件，相对插件目录）');
  }

  if (manifest.contributes !== undefined) {
    if (typeof manifest.contributes !== 'object' || Array.isArray(manifest.contributes)) {
      errors.push('manifest.contributes 必须是对象');
    } else {
      for (const key of Object.keys(manifest.contributes)) {
        if (!CONTRIBUTE_TYPES.includes(key)) {
          errors.push(`manifest.contributes 含未知类型 "${key}"（支持: ${CONTRIBUTE_TYPES.join(', ')}）`);
        }
      }
    }
  }

  if (manifest.permissions !== undefined) {
    if (typeof manifest.permissions !== 'object' || Array.isArray(manifest.permissions)) {
      errors.push('manifest.permissions 必须是对象');
    } else {
      if (manifest.permissions.lo !== undefined) {
        if (!Array.isArray(manifest.permissions.lo)) {
          errors.push('manifest.permissions.lo 必须是字符串数组');
        } else {
          for (const cap of manifest.permissions.lo) {
            if (!PERMISSION_LO_CAPABILITIES.includes(cap)) {
              errors.push(
                `manifest.permissions.lo 含未知能力 "${cap}"（支持: ${PERMISSION_LO_CAPABILITIES.join(', ')}）`,
              );
            }
          }
        }
      }
      for (const boolField of ['storage', 'shell']) {
        if (
          manifest.permissions[boolField] !== undefined &&
          typeof manifest.permissions[boolField] !== 'boolean'
        ) {
          errors.push(`manifest.permissions.${boolField} 必须是 boolean`);
        }
      }
    }
  }

  if (
    manifest.config &&
    (typeof manifest.config !== 'object' ||
      Array.isArray(manifest.config) ||
      manifest.config === null)
  ) {
    errors.push('manifest.config 必须是对象({ key: { type, default, description } })');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, manifest };
}

module.exports = {
  validateManifest,
  manifestSchema,
  REQUIRED_FIELDS,
  ID_PATTERN,
  SEMVER_PATTERN,
  CONTRIBUTE_TYPES,
  PERMISSION_LO_CAPABILITIES,
  ACTIVATION_TRIGGER_PREFIXES,
  ACTIVATION_TRIGGER_PATTERN,
};
