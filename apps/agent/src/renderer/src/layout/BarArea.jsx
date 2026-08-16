/**
 * 栏管理器（BarArea / Bar / MainArea）—— allotment（VSCode 风格）实现
 *
 * 布局树（P0）：
 *   BarArea（root Allotment 水平）
 *   ├── Pane#sidebar：侧边栏（visible 折叠、拖拽调宽、双击重置、snap）
 *   └── Pane#main
 *       └── MainArea（Allotment 水平）
 *           ├── Pane#editor：编辑器（tabs + 编辑器实例）
 *           └── 右侧栏 Pane#plugin / Pane#settings / Pane#relations（各自显隐开关）
 *
 * 交互（allotment 内置）：拖拽调宽（双向）、双击 sash 重置（回到 preferredSize）、
 * 折叠（visible=false 自动缓存/恢复尺寸）、snap（拖到边界收起）。
 * 非管理区（rail 列、顶栏、汉堡按钮）不经过本组件。
 */
import React from 'react';
import { Allotment } from 'allotment';
import {
  DEFAULT_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
} from './paneLayout.mjs';

const { Pane } = Allotment;

/**
 * root 区：sidebar + main 两栏。
 * @param {object} props
 * @param {number} props.sidebarWidth — 侧栏当前宽度（defaultSizes 初始值）
 * @param {boolean} props.sidebarVisible — 侧栏是否可见（折叠 = false）
 * @param {(width:number)=>void} [props.onSidebarSize] — 拖拽结束回读侧栏宽度
 * @param {()=>void} [props.onLayoutChange] — 布局变化（拖拽/折叠/双击），触发持久化
 */
export function BarArea({
  sidebarWidth = DEFAULT_SIDEBAR_WIDTH,
  sidebarVisible = true,
  onSidebarSize,
  onLayoutChange,
  children,
}) {
  const [sidebar, main] = React.Children.toArray(children);
  return (
    <Allotment
      className="bar-area"
      defaultSizes={[sidebarWidth, 1]}
      onDragEnd={(sizes) => {
        if (onSidebarSize && Array.isArray(sizes)) onSidebarSize(Math.round(sizes[0]));
        if (onLayoutChange) onLayoutChange();
      }}
      onVisibleChange={() => {
        if (onLayoutChange) onLayoutChange();
      }}
      onReset={() => {
        if (onLayoutChange) onLayoutChange();
      }}
      separator={false}
    >
      <Pane
        className="bar-sidebar-pane"
        preferredSize={DEFAULT_SIDEBAR_WIDTH}
        minSize={MIN_SIDEBAR_WIDTH}
        maxSize={MAX_SIDEBAR_WIDTH}
        snap
        visible={sidebarVisible}
      >
        {sidebar}
      </Pane>
      <Pane className="bar-main-pane">{main}</Pane>
    </Allotment>
  );
}

/**
 * main 区：编辑器 + 右侧栏（plugin/settings/relations）平级横排。
 * @param {object} props
 * @param {()=>void} [props.onLayoutChange] — 布局变化，触发持久化
 */
export function MainArea({ onLayoutChange, children }) {
  return (
    <Allotment
      className="bar-area-main"
      onDragEnd={() => {
        if (onLayoutChange) onLayoutChange();
      }}
      onReset={() => {
        if (onLayoutChange) onLayoutChange();
      }}
      separator
    >
      {children}
    </Allotment>
  );
}

/**
 * 单个栏（Pane 包装）：统一横向排列、独立滚动、互不干扰。
 * 传入 onClose 时渲染栏头（标题 + 关闭按钮），关闭按钮直接控制整栏显隐。
 * @param {object} props — visible/preferredSize/minSize/maxSize/snap 透传 allotment Pane
 */
export function Bar({
  id,
  className = '',
  visible = true,
  preferredSize,
  minSize,
  maxSize,
  snap,
  title,
  onClose,
  children,
}) {
  const cls = `bar bar-${id}${className ? ` ${className}` : ''}`;
  return (
    <Pane
      className={cls}
      visible={visible}
      preferredSize={preferredSize}
      minSize={minSize}
      maxSize={maxSize}
      snap={snap}
    >
      {onClose
        ? React.createElement(
            'div',
            { className: 'bar-header' },
            React.createElement('span', { className: 'bar-title' }, title || ''),
            React.createElement(
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
        : null}
      {onClose ? React.createElement('div', { className: 'bar-body' }, children) : children}
    </Pane>
  );
}
