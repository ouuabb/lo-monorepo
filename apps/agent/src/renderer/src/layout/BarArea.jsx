/**
 * 栏管理器（BarArea / Bar）
 *
 * 负责管理区域内所有栏的横向排列：
 *   - sidebar：第一栏（左侧第一栏，紧挨 rail 列），固定宽度、常驻
 *   - plugin / settings / editor：其余栏，均分侧边栏外的剩余空间，互不干扰
 *
 * 非管理区（rail 列、顶栏、汉堡按钮）不经过本组件。
 */
import { createElement } from 'react';

/** 管理区域容器：横向排列所有栏 */
export function BarArea({ children }) {
  return createElement('div', { className: 'bar-area' }, children);
}

/**
 * 单个栏：统一横向排列、独立滚动、互不干扰。
 * 传入 onClose 时渲染栏头（标题 + 关闭按钮），关闭按钮直接控制整栏显隐。
 */
export function Bar({ id, className = '', style, title, onClose, children }) {
  const cls = `bar bar-${id}${className ? ` ${className}` : ''}`;
  return createElement(
    'section',
    { className: cls, style, 'data-bar': id },
    onClose
      ? createElement(
          'div',
          { className: 'bar-header' },
          createElement('span', { className: 'bar-title' }, title || ''),
          createElement(
            'button',
            {
              type: 'button',
              className: 'bar-close',
              'aria-label': `关闭${title || '栏'}`,
              onClick: onClose,
            },
            '×',
          ),
        )
      : null,
    onClose ? createElement('div', { className: 'bar-body' }, children) : children,
  );
}
