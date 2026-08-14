/**
 * lo-monorepo 文档展示壳（VitePress）
 *
 * - 内容源：../meta（唯一文档 SoT）
 * - 站点：GitHub Pages 子路径 /lo-monorepo/（base）
 */
import { defineConfig } from 'vitepress';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const metaRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'meta');

/** 递归生成 sidebar 树 */
function tree(relDir) {
  const dir = path.join(metaRoot, relDir);
  if (!fs.existsSync(dir)) return [];
  const items = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const rel = `${relDir}/${name}`;
    if (fs.statSync(full).isDirectory()) {
      items.push({ text: name, collapsed: true, items: tree(rel) });
    } else if (name.endsWith('.md')) {
      items.push({ text: name.replace(/\.md$/, ''), link: `/${rel.replace(/\\/g, '/').replace(/\.md$/, '')}` });
    }
  }
  return items;
}

export default defineConfig({
  lang: 'zh-CN',
  title: 'lo · 生态文档中心',
  description: 'lo 生态唯一正式文档 Source of Truth（meta）+ VitePress 展示',
  base: '/lo-monorepo/',
  srcDir: '../meta',
  outDir: 'dist',
  cleanOutDir: true,
  lastUpdated: true,
  // 迁移内容（meta/core、agent、plugins-sdk 等）含旧 vitepress 内部链接，不阻断构建；
  // 策展文档的链接完整性由 meta/scripts/docs-check.cjs 校验
  ignoreDeadLinks: true,
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '总纲', link: '/AGENTS' },
      { text: '架构', link: '/architecture/index' },
      { text: '规格', link: '/specs/001-execution-context-protocol' },
      { text: '设计决策', link: '/design/index' },
    ],
    sidebar: {
      '/': [
        { text: '文档中心', link: '/index', items: tree('.') },
      ],
    },
    outline: { level: [2, 3], label: '本页' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '更新于', formatOptions: { dateStyle: 'short', timeStyle: 'short' } },
  },
});
