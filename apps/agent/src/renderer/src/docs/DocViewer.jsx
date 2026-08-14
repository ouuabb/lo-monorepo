/**
 * DocViewer.jsx —— 内置文档查看器
 *
 * 侧边栏展示 docs/nav.cjs 生成的导航分组，正文用 react-markdown 渲染
 * content/ 目录下的 Markdown。全部内容打包进 renderer，无需网络。
 */
import { Children, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildNav, findDoc, extractHeadings, slugify } from './nav.mjs';
import './docs.css';

const CONTENT_GLOB = import.meta.glob('./content/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** 以文件名索引的原始 Markdown 内容 */
const CONTENT_BY_FILE = Object.fromEntries(
  Object.entries(CONTENT_GLOB).map(([path, raw]) => [path.split('/').pop(), raw]),
);

/** 递归提取 React 节点的纯文本（标题锚点与代码复制共用） */
function childText(children) {
  let out = '';
  Children.forEach(children, (child) => {
    if (typeof child === 'string') out += child;
    else if (child && typeof child === 'object' && child.props) {
      out += childText(child.props.children);
    }
  });
  return out;
}

function CodeBlock(props) {
  const { children } = props;
  const text = childText(children);
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  return (
    <div className="code-block">
      <button className="code-copy" type="button" onClick={onCopy}>
        {copied ? '已复制' : '复制'}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

function DocViewer() {
  const nav = useMemo(() => buildNav(), []);
  const [activeId, setActiveId] = useState(nav[0].items[0].id);

  useEffect(() => {
    document.title = '文档 · lo-agent';
  }, []);

  const doc = findDoc(activeId);
  const raw = doc ? CONTENT_BY_FILE[doc.file] || '' : '';
  const headings = useMemo(() => extractHeadings(raw), [raw]);

  const fileToId = useMemo(() => {
    const m = {};
    nav.forEach((group) => group.items.forEach((item) => (m[item.file] = item.id)));
    return m;
  }, [nav]);

  const components = useMemo(() => {
    const make = (Tag) => (props) => (
      <Tag id={slugify(childText(props.children))}>{props.children}</Tag>
    );
    return {
      h1: make('h1'),
      h2: make('h2'),
      h3: make('h3'),
      h4: make('h4'),
      h5: make('h5'),
      h6: make('h6'),
      pre: (props) => <CodeBlock>{props.children}</CodeBlock>,
      a: (props) => {
        const { href, children } = props;
        const anchor = href && href.startsWith('#');
        let target = null;
        if (href && !anchor) {
          const p = href.startsWith('./') ? href.slice(2) : href;
          if (CONTENT_BY_FILE[p]) target = p;
        }
        return (
          <a
            href={href}
            target={anchor ? undefined : '_blank'}
            rel="noreferrer noopener"
            onClick={(e) => {
              if (anchor) return;
              e.preventDefault();
              if (target) {
                const id = fileToId[target];
                if (id) setActiveId(id);
              } else {
                window.open(href, '_blank', 'noopener');
              }
            }}
          >
            {children}
          </a>
        );
      },
    };
  }, [fileToId]);

  return (
    <div className="docs-layout">
      <aside className="docs-nav">
        {nav.map((group) => (
          <div key={group.title} className="docs-group">
            <h4 className="docs-group-title">{group.title}</h4>
            <ul>
              {group.items.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className={item.id === activeId ? 'active' : ''}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveId(item.id);
                    }}
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      <section className="docs-content">
        <article className="docs-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {raw}
          </ReactMarkdown>
        </article>
        {headings.length > 0 && (
          <nav className="docs-toc">
            <h5>本页目录</h5>
            <ul>
              {headings.map((h) => (
                <li key={h.slug} style={{ paddingLeft: (h.level - 1) * 10 }}>
                  <a href={`#${h.slug}`}>{h.text}</a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </section>
    </div>
  );
}

export default DocViewer;
