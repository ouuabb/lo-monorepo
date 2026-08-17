/**
 * MarkdownPreview.jsx —— 只读 Markdown 预览（含 RID-embed 图片渲染）
 *
 * 支持：
 *   - ![alt](res_xxx)        → 通过 MarkdownImage 渲染
 *   - <img src="res_xxx">    → 通过 MarkdownImage 渲染
 *   - 远程 URL (https://)    → 直接交给浏览器渲染（Markdown 原生外部引用）
 *   - 其他 Markdown 元素     → 极简语法子集（heading/list/paragraph/code/link）
 *
 * 注：完整 Markdown 渲染交给将来插件 viewer 提供；本组件满足「RID 图片能显示」的最小闭环。
 * 不引入额外 Markdown 库（保持零依赖）。
 */
import { useMemo } from 'react';
import MarkdownImage from './MarkdownImage.jsx';

const RID_REGEX_GLOBAL = /res_[a-z0-9]{8,}_[a-f0-9]+/i;

function renderInline(text, keyPrefix) {
  // 极简 inline 解析：code + link + bold + italic + image
  const tokens = [];
  const rest = text;
  let idx = 0;
  const regex = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(!\[([^\]]*)\]\(([^)]+)\))|(<img\s+[^>]*?src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*?\/?>)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let m;
  while ((m = regex.exec(rest)) !== null) {
    if (m.index > idx) tokens.push({ type: 'text', value: rest.slice(idx, m.index) });
    if (m[1]) {
      tokens.push({ type: 'code', value: m[1].slice(1, -1) });
    } else if (m[2]) {
      const linkMatch = m[2].match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        tokens.push({ type: 'link', label: linkMatch[1], href: linkMatch[2] });
      }
    } else if (m[3]) {
      // Markdown image
      const alt = m[4] || '';
      const target = m[5];
      if (RID_REGEX_GLOBAL.test(target)) {
        tokens.push({ type: 'image-rid', rid: target, alt });
      } else {
        // 远程图片或本地路径 → 浏览器原生 <img>
        tokens.push({ type: 'image-raw', src: target, alt });
      }
    } else if (m[6]) {
      // HTML <img>
      const src = m[7];
      const alt = m[8] || '';
      if (RID_REGEX_GLOBAL.test(src)) {
        tokens.push({ type: 'image-rid', rid: src, alt });
      } else {
        tokens.push({ type: 'image-raw', src, alt });
      }
    } else if (m[9]) {
      tokens.push({ type: 'bold', value: m[9].slice(2, -2) });
    } else if (m[10]) {
      tokens.push({ type: 'italic', value: m[10].slice(1, -1) });
    }
    idx = regex.lastIndex;
  }
  if (idx < rest.length) tokens.push({ type: 'text', value: rest.slice(idx) });
  return tokens.map((t, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (t.type) {
      case 'code': return <code key={key}>{t.value}</code>;
      case 'link': return <a key={key} href={t.href} target="_blank" rel="noreferrer">{t.label}</a>;
      case 'image-rid': return <MarkdownImage key={key} rid={t.rid} alt={t.alt} />;
      case 'image-raw': return <img key={key} src={t.src} alt={t.alt} />;
      case 'bold': return <strong key={key}>{t.value}</strong>;
      case 'italic': return <em key={key}>{t.value}</em>;
      default: return <span key={key}>{t.value}</span>;
    }
  });
}

function renderBlock(text) {
  // 极简 block 解析：heading / paragraph / code-fence / list
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let paraBuf = [];
  let listBuf = [];
  let codeBuf = [];
  let inCode = false;
  let codeLang = null;

  const flushPara = () => {
    if (paraBuf.length > 0) {
      const para = paraBuf.join(' ');
      blocks.push({ type: 'p', lines: [para] });
      paraBuf = [];
    }
  };
  const flushList = () => {
    if (listBuf.length > 0) {
      blocks.push({ type: 'ul', items: listBuf });
      listBuf = [];
    }
  };

  lines.forEach((line) => {
    if (line.startsWith('```')) {
      if (inCode) {
        blocks.push({ type: 'code', lang: codeLang, content: codeBuf.join('\n') });
        codeBuf = [];
        inCode = false;
        codeLang = null;
      } else {
        flushPara();
        flushList();
        inCode = true;
        codeLang = line.slice(3).trim() || null;
      }
      return;
    }
    if (inCode) {
      codeBuf.push(line);
      return;
    }
    if (/^#{1,6}\s+/.test(line)) {
      flushPara();
      flushList();
      const m = line.match(/^(#{1,6})\s+(.*)$/);
      blocks.push({ type: 'h', level: m[1].length, lines: [m[2]] });
      return;
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      listBuf.push(line.replace(/^[-*]\s+/, ''));
      return;
    }
    if (line.trim() === '') {
      flushPara();
      flushList();
      return;
    }
    flushList();
    paraBuf.push(line);
  });
  flushPara();
  flushList();
  if (inCode && codeBuf.length > 0) {
    blocks.push({ type: 'code', lang: codeLang, content: codeBuf.join('\n') });
  }
  return blocks;
}

export default function MarkdownPreview({ value = '', rid = null, readOnly = true }) {
  const blocks = useMemo(() => renderBlock(value), [value]);
  return (
    <div className="markdown-preview" data-rid={rid || undefined}>
      {blocks.map((b, i) => {
        const key = `blk-${i}`;
        switch (b.type) {
          case 'h':
            return (
              <h1 key={key} style={{ fontSize: `${1.6 - b.level * 0.1}em` }}>
                {renderInline(b.lines.join(' '), key)}
              </h1>
            );
          case 'ul':
            return (
              <ul key={key}>
                {b.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case 'code':
            return (
              <pre key={key} className="markdown-preview-code">
                <code data-lang={b.lang || undefined}>{b.content}</code>
              </pre>
            );
          case 'p':
            return <p key={key}>{renderInline(b.lines.join(' '), key)}</p>;
          default:
            return null;
        }
      })}
    </div>
  );
}
