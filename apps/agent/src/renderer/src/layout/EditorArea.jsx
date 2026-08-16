/**
 * EditorArea —— 编辑器分屏区（P1：VSCode Group 模型）
 *
 * 单个 group：tabs 栏 + 编辑器面板（toolbar/body/statusbar）。
 * 多 group：Allotment 水平并排（每个 group 一个 Pane），活动组高亮。
 * 数据模型：groups: [{ id, tabs: [tab], activeTabId }]，tab.id 为实例标识
 * （同一 rid 可在多个 group 双开，session/draft 实例独立）。
 */
import React from 'react';
import { Allotment } from 'allotment';

const { Pane } = Allotment;

/** 单个 group 的完整编辑器（tabs 栏 + toolbar + body + statusbar） */
export function GroupEditor({
  group,
  isActive,
  isOnly,
  onActivate,
  onActivateTab,
  onCloseTab,
  renderBody,
}) {
  const tab =
    group.tabs.find((t) => t.id === group.activeTabId) || group.tabs[0] || null;
  if (!tab) return null;
  const cls = `editor-group${isActive ? ' active' : ''}${isOnly ? ' only' : ''}`;
  return (
    <div
      className={cls}
      data-group={group.id}
      onClick={onActivate}
    >
      <div className="editor-tabs" role="tablist" onClick={(e) => e.stopPropagation()}>
        {group.tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === group.activeTabId}
            className={`editor-tab ${
              t.id === group.activeTabId ? 'active' : ''
            } ${t.text !== t.savedText || t.title !== t.savedTitle ? 'dirty' : ''}`}
            onClick={() => onActivateTab(t.id)}
          >
            <span className="editor-tab-name">{t.title}</span>
            {t.text !== t.savedText && (
              <span className="editor-tab-dirty-dot" title="未保存" />
            )}
            <button
              type="button"
              className="editor-tab-close"
              aria-label={`关闭 ${t.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(t.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {renderBody(tab, group)}
    </div>
  );
}

/**
 * 分屏容器：1 组直接渲染；多组 Allotment 水平并排。
 * @param {object} props
 * @param {Array} props.groups — [{ id, tabs, activeTabId }]
 * @param {string|null} props.activeGroupId
 * @param {(groupId:string)=>void} props.onActivateGroup
 * @param {(groupId:string, tabId:string)=>void} props.onActivateTab
 * @param {(tabId:string)=>void} props.onCloseTab
 * @param {(tab:object, group:object)=>React.ReactNode} props.renderBody
 * @param {()=>void} [props.onLayoutChange] — 分屏宽度变化 → 触发布局持久化
 */
export function EditorArea({
  groups,
  activeGroupId,
  onActivateGroup,
  onActivateTab,
  onCloseTab,
  renderBody,
  onLayoutChange,
}) {
  if (groups.length <= 1) {
    const group = groups[0];
    return (
      <GroupEditor
        group={group}
        isActive
        isOnly
        onActivate={() => onActivateGroup(group.id)}
        onActivateTab={(tabId) => onActivateTab(group.id, tabId)}
        onCloseTab={onCloseTab}
        renderBody={renderBody}
      />
    );
  }
  return (
    <Allotment
      className="editor-split"
      onDragEnd={() => {
        if (onLayoutChange) onLayoutChange();
      }}
      separator
    >
      {groups.map((g) => (
        <Pane key={g.id} className="editor-split-pane" minSize={240}>
          <GroupEditor
            group={g}
            isActive={g.id === activeGroupId}
            isOnly={false}
            onActivate={() => onActivateGroup(g.id)}
            onActivateTab={(tabId) => onActivateTab(g.id, tabId)}
            onCloseTab={onCloseTab}
            renderBody={renderBody}
          />
        </Pane>
      ))}
    </Allotment>
  );
}
