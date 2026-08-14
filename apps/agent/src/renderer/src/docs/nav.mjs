/**
 * docs-nav.mjs —— 内置文档的目录/导航纯逻辑（与渲染框架无关）
 *
 * 由 renderer 的 DocViewer 使用，同时可被 Node 测试直接 import：
 *   - buildNav()          生成侧边栏分组结构
 *   - extractHeadings()   从 Markdown 提取 { level, slug, text } 供页内 TOC
 *   - slugify()           GitHub 风格锚点
 */

/** 文档目录清单（顺序即侧边栏顺序）。file 对应 content/ 下的文件名。 */
const DOC_GROUPS = [
  {
    title: '指南',
    items: [
      { id: 'index', title: '文档中心', file: 'index.md' },
      { id: 'quickstart', title: '快速开始', file: 'quickstart.md' },
      { id: 'intro', title: '功能特性', file: 'intro.md' },
    ],
  },
  {
    title: '实现',
    items: [
      { id: 'architecture', title: '架构总览', file: 'architecture.md' },
      { id: 'connect', title: '连接配置', file: 'connect.md' },
      { id: 'auth', title: '认证流程', file: 'auth.md' },
      { id: 'content', title: '状态与资源', file: 'content.md' },
    ],
  },
  {
    title: '参考',
    items: [
      { id: 'security', title: '安全基线', file: 'security.md' },
      { id: 'api', title: 'API 参考', file: 'api.md' },
      { id: 'develop', title: '开发指南', file: 'develop.md' },
    ],
  },
];

/** 拍平为 id → item 映射 */
function flatIndex(groups = DOC_GROUPS) {
  return groups.reduce((acc, group) => {
    group.items.forEach((item) => {
      acc[item.id] = item;
    });
    return acc;
  }, {});
}

/**
 * 生成侧边栏导航结构
 * @returns {Array<{ title: string, items: Array<{ id, title, file }> }>}
 */
function buildNav(groups = DOC_GROUPS) {
  return groups.map((group) => ({
    title: group.title,
    items: group.items.map((item) => ({ id: item.id, title: item.title, file: item.file })),
  }));
}

/** 按 id 查找文档条目；不存在时返回 null */
function findDoc(id, groups = DOC_GROUPS) {
  const flat = flatIndex(groups);
  return flat[id] || null;
}

/**
 * 从 Markdown 提取标题（h1~h6）用于页内目录
 * @param {string} md
 * @returns {Array<{ level: number, slug: string, text: string }>}
 */
function extractHeadings(md) {
  if (!md) return [];
  const seen = {};
  const out = [];
  const re = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
  let match;
  while ((match = re.exec(md)) !== null) {
    const level = match[1].length;
    const text = match[2].replace(/[*_`]/g, '').trim();
    const base = slugify(text);
    const count = seen[base] || 0;
    seen[base] = count + 1;
    const slug = count === 0 ? base : `${base}-${count}`;
    out.push({ level, slug, text });
  }
  return out;
}

/** GitHub 风格 slug：小写、去符号、空格转中划线 */
function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export { DOC_GROUPS, buildNav, findDoc, flatIndex, extractHeadings, slugify };
