/**
 * docs-gen.cjs —— 生成 meta 机器事实文档（唯一文档源的机器事实层）
 *
 * 生成（幂等）：
 *   1. meta/api/ipc-channels.md   —— 从 apps/agent 源码 CHANNELS/CHANNEL 常量提取
 *   2. meta/plugins/core.md        —— 从 plugins/core/packages/<id>/plugin.json 生成
 *   3. meta/plugins/agent.md       —— 从 plugins/agent/packages/<id>/plugin.json 生成
 *
 * 机器事实勿手写；改动源码/manifest 后运行 `pnpm --filter lo-meta docs` 重新生成。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..'); // monorepo 根
const OUT = {
  ipc: path.join(ROOT, 'meta', 'api', 'ipc-channels.md'),
  'plugins/core': path.join(ROOT, 'meta', 'plugins', 'core.md'),
  'plugins/agent': path.join(ROOT, 'meta', 'plugins', 'agent.md'),
};

/** 提取 `KEY: 'prefix:...'` 通道常量 */
function extractChannels(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const re = /^\s*([A-Z][A-Z0-9_]*):\s*'((?:lo-core|agent-plugins|window):[^']+)'/gm;
  const out = [];
  let m;
  while ((m = re.exec(txt)) !== null) out.push({ key: m[1], channel: m[2] });
  return out;
}

function genIpcChannels() {
  const sources = {
    'apps/agent/src/main/ipc.cjs': extractChannels(path.join(ROOT, 'apps', 'agent', 'src', 'main', 'ipc.cjs')),
    'apps/agent/src/main/plugin/plugin-ipc.cjs': extractChannels(path.join(ROOT, 'apps', 'agent', 'src', 'main', 'plugin', 'plugin-ipc.cjs')),
    'apps/agent/src/main/index.cjs': extractChannels(path.join(ROOT, 'apps', 'agent', 'src', 'main', 'index.cjs')),
  };
  const prefixDef = {
    'lo-core:': { title: 'lo-core:*（App ↔ Core 能力桥）', file: 'apps/agent/src/main/ipc.cjs' },
    'agent-plugins:': { title: 'agent-plugins:*（插件能力白名单）', file: 'apps/agent/src/main/plugin/plugin-ipc.cjs' },
    'window:': { title: 'window:*（窗口控制）', file: 'apps/agent/src/main/index.cjs' },
  };
  const lines = [
    '# IPC 白名单通道目录',
    '',
    '> 由 `meta/scripts/docs-gen.cjs` 从 apps/agent 源码 CHANNELS 常量**自动生成**，勿手改。',
    '',
  ];
  for (const [prefix, meta] of Object.entries(prefixDef)) {
    lines.push(`## ${meta.title}`, '', '| key | channel | 定义文件 |', '|---|---|---|');
    const seen = new Set();
    for (const [file, rows] of Object.entries(sources)) {
      for (const r of rows) {
        if (!r.channel.startsWith(prefix) || seen.has(r.channel)) continue;
        seen.add(r.channel);
        lines.push(`| \`${r.key}\` | \`${r.channel}\` | \`${meta.file}\` |`);
      }
    }
    lines.push('');
  }
  lines.push('## 说明', '', '- renderer 只经 preload 白名单调用；通道逐一绑定主进程具体方法，不透传任意调用/实例。');
  lines.push('- 渲染侧映射见 `meta/architecture/agent.md`。', '');
  return lines.join('\n');
}

function readManifest(pkgDir) {
  return JSON.parse(fs.readFileSync(path.join(pkgDir, 'plugin.json'), 'utf8'));
}

const CONTRIBUTE_TYPES = ['commands', 'views', 'panels', 'editors', 'services'];

function genPluginCatalog(relDir, title) {
  const dir = path.join(ROOT, relDir, 'packages');
  if (!fs.existsSync(dir)) return `# ${title}\n\n> 暂无插件。\n`;
  const ids = fs.readdirSync(dir).sort();
  const lines = [`# ${title}`, '', `> 由 \`meta/scripts/docs-gen.cjs\` 从 \`${relDir}/packages/\` 下各插件 \`plugin.json\` **自动生成**，勿手改。`, ''];
  for (const id of ids) {
    const pkgDir = path.join(dir, id);
    if (!fs.statSync(pkgDir).isDirectory()) continue;
    if (!fs.existsSync(path.join(pkgDir, 'plugin.json'))) continue;
    const m = readManifest(pkgDir);
    const contributes = m.contributes || {};
    lines.push(`### ${m.id}`, '', '| 项 | 值 |', '|---|---|');
    lines.push(`| name | ${m.name} |`, `| version | ${m.version} |`, `| main | \`${m.main}\` |`);
    lines.push(`| ui | ${m.ui ? '`' + m.ui + '`' : '—'} |`);
    lines.push(`| dependsOn | ${Array.isArray(m.dependsOn) && m.dependsOn.length ? m.dependsOn.map((x) => '`' + x + '`').join('、') : '—'} |`);
    lines.push(`| activationEvents | ${Array.isArray(m.activationEvents) && m.activationEvents.length ? m.activationEvents.map((x) => '`' + x + '`').join('、') : '—'} |`);
    lines.push(`| permissions.lo | ${Array.isArray(m.permissions && m.permissions.lo) && m.permissions.lo.length ? m.permissions.lo.map((x) => '`' + x + '`').join('、') : '—'} |`);
    lines.push(`| config | ${m.config && Object.keys(m.config).length ? Object.keys(m.config).map((k) => '`' + k + '`').join('、') : '—'} |`, '');
    lines.push(`**contributes**：${CONTRIBUTE_TYPES.map((t) => `${t}(${(contributes[t] || []).length})`).join(' · ')}`, '');
    for (const t of CONTRIBUTE_TYPES) {
      const items = contributes[t] || [];
      if (items.length) lines.push(`- **${t}**：${items.map((x) => '`' + x.id + '`').join('、')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function generate() {
  return {
    'meta/api/ipc-channels.md': genIpcChannels(),
    'meta/plugins/core.md': genPluginCatalog('plugins/core', 'Core 插件目录（lo-plugins）'),
    'meta/plugins/agent.md': genPluginCatalog('plugins/agent', '客户端插件目录（lo-agent-plugins）'),
  };
}

if (require.main === module) {
  for (const [rel, content] of Object.entries(generate())) {
    const p = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
    console.log(`✓ ${rel}`);
  }
}

module.exports = { generate, extractChannels };
