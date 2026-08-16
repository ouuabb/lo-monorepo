import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PluginUiMount from './plugin/PluginUiMount.jsx';
import { hasUi } from './plugin/pluginUi.js';
import { BarArea, Bar, MainArea } from './layout/BarArea.jsx';
import {
  applyLayout,
  buildLayout,
  DEFAULT_SIDEBAR_WIDTH,
} from './layout/paneLayout.mjs';
import CoreViewPanel from './views/ViewPanel.jsx';
import GraphView from './views/GraphView.jsx';
import { revealFeedback } from './services/revealFeedback.mjs';
import { createSession, toggleReadOnly as toggleSessionReadOnly, resolveReadOnly } from './services/SessionService.mjs';
import { resolveViewerComponent } from './services/viewerRegistry.js';
import './App.css';

const api = window.loAgent && window.loAgent.loCore;

function formatTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

const SUB_NAV = [
  { id: 'workspace', label: '控制台' },
  { id: 'history', label: '历史' },
  { id: 'settings', label: '文件设置' },
  { id: 'views', label: '视图' },
  { id: 'graph', label: '图谱' },
];

export default function App() {
  const [view, setView] = useState('workspace');
  const [subOpen, setSubOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pluginView, setPluginView] = useState(false);
  const [pluginTab, setPluginTab] = useState('commands');
  const [relationsOpen, setRelationsOpen] = useState(true);
  const [config, setConfig] = useState({ host: '127.0.0.1', port: 8765, protocol: 'http' });
  const [privateKeyPath, setPrivateKeyPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
const [repoCtx, setRepoCtx] = useState(null);
  const [notes, setNotes] = useState([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [message, setMessage] = useState('');
  const [tabs, setTabs] = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [ctxMenu, setCtxMenu] = useState(null);
  const readOnlyOverridesRef = useRef(new Set());
  const [autoSave, setAutoSave] = useState(false);
  const [pluginViewers, setPluginViewers] = useState([]);
  const discardKeyRef = useRef(null);
  const deleteRidRef = useRef(null);
  const toastTimerRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const layoutTimerRef = useRef(null);
  const [toastCopied, setToastCopied] = useState(false);

  const notify = useCallback((text) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
    setMessage(text);
    if (text) {
      toastTimerRef.current = setTimeout(() => setMessage(''), 4000);
    }
  }, []);

  const activeTab = tabs.find((t) => t.key === activeKey) || null;
  const isDirty = (tab) =>
    !!tab &&
    (tab.session.state.readOnly
      ? false
      : tab.text !== tab.savedText ||
        tab.title !== tab.savedTitle ||
        tab.tagsText !== tab.savedTagsText ||
        tab.category !== tab.savedCategory);

  useEffect(() => {
    if (!api) {
      notify('preload 未就绪，无法连接 lo 核心');
      return;
    }
    let cancelled = false;
    api
      .getConfig()
      .then(async (c) => {
        if (cancelled) return;
        if (!c || !c.host) return;
        setConfig((prev) => ({ ...prev, ...c }));
        setPrivateKeyPath(c.privateKeyPath || '');
        if (c.privateKeyPath) {
          const { host, port, protocol } = c;
          const cfg = await api.configure({ host, port, protocol });
          if (cfg.ok) {
            const res = await api.login({ privateKeyPath: c.privateKeyPath });
            if (res.ok) {
              setAuthenticated(true);
              notify(`已自动登录 fingerprint=${res.fingerprint || '-'}`);
              handleRefresh();
            }
          }
        }
      })
      .catch((e) => notify(`读取配置失败: ${e.message}`));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConfigure = useCallback(async () => {
    if (!api) return;
    setBusy(true);
    notify('');
    const res = await api.configure(config);
    setBusy(false);
    if (res.ok) notify(`已连接 ${res.config.host}:${res.config.port}`);
    else notify(`配置失败: ${res.message}`);
  }, [config]);

  const handleLogin = useCallback(async () => {
    if (!api) return;
    setBusy(true);
    notify('');
    const res = await api.login({ privateKeyPath: privateKeyPath || undefined });
    setBusy(false);
    if (res.ok) {
      setAuthenticated(true);
      notify(`登录成功 fingerprint=${res.fingerprint || '-'}`);
      setLoginOpen(false);
      handleRefresh();
    } else {
      notify(`登录失败: ${res.message}`);
    }
  }, [privateKeyPath]);

  const handleRefresh = useCallback(async () => {
    if (!api) return;
    setBusy(true);
    notify('');
    const [statusRes, notesRes, repoRes] = await Promise.all([
      api.getStatus(),
      api.listNotes({ limit: 50 }),
      api.repository.info(),
    ]);
    setBusy(false);
    if (statusRes.ok) setStatus(statusRes.stats);
    else notify(`获取状态失败: ${statusRes.message}`);
    if (notesRes.ok) setNotes(notesRes.data);
    else notify(`获取资源列表失败: ${notesRes.message}`);
    if (repoRes && repoRes.ok) {
      setRepoCtx({
        repositoryId: repoRes.info.repositoryId,
        currentPath: repoRes.info.path,
        connectionState: 'connected',
      });
    } else {
      setRepoCtx((prev) =>
        prev ? { ...prev, connectionState: 'disconnected' } : null,
      );
    }
  }, []);

  const handleLogout = useCallback(async () => {
    if (!api) return;
    await api.logout();
    setAuthenticated(false);
    setStatus(null);
    setRepoCtx(null);
    setNotes([]);
    setTabs([]);
    setActiveKey(null);
    notify('已登出');
  }, []);

  const openResource = useCallback(
    async (n) => {
      if (!api || !n) return;
      const existing = tabs.find((t) => t.rid === n.rid);
      if (existing) {
        setActiveKey(existing.key);
        return;
      }
      setBusy(true);
      notify('');
      try {
        const session = await createSession(n, api, readOnlyOverridesRef.current);
        const res = await api.getNote(n.rid);
        if (res.ok && res.data) {
          setRelationsOpen(true);
          const data = res.data;
          const meta = data.metadata || {};
          const tabTitle = n.name || n.rid;
          const tabTags = Array.isArray(data.tags) ? data.tags.join(', ') : '';
          const tab = {
            key: n.rid,
            rid: n.rid,
            type: n.type || data.type || 'resource',
            title: tabTitle,
            tagsText: tabTags,
            category: meta.category || '',
            text: data.content || '',
            savedText: data.content || '',
            savedTitle: tabTitle,
            savedTagsText: tabTags,
            savedCategory: meta.category || '',
            session,
            meta: {
              rid: n.rid,
              type: n.type || data.type || 'resource',
              updatedAt: data.updatedAt || data.lastModified || null,
              size: data.size != null ? data.size : (data.content || '').length,
              schema: data.schema || null,
            },
          };
          setTabs((prev) => [...prev, tab]);
          setActiveKey(tab.key);
        } else {
          notify(`打开资源失败: ${res.message}`);
        }
      } catch (e) {
        notify(`打开资源失败: ${e.message}`);
      } finally {
        setBusy(false);
      }
    },
    [api, tabs],
  );

  const setActiveText = useCallback(
    (text) => {
      setTabs((prev) => prev.map((t) => (t.key === activeKey ? { ...t, text } : t)));
    },
    [activeKey],
  );

  const closeTab = useCallback(
    (key) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.key === key);
        const next = prev.filter((t) => t.key !== key);
        if (activeKey === key) {
          const fallback = next[Math.max(0, idx - 1)];
          setActiveKey(fallback ? fallback.key : null);
        }
        return next;
      });
    },
    [activeKey],
  );

  const requestCloseTab = useCallback(
    (key) => {
      const tab = tabs.find((t) => t.key === key);
      if (tab && isDirty(tab)) {
        discardKeyRef.current = key;
        setConfirmDiscard(true);
      } else {
        closeTab(key);
      }
    },
    [tabs, isDirty, closeTab],
  );

  // 标题框 = Resource name（018：rename 入口）；tab.title 为 UI 变量，落库走 body.name
  const setActiveTitle = useCallback(
    (title) => {
      setTabs((prev) => prev.map((t) => (t.key === activeKey ? { ...t, title } : t)));
    },
    [activeKey],
  );

  const setActiveTagsText = useCallback(
    (tagsText) => {
      setTabs((prev) => prev.map((t) => (t.key === activeKey ? { ...t, tagsText } : t)));
    },
    [activeKey],
  );

  const setActiveCategory = useCallback(
    (category) => {
      setTabs((prev) => prev.map((t) => (t.key === activeKey ? { ...t, category } : t)));
    },
    [activeKey],
  );

  const saveActiveTab = useCallback(
    async (silent = false) => {
      if (!api || !activeTab || activeTab.session.state.readOnly) return;
      if (!silent) notify('');
      const body = { content: activeTab.text };
      if (activeTab.title !== activeTab.savedTitle) body.name = activeTab.title;
      if (activeTab.tagsText !== activeTab.savedTagsText) {
        body.tags = activeTab.tagsText
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean);
      }
      if (activeTab.category !== activeTab.savedCategory) {
        body.category = activeTab.category.trim();
      }
      const res = await api.updateNote(activeTab.rid, body);
      if (res.ok) {
        setTabs((prev) =>
          prev.map((t) =>
            t.key === activeTab.key
              ? {
                  ...t,
                  savedText: t.text,
                  savedTitle: t.title,
                  savedTagsText: t.tagsText,
                  savedCategory: t.category,
                }
              : t,
          ),
        );
        if (!silent) notify('已保存');
        handleRefresh();
      } else {
        notify(`保存失败: ${res.message}`);
      }
    },
    [api, activeTab, handleRefresh],
  );

  useEffect(() => {
    if (!autoSave) return undefined;
    const tab = tabs.find((t) => t.key === activeKey);
    if (!tab || tab.session.state.readOnly || !isDirty(tab)) return undefined;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      saveActiveTab(true);
    }, 1000);
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [tabs, activeKey, autoSave, saveActiveTab, isDirty]);

  const createNote = useCallback(async () => {
    if (!api) return;
    if (typeof api.createNote !== 'function') {
      notify('新建功能需重启应用后生效');
      return;
    }
    setBusy(true);
    notify('');
    try {
      const res = await api.createNote({ content: '', name: '未命名笔记' });
      if (res.ok && res.data && res.data.rid) {
        notify('已创建');
        handleRefresh();
        await openResource({ rid: res.data.rid, type: 'note', name: '未命名笔记' });
      } else {
        notify(`创建失败: ${res.message}`);
      }
    } catch (e) {
      notify(`创建失败: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }, [api, openResource, handleRefresh]);

  const importFiles = useCallback(
    async (fileList) => {
      if (!api || !fileList || fileList.length === 0) return;
      if (typeof api.uploadNotes !== 'function') {
        notify('导入功能需重启应用后生效');
        return;
      }
      setBusy(true);
      notify('');
      try {
        const files = await Promise.all(
          Array.from(fileList).map(async (f) => ({
            name: f.name,
            data: await f.arrayBuffer(),
            contentType: f.type || undefined,
          })),
        );
        const res = await api.uploadNotes(files, {});
        if (res.ok) {
          notify(`已导入 ${res.data.uploaded} 个文件`);
          handleRefresh();
        } else {
          notify(`导入失败: ${res.message}`);
        }
      } catch (e) {
        notify(`导入失败: ${e.message}`);
      } finally {
        setBusy(false);
      }
    },
    [api, handleRefresh],
  );

  const requestDeleteNote = useCallback((rid) => {
    const target = rid || (activeTab && activeTab.rid);
    if (!target) return;
    deleteRidRef.current = target;
    setConfirmDelete(true);
  }, [activeTab]);

  const toggleReadOnly = useCallback((rid) => {
    setTabs((prev) => {
      let nextOverrides = readOnlyOverridesRef.current;
      const updated = prev.map((t) => {
        if (t.rid !== rid) return t;
        const { nextSession, nextOverrides: ov } = toggleSessionReadOnly(
          t.session,
          rid,
          nextOverrides,
        );
        nextOverrides = ov;
        return { ...t, session: nextSession };
      });
      readOnlyOverridesRef.current = nextOverrides;
      return updated;
    });
  }, []);

  const confirmDeleteNote = useCallback(async () => {
    const rid = deleteRidRef.current;
    deleteRidRef.current = null;
    setConfirmDelete(false);
    if (!api || !rid) return;
    if (typeof api.removeNote !== 'function') {
      notify('删除功能需重启应用后生效');
      return;
    }
    setBusy(true);
    notify('');
    try {
      const res = await api.removeNote(rid);
      if (res.ok) {
        notify('已删除');
        closeTab(rid);
        handleRefresh();
      } else {
        notify(`删除失败: ${res.message}`);
      }
    } catch (e) {
      notify(`删除失败: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }, [api, closeTab, handleRefresh]);

  // 在系统资源管理器中打开（A 功能）：只传 rid；结果经 revealFeedback 映射提示文案
  const handleReveal = useCallback(
    async (rid) => {
      if (!api) {
        notify('preload 未就绪，无法连接 lo 核心');
        return;
      }
      try {
        const res = await api.revealResource(rid);
        notify(revealFeedback(res));
      } catch (e) {
        notify(`打开失败: ${(e && e.message) || e}`);
      }
    },
    [notify],
  );

  const undoLast = useCallback(async () => {
    if (!api || !api.operations) return;
    setBusy(true);
    notify('');
    try {
      const list = await api.operations.list({ limit: 1 });
      if (!list.ok || !list.data || list.data.length === 0) {
        notify(list.ok ? '没有可撤销的操作' : `获取操作失败: ${list.message}`);
        return;
      }
      const op = list.data[0];
      const opId = op.operation_id || op.operationId;      const res = await api.operations.undo(opId);
      if (res.ok) {
        notify('已撤销最近操作');
        handleRefresh();
      } else {
        notify(`撤销失败: ${res.message}`);
      }
    } catch (e) {
      notify(`撤销失败: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }, [api, handleRefresh]);

  const confirmDiscardAction = useCallback(() => {
    const key = discardKeyRef.current;
    discardKeyRef.current = null;
    setConfirmDiscard(false);
    if (key) closeTab(key);
  }, [closeTab]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveActiveTab();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveActiveTab]);

  useEffect(() => {
    document.documentElement.style.zoom = String(zoom);
    return () => {
      document.documentElement.style.zoom = '';
    };
  }, [zoom]);

useEffect(() => {
    const round1 = (n) => Number(n.toFixed(2));
    const step = (cur) => Math.min(1.6, Math.max(0.5, round1(cur)));
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => step(z + 0.1));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoom((z) => step(z - 0.1));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setField = (field) => (e) => {
    setConfig((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // ── P0 布局持久化（sidebar + 右侧面板显隐；纯 UI 状态，经 agent-layout 白名单 IPC）──
  const layoutPanels = useMemo(
    () => ({ relations: relationsOpen, settings: subOpen, plugin: pluginView }),
    [relationsOpen, subOpen, pluginView],
  );

  useEffect(() => {
    if (!api || !api.layout || typeof api.layout.load !== 'function') return;
    api.layout
      .load()
      .then((res) => {
        if (!res || !res.ok || !res.layout) return;
        const app = applyLayout(res.layout);
        setSidebarWidth(app.sidebar.size);
        setCollapsed(!app.sidebar.visible);
        setRelationsOpen(app.panels.relations);
        setSubOpen(app.panels.settings);
        setPluginView(app.panels.plugin);
      })
      .catch(() => {});
  }, []);

  const persistLayout = useCallback(() => {
    if (!api || !api.layout || typeof api.layout.save !== 'function') return;
    if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
    layoutTimerRef.current = setTimeout(() => {
      layoutTimerRef.current = null;
      api.layout
        .save(
          buildLayout({
            sidebarVisible: !collapsed,
            sidebarWidth,
            panels: layoutPanels,
          }),
        )
        .catch(() => {});
    }, 500);
  }, [collapsed, sidebarWidth, layoutPanels]);

  useEffect(() => {
    persistLayout();
    return () => {
      if (layoutTimerRef.current) {
        clearTimeout(layoutTimerRef.current);
        layoutTimerRef.current = null;
      }
    };
  }, [persistLayout]);

  const openCtxMenu = useCallback(
    async (n, x, y) => {
      const existingTab = tabs.find((t) => t.rid === n.rid);
      const readOnly = await resolveReadOnly(
        n,
        api,
        readOnlyOverridesRef.current,
        existingTab ? existingTab.session : null,
      );
      setCtxMenu({
        x: Math.max(4, Math.min(x, window.innerWidth - 190)),
        y: Math.max(4, Math.min(y, window.innerHeight - 140)),
        rid: n.rid,
        readOnly,
      });
    },
    [tabs, api],
  );

  const toggleSidebar = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  const openLogin = () => setLoginOpen(true);
  const closeLogin = () => setLoginOpen(false);

  const [isMaximized, setIsMaximized] = useState(false);
  useEffect(() => {
    const wc = window.loAgent?.windowControls;
    if (!wc) return undefined;
    wc.isMaximized().then(setIsMaximized).catch(() => {});
    return wc.onMaximizeChange(setIsMaximized);
  }, []);

  // 登录后订阅 Core 事件(SSE)，收到资源变化事件刷新列表
  // 生命周期：登录建立订阅 → 登出/卸载关闭订阅
  useEffect(() => {
    if (!api || !authenticated) return undefined;
    const ev = api.events;
    if (!ev) return undefined;

    let cancelled = false;
    let unlisten = null;

    ev.subscribe(['resource.created', 'resource.updated', 'resource.deleted'])
      .then(() => {
        if (cancelled) return;
        unlisten = ev.onEvent((event) => {
          const type = event && event.event;
          if (
            type === 'resource.created' ||
            type === 'resource.deleted' ||
            type === 'resource.updated'
          ) {
            handleRefresh();
          }
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      ev.unsubscribe().catch(() => {});
    };
  }, [authenticated, handleRefresh]);

  // U3：登录后拉取插件贡献的 Usage Viewer（Session.viewerId → 渲染桥）
  useEffect(() => {
    if (!api || !authenticated || !api.plugins || !api.plugins.viewers) {
      return undefined;
    }
    let cancelled = false;
    api.plugins.viewers
      .list()
      .then((res) => {
        if (cancelled) return;
        if (res && res.ok) setPluginViewers(res.viewers || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  const winBtn = (action, label, children) => (
    <button
      type="button"
      className="win-btn"
      aria-label={label}
      title={label}
      onClick={action}
    >
      {children}
    </button>
  );

  const renderCtlButtons = () => {
    const wc = window.loAgent?.windowControls;
    if (!wc) return null;
    return (
      <div className="win-controls">
        {winBtn(
          () => wc.minimize(),
          '最小化',
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <path d="M1 5.5h9" stroke="currentColor" strokeWidth="1.1" />
          </svg>,
        )}
        {winBtn(
          () => wc.toggleMaximize(),
          isMaximized ? '向下还原' : '最大化',
          isMaximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <rect x="1.5" y="1.5" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.1" />
              <path d="M3.5 3.5v-2a0 0 0 0 1 0 0v0h0z" fill="none" />
              <rect x="3.2" y="3.2" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
              <rect x="1.5" y="1.5" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          ),
        )}
        {winBtn(
          () => wc.close(),
          '关闭',
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <path d="M2 2l7 7M9 2L2 9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </svg>,
        )}
      </div>
    );
  };

  return (
    <div className="app">
      <header className="app-topbar">
        <button
          className="hamburger"
          aria-label="切换侧边栏"
          onClick={toggleSidebar}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              d="M2 4.5h14M2 9h14M2 13.5h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
        <div className="topbar-spacer" />
        <button
          className={`conn-dot ${authenticated ? 'on' : ''}`}
          type="button"
          title={
            authenticated
              ? repoCtx
                ? `已登录（${repoCtx.repositoryId} · ${repoCtx.currentPath}），点击重新登录/登出`
                : '已登录，点击重新登录/登出'
              : '未连接，点击登录'
          }
          aria-label={authenticated ? '已登录' : '未连接'}
          onClick={openLogin}
        />
        {renderCtlButtons()}
      </header>
      <div className={`app-shell ${collapsed ? 'sidebar-hidden' : ''}`}>
        <aside className="app-rail">
          <div className="rail-spacer" />
          <button
            className={`rail-btn ${pluginView ? 'active' : ''}`}
            aria-label="插件"
            title="插件"
            onClick={() => setPluginView((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M15 4.95703C15 4.58711 14.8563 4.24054 14.5949 3.97992L12.0096 1.39234C11.4879 0.86922 10.5788 0.86922 10.0571 1.39234L8 3.45119V3.32321C8 2.55068 7.37187 1.922 6.6 1.922H2.4C1.62813 1.922 1 2.55068 1 3.32321V13.5988C1 14.3713 1.62813 15 2.4 15H12.6667C13.4385 15 14.0667 14.3713 14.0667 13.5988V9.39514C14.0667 8.62261 13.4385 7.99393 12.6667 7.99393H12.5379L14.5949 5.93508C14.8553 5.67445 15 5.32602 15 4.95703ZM2.4 2.85521H6.6C6.85667 2.85521 7.06667 3.06446 7.06667 3.32228V7.99299H1.93333V3.32228C1.93333 3.06446 2.14333 2.85521 2.4 2.85521ZM1.93333 13.5979V8.92714H7.06667V14.0649H2.4C2.14333 14.0649 1.93333 13.8547 1.93333 13.5979ZM13.1333 9.39421V13.5979C13.1333 13.8547 12.9233 14.0649 12.6667 14.0649H8V8.92714H12.6667C12.9233 8.92714 13.1333 9.13638 13.1333 9.39421ZM8 7.99299V6.46287L9.5288 7.99299H8ZM13.9351 5.2737L11.3488 7.86221C11.1789 8.03223 10.8859 8.03223 10.716 7.86221L8.12973 5.2737C8.0448 5.18963 7.99813 5.07753 7.99813 4.95796C7.99813 4.83839 8.0448 4.7263 8.12973 4.64129L10.716 2.05278C10.8009 1.96777 10.9129 1.92106 11.0324 1.92106C11.1519 1.92106 11.2639 1.96777 11.3488 2.05278L13.9351 4.64129C14.02 4.72536 14.0667 4.83746 14.0667 4.95703C14.0667 5.0766 14.02 5.1887 13.9351 5.2737Z" />
            </svg>
          </button>
          <button
            className={`rail-btn ${subOpen ? 'active' : ''}`}
            aria-label="展开功能面板"
            title="功能面板"
            onClick={() => setSubOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </aside>
        <BarArea
          sidebarWidth={sidebarWidth}
          sidebarVisible={!collapsed}
          onSidebarSize={setSidebarWidth}
          onLayoutChange={persistLayout}
        >
          <Bar id="sidebar">
            <div className="bar-sidebar-inner">
              <ResourceExplorer
                notes={notes}
                busy={busy}
                authenticated={authenticated}
                onRefresh={handleRefresh}
                onOpen={openResource}
                onNewNote={createNote}
                onImport={importFiles}
                onContextMenu={openCtxMenu}
              />
            </div>
          </Bar>

          <MainArea onLayoutChange={persistLayout}>
            {pluginView && (
              <Bar id="plugin" title="插件" onClose={() => setPluginView(false)}>
                <PluginCenter tab={pluginTab} onTab={setPluginTab} onNotify={notify} />
              </Bar>
            )}

            {activeTab && (
              <Bar id="editor">
              <div className="editor-tabs" role="tablist">
                {tabs.map((t) => (
                  <div
                    key={t.key}
                    role="tab"
                    aria-selected={t.key === activeKey}
                    className={`editor-tab ${t.key === activeKey ? 'active' : ''} ${
                      isDirty(t) ? 'dirty' : ''
                    }`}
                    onClick={() => setActiveKey(t.key)}
                  >
                    <span className="editor-tab-name">{t.title}</span>
                    {isDirty(t) && <span className="editor-tab-dirty-dot" title="未保存" />}
                    <button
                      type="button"
                      className="editor-tab-close"
                      aria-label={`关闭 ${t.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        requestCloseTab(t.key);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="editor-panel">
                <div className="editor-toolbar">
                  <div className="editor-toolbar-title">
                    <input
                      className="editor-doc-name-input"
                      value={activeTab.title}
                      disabled={activeTab.session.state.readOnly}
                      onChange={(e) => setActiveTitle(e.target.value)}
                      aria-label="笔记标题"
                    />
                    <span className="editor-doc-rid">{activeTab.rid}</span>
                    <input
                      className="editor-meta-input"
                      placeholder="标签（逗号分隔）"
                      value={activeTab.tagsText}
                      disabled={activeTab.session.state.readOnly}
                      onChange={(e) => setActiveTagsText(e.target.value)}
                      aria-label="标签"
                    />
                    <input
                      className="editor-meta-input editor-meta-input-sm"
                      placeholder="分类"
                      value={activeTab.category}
                      disabled={activeTab.session.state.readOnly}
                      onChange={(e) => setActiveCategory(e.target.value)}
                      aria-label="分类"
                    />
                    {isDirty(activeTab) && <span className="chip chip-dirty">未保存</span>}
                  </div>
                </div>

                <div className="editor-body">
                  <EditorRenderer
                    tab={activeTab}
                    onChange={setActiveText}
                    pluginViewers={pluginViewers}
                  />
                </div>

                <div className="editor-statusbar">
                  <span className="status-meta">{activeTab.rid}</span>
                  <span className="status-meta">类型 {activeTab.meta.type}</span>
                  <span className="status-meta">
                    Mode {activeTab.session.modeId}
                  </span>
                  <span className="status-meta">
                    Viewer {activeTab.session.viewerId}
                  </span>
                  {activeTab.meta.schema && (
                    <span className="status-meta">schema {activeTab.meta.schema}</span>
                  )}
                  {activeTab.meta.updatedAt && (
                    <span className="status-meta">
                      更新 {formatTime(activeTab.meta.updatedAt)}
                    </span>
                  )}
                  <span className="status-meta">
                    {activeTab.text.length} 字符
                    {activeTab.session.state.readOnly ? ' · 只读' : ''}
                  </span>
                  <span className="status-hint">Ctrl/Cmd+S 保存</span>
                </div>
              </div>
            </Bar>
          )}

          {activeTab && relationsOpen && (
            <Bar id="relations" title="关联关系" onClose={() => setRelationsOpen(false)}>
              <RelationPanel rid={activeTab.rid} notes={notes} />
            </Bar>
          )}

            {subOpen && (
              <Bar id="settings" title="设置" onClose={() => setSubOpen(false)}>
                <div className="sub-panel">
                  <div className="sub-nav" role="tablist">
                    {SUB_NAV.map((item) => (
                      <button
                        key={item.id}
                        role="tab"
                        aria-selected={view === item.id}
                        className={view === item.id ? 'active' : ''}
                        onClick={() => setView(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="sub-body">
                    {view === 'workspace' && (
                      <WorkspacePanel
                        status={status}
                        notes={notes}
                        busy={busy}
                        onRefresh={handleRefresh}
                        onLogin={openLogin}
                      />
                    )}

                    {view === 'history' && (
                      <OperationHistory
                        authenticated={authenticated}
                        onLogin={openLogin}
                        onNotify={notify}
                        onRefresh={handleRefresh}
                      />
                    )}

                    {view === 'settings' && (
                      <FileSettingsPanel
                        autoSave={autoSave}
                        onToggleAutoSave={setAutoSave}
                      />
                    )}

                    {view === 'views' && <CoreViewPanel onOpen={openResource} onNotify={notify} />}

                    {view === 'graph' && <GraphView onOpen={openResource} onNotify={notify} />}
                  </div>
                </div>
              </Bar>
            )}
          </MainArea>
        </BarArea>

        {message && (
          <div className="app-toast" aria-live="polite">
            <span className="app-toast-text">{message}</span>
            <button
              type="button"
              className="app-toast-copy"
              title="复制提示信息"
              aria-label="复制提示信息"
              onClick={() => {
                navigator.clipboard
                  .writeText(message)
                  .then(() => {
                    setToastCopied(true);
                    setTimeout(() => setToastCopied(false), 1500);
                  })
                  .catch(() => {});
              }}
            >
              {toastCopied ? '已复制' : '复制'}
            </button>
          </div>
        )}

        <NoteContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onReveal={handleReveal}
          onUndo={undoLast}
          onDelete={requestDeleteNote}
          onToggleReadOnly={toggleReadOnly}
        />

        {loginOpen && (
          <Modal title="登录" onClose={closeLogin}>
            <LoginPanel
              config={config}
              privateKeyPath={privateKeyPath}
              busy={busy}
              setField={setField}
              setPrivateKeyPath={setPrivateKeyPath}
              onConfigure={handleConfigure}
              onLogin={handleLogin}
              onLogout={handleLogout}
            />
          </Modal>
        )}

        {confirmDiscard && (
          <Modal title="放弃未保存的修改" onClose={() => setConfirmDiscard(false)}>
            <div className="confirm-body">
              <p>当前编辑内容尚未保存，确定要关闭并放弃这些修改吗？</p>
              <div className="confirm-actions">
                <button className="btn primary" type="button" onClick={confirmDiscardAction}>
                  放弃修改
                </button>
                <button className="btn ghost" type="button" onClick={() => setConfirmDiscard(false)}>
                  继续编辑
                </button>
              </div>
            </div>
          </Modal>
        )}

        {confirmDelete && (
          <Modal title="删除笔记" onClose={() => setConfirmDelete(false)}>
            <div className="confirm-body">
              <p>确定删除该笔记吗？删除后可在「功能面板 → 历史」中撤销恢复。</p>
              <div className="confirm-actions">
                <button className="btn danger" type="button" onClick={confirmDeleteNote}>
                  删除
                </button>
                <button className="btn ghost" type="button" onClick={() => setConfirmDelete(false)}>
                  取消
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}

const PLUGIN_STATE_LABEL = {
  activated: '已激活',
  deactivated: '已停用',
  loaded: '已加载',
};

/**
 * EditorRenderer —— 按 session.viewerId 选择 renderer（U2/U3）
 * session.state.readOnly 是只读状态唯一运行态来源；
 * viewer 自身的只读限制（如 generic-preview）与其取并集。
 * 内置 Viewer → React 组件；插件 Viewer → PluginViewerHost（render-viewer 桥）。
 */
function EditorRenderer({ tab, onChange, pluginViewers }) {
  const viewer = resolveViewerComponent(tab.session.viewerId, pluginViewers);
  if (!viewer) {
    return (
      <div className="editor-body-empty">
        无可用的 Viewer：{tab.session.viewerId}（插件贡献的 Viewer 未安装）
      </div>
    );
  }
  if (viewer.plugin) {
    return (
      <PluginViewerHost
        key={tab.key}
        viewerId={tab.session.viewerId}
        rid={tab.rid}
        modeId={tab.session.modeId}
        readOnly={tab.session.state.readOnly}
      />
    );
  }
  const ViewerComponent = viewer.component;
  return (
    <ViewerComponent
      key={tab.key}
      value={tab.text}
      onChange={onChange}
      readOnly={tab.session.state.readOnly || !!viewer.readOnly}
    />
  );
}

/**
 * PluginViewerHost —— 插件 Viewer 渲染桥（U3）
 * 经 agent-plugins:render-viewer 白名单通道取 HTML 快照（同 editors 模型），
 * 不建立 iframe/WebView；错误/未安装态给明确提示。
 */
function PluginViewerHost({ viewerId, rid, modeId, readOnly }) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const pluginsApi = window.loAgent && window.loAgent.plugins;
    if (!pluginsApi || !pluginsApi.viewers || !pluginsApi.viewers.render) {
      setError('插件系统未就绪，无法渲染 Viewer');
      return undefined;
    }
    setHtml('');
    setError('');
    pluginsApi.viewers
      .render(viewerId, { rid, modeId, readOnly })
      .then((res) => {
        if (cancelled) return;
        if (res && res.ok && res.viewer) {
          setHtml(res.viewer.html || '');
        } else {
          setError((res && res.error) || 'Viewer 渲染失败');
        }
      })
      .catch((e) => {
        if (!cancelled) setError(`Viewer 渲染失败: ${e.message || e}`);
      });
    return () => {
      cancelled = true;
    };
  }, [viewerId, rid, modeId, readOnly]);

  if (error) {
    return <div className="editor-body-empty">{error}</div>;
  }
  return (
    <div
      className="editor-plugin-viewer"
      dangerouslySetInnerHTML={html ? { __html: html } : undefined}
    />
  );
}

function PluginPanel(props) {
  const { onNotify } = props;
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [expandId, setExpandId] = useState(null);
  const [configDraft, setConfigDraft] = useState({});
  const [confirmId, setConfirmId] = useState(null);
  const [installId, setInstallId] = useState('');
  const [registryUrl, setRegistryUrl] = useState('');
  const [installing, setInstalling] = useState(false);
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(false);

  const refresh = useCallback(async () => {
    const api = window.loAgent && window.loAgent.plugins;
    if (!api || !api.manage) {
      if (onNotify) onNotify('插件系统未就绪');
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await api.manage.list();
    setLoading(false);
    if (res.ok) setPlugins(res.plugins || []);
    else if (onNotify) onNotify(`获取插件列表失败: ${res.error}`);
  }, [onNotify]);

  const refreshServices = useCallback(async () => {
    const api = window.loAgent && window.loAgent.plugins;
    if (!api || !api.services) return;
    setServicesLoading(true);
    const res = await api.services.list();
    setServicesLoading(false);
    if (res.ok) setServices(res.services || []);
    else if (onNotify) onNotify(`获取服务清单失败: ${res.error}`);
  }, [onNotify]);

  useEffect(() => {
    refresh();
    refreshServices();
  }, [refresh, refreshServices]);

  const toggle = useCallback(
    async (p) => {
      const api = window.loAgent && window.loAgent.plugins;
      if (!api || !api.manage) return;
      setBusyId(p.id);
      const res = p.enabled
        ? await api.manage.disable(p.id)
        : await api.manage.enable(p.id);
      setBusyId(null);
      if (res.ok) refresh();
      else if (onNotify) onNotify(`${p.enabled ? '禁用' : '启用'}失败: ${res.error}`);
    },
    [onNotify, refresh],
  );

  const doUninstall = useCallback(
    async (p) => {
      const api = window.loAgent && window.loAgent.plugins;
      if (!api || !api.manage) return;
      setBusyId(p.id);
      const res = await api.manage.uninstall(p.id);
      setBusyId(null);
      setConfirmId(null);
      if (res.ok) {
        if (onNotify) onNotify(`已卸载: ${p.name || p.id}`);
        refresh();
      } else if (onNotify) {
        onNotify(`卸载失败: ${res.error}`);
      }
    },
    [onNotify, refresh],
  );

  const openConfig = useCallback(
    async (p) => {
      const api = window.loAgent && window.loAgent.plugins;
      if (!api || !api.manage) return;
      if (expandId === p.id) {
        setExpandId(null);
        return;
      }
      setExpandId(p.id);
      const res = await api.manage.getConfig(p.id);
      if (res.ok) {
        setConfigDraft((prev) => ({ ...prev, [p.id]: { ...(res.config || {}) } }));
      } else if (onNotify) {
        onNotify(`读取配置失败: ${res.error}`);
      }
    },
    [expandId, onNotify],
  );

  const setDraft = useCallback(
    (pluginId, key, raw) => {
      const schema = (plugins.find((p) => p.id === pluginId) || {}).config || {};
      const def = schema[key] || {};
      let value = raw;
      if (def.type === 'boolean') {
        value = !!raw;
      } else if (def.type === 'number') {
        value = raw === '' ? '' : Number(raw);
      }
      setConfigDraft((prev) => {
        const draft = prev[pluginId] || {};
        return { ...prev, [pluginId]: { ...draft, [key]: value } };
      });
    },
    [plugins],
  );

  const saveConfig = useCallback(
    async (p) => {
      const api = window.loAgent && window.loAgent.plugins;
      if (!api || !api.manage) return;
      const draft = configDraft[p.id] || {};
      setBusyId(p.id);
      let ok = true;
      let firstError = '';
      for (const [key, value] of Object.entries(draft)) {
        const res = await api.manage.setConfig(p.id, key, value);
        if (!res.ok) {
          ok = false;
          firstError = `${key}: ${res.error}`;
        }
      }
      setBusyId(null);
      if (ok) {
        if (onNotify) onNotify('配置已保存');
        setExpandId(null);
        refresh();
      } else if (onNotify) {
        onNotify(`保存配置失败: ${firstError}`);
      }
    },
    [configDraft, onNotify, refresh],
  );

  const doInstall = useCallback(async () => {
    const api = window.loAgent && window.loAgent.plugins;
    if (!api || !api.install) return;
    setInstalling(true);
    const res = await api.install(installId.trim(), registryUrl.trim(), {});
    setInstalling(false);
    if (res.ok) {
      if (onNotify) onNotify(`已安装: ${installId.trim()}，可在列表启用`);
      setInstallId('');
      setRegistryUrl('');
      refresh();
    } else if (onNotify) {
      onNotify(`安装失败: ${res.error}`);
    }
  }, [installId, registryUrl, onNotify, refresh]);

  const renderPermissions = (p) => {
    const perms = p.permissions || {};
    const caps = Object.entries(perms).flatMap(([ns, v]) =>
      Array.isArray(v) ? v.map((cap) => `${ns}.${cap}`) : v ? [ns] : [],
    );
    if (caps.length === 0) return <div className="muted">权限：默认只读（无写能力）</div>;
    return (
      <div className="plugin-caps">
        {caps.map((cap) => (
          <span key={cap} className="name-badge">
            {cap}
          </span>
        ))}
      </div>
    );
  };

  const renderConfigEditor = (p) => {
    const schema = p.config || {};
    const keys = Object.keys(schema);
    if (keys.length === 0) {
      return <div className="muted">该插件未声明可配置项（manifest.config 为空）</div>;
    }
    const draft = configDraft[p.id] || {};
    return (
      <div className="plugin-config">
        {keys.map((key) => {
          const def = schema[key] || {};
          const has = key in draft;
          const current = has ? draft[key] : def.default;
          const value = current === undefined || current === null ? '' : current;
          return (
            <label key={key} className="config-row">
              <span className="config-label">
                {key}
                {def.description && <span className="muted"> · {def.description}</span>}
              </span>
              {def.type === 'boolean' ? (
                <input
                  type="checkbox"
                  checked={!!value}
                  onChange={(e) => setDraft(p.id, key, e.target.checked)}
                />
              ) : def.type === 'number' ? (
                <input
                  type="number"
                  value={value}
                  onChange={(e) => setDraft(p.id, key, e.target.value)}
                />
              ) : (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setDraft(p.id, key, e.target.value)}
                />
              )}
            </label>
          );
        })}
        <div className="plugin-config-actions">
          <button
            className="btn primary"
            type="button"
            disabled={busyId === p.id}
            onClick={() => saveConfig(p)}
          >
            {busyId === p.id ? '保存中…' : '保存配置'}
          </button>
          <button className="btn ghost" type="button" onClick={() => setExpandId(null)}>
            收起
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <section className="panel-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>已安装插件</h3>
          <button className="btn ghost" onClick={refresh} disabled={loading || !!busyId}>
            {loading ? '加载中…' : '刷新'}
          </button>
        </div>
        {plugins.length === 0 ? (
          <p className="empty">{loading ? '加载中…' : '暂无已安装插件'}</p>
        ) : (
          <ul className="plugin-list">
            {plugins.map((p) => (
              <li key={p.id} className="plugin-item">
                <div className="plugin-item-head">
                  <div className="plugin-info">
                    <div className="plugin-name">
                      {p.name || p.id}
                      <span className="plugin-version">v{p.version}</span>
                    </div>
                    <div className="plugin-meta muted">
                      {p.id} · {PLUGIN_STATE_LABEL[p.state] || p.state} ·{' '}
                      {p.enabled ? '启用' : '禁用'}
                    </div>
                    {p.description && <div className="plugin-desc muted">{p.description}</div>}
                  </div>
                  <div className="plugin-actions">
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={busyId === p.id}
                      onClick={() => openConfig(p)}
                    >
                      {expandId === p.id ? '收起' : '配置'}
                    </button>
                    <button
                      className="btn primary"
                      type="button"
                      disabled={busyId === p.id}
                      onClick={() => toggle(p)}
                    >
                      {p.enabled ? '禁用' : '启用'}
                    </button>
                    <button
                      className="btn ghost danger"
                      type="button"
                      disabled={busyId === p.id}
                      onClick={() => setConfirmId(p.id)}
                    >
                      卸载
                    </button>
                  </div>
                </div>

                {expandId === p.id && (
                  <div className="plugin-detail">
                    {renderPermissions(p)}
                    {renderConfigEditor(p)}
                  </div>
                )}

                {confirmId === p.id && (
                  <div className="plugin-confirm">
                    <span className="muted">卸载将删除插件文件与配置数据，确定卸载？</span>
                    <div>
                      <button
                        className="btn primary"
                        type="button"
                        disabled={busyId === p.id}
                        onClick={() => doUninstall(p)}
                      >
                        {busyId === p.id ? '卸载中…' : '确认卸载'}
                      </button>
                      <button className="btn ghost" type="button" onClick={() => setConfirmId(null)}>
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>已注册服务</h3>
          <button className="btn ghost" onClick={refreshServices} disabled={servicesLoading}>
            {servicesLoading ? '加载中…' : '刷新'}
          </button>
        </div>
        {services.length === 0 ? (
          <p className="empty">暂无插件服务（安装插件后自动注册）</p>
        ) : (
          <ul className="command-list">
            {services.map((s) => (
              <li key={s.id} className="command-item">
                <div className="command-info">
                  <span className="command-title">{s.title}</span>
                  <span className="muted">{s.id} · v{s.version} · {s.pluginId}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel-card">
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>安装插件</h3>
        <div className="plugin-install">
          <input
            value={installId}
            onChange={(e) => setInstallId(e.target.value)}
            placeholder="插件 ID（如 demo-hello）"
          />
          <input
            value={registryUrl}
            onChange={(e) => setRegistryUrl(e.target.value)}
            placeholder="分发仓库 URL 或本地路径"
          />
          <button
            className="btn primary"
            type="button"
            disabled={installing || !installId.trim() || !registryUrl.trim()}
            onClick={doInstall}
          >
            {installing ? '安装中…' : '安装'}
          </button>
        </div>
      </section>
    </>
  );
}

function PluginCenter(props) {
  const { tab, onTab, onNotify } = props;
  const goManage = () => onTab('manage');
  const tabs = [
    { id: 'commands', label: '命令' },
    { id: 'views', label: '视图' },
    { id: 'panels', label: '面板' },
    { id: 'editors', label: '编辑器' },
    { id: 'manage', label: '管理' },
  ];
  return (
    <div className="sub-panel">
      <div className="sub-nav" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="sub-body">
        {tab === 'commands' && <CommandPanel onNotify={onNotify} onGoManage={goManage} />}
        {tab === 'views' && <ViewPanel onNotify={onNotify} onGoManage={goManage} />}
        {tab === 'panels' && <PanelPanel onNotify={onNotify} onGoManage={goManage} />}
        {tab === 'editors' && <EditorPanel onNotify={onNotify} onGoManage={goManage} />}
        {tab === 'manage' && <PluginPanel onNotify={onNotify} />}
      </div>
    </div>
  );
}

function PluginEmptyState({ onGoManage }) {
  return (
    <div className="plugin-empty">
      <p>尚未安装插件，该列表为空。</p>
      <button className="btn primary" type="button" onClick={onGoManage}>
        去插件管理安装插件
      </button>
    </div>
  );
}

function ViewPanel(props) {
  const { onNotify, onGoManage } = props;
  const [views, setViews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [html, setHtml] = useState('');
  const [mountItem, setMountItem] = useState(null);
  const [rendering, setRendering] = useState(false);

  const refresh = useCallback(async () => {
    const api = window.loAgent && window.loAgent.plugins;
    if (!api || !api.views) {
      if (onNotify) onNotify('插件系统未就绪');
      setLoading(false);
      return;
    }
    const res = await api.views.list();
    setLoading(false);
    if (res.ok) setViews(res.views || []);
    else if (onNotify) onNotify(`获取视图失败: ${res.error}`);
  }, [onNotify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const open = useCallback(
    async (view) => {
      const api = window.loAgent && window.loAgent.plugins;
      if (!api || !api.views) return;
      setActive(view.id);
      setRendering(true);
      setHtml('');
      setMountItem(null);
      // 优先 mountEl UI（插件声明 ui）；否则回退 HTML 快照
      const ui = await hasUi(view.pluginId);
      if (ui) {
        setMountItem(view);
        setRendering(false);
        return;
      }
      const res = await api.views.render(view.id, {});
      setRendering(false);
      if (res.ok) {
        setHtml(res.view.html || '');
      } else if (onNotify) {
        setActive(null);
        onNotify(`渲染失败: ${res.error}`);
      }
    },
    [onNotify],
  );

  return (
    <section className="panel-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>插件视图</h3>
        <button className="btn ghost" onClick={refresh} disabled={loading}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>
      {views.length === 0 ? (
        loading ? (
          <p className="empty">加载中…</p>
        ) : (
          <PluginEmptyState onGoManage={onGoManage} />
        )
      ) : (
        <>
          <ul className="command-list">
            {views.map((v) => (
              <li key={v.id} className="command-item">
                <div className="command-info">
                  <span className="command-title">{v.title}</span>
                  <span className="muted">{v.type} · {v.pluginId}</span>
                </div>
                <button className="btn primary" type="button" disabled={rendering} onClick={() => open(v)}>
                  {rendering && active === v.id ? '渲染中…' : '打开'}
                </button>
              </li>
            ))}
          </ul>
          {active && mountItem && (
            <div className="plugin-view">
              <div className="plugin-view-title">{mountItem.title}</div>
              <PluginUiMount
                pluginId={mountItem.pluginId}
                extType="views"
                extId={mountItem.id}
                onNotify={onNotify}
              />
            </div>
          )}
          {active && !mountItem && (
            <div className="plugin-view">
              <div className="plugin-view-title">{views.find((v) => v.id === active)?.title}</div>
              <div className="plugin-view-body" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function PanelPanel(props) {
  const { onNotify, onGoManage } = props;
  const [panels, setPanels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [html, setHtml] = useState('');
  const [mountItem, setMountItem] = useState(null);
  const [rendering, setRendering] = useState(false);

  const refresh = useCallback(async () => {
    const api = window.loAgent && window.loAgent.plugins;
    if (!api || !api.panels) {
      if (onNotify) onNotify('插件系统未就绪');
      setLoading(false);
      return;
    }
    const res = await api.panels.list();
    setLoading(false);
    if (res.ok) setPanels(res.panels || []);
    else if (onNotify) onNotify(`获取面板失败: ${res.error}`);
  }, [onNotify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const open = useCallback(
    async (panel) => {
      const api = window.loAgent && window.loAgent.plugins;
      if (!api || !api.panels) return;
      setActive(panel.id);
      setRendering(true);
      setHtml('');
      setMountItem(null);
      // 优先 mountEl UI（插件声明 ui）；否则回退 HTML 快照
      const ui = await hasUi(panel.pluginId);
      if (ui) {
        setMountItem(panel);
        setRendering(false);
        return;
      }
      const res = await api.panels.render(panel.id, {});
      setRendering(false);
      if (res.ok) {
        setHtml(res.panel.html || '');
      } else if (onNotify) {
        setActive(null);
        onNotify(`渲染失败: ${res.error}`);
      }
    },
    [onNotify],
  );

  return (
    <section className="panel-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>插件面板</h3>
        <button className="btn ghost" onClick={refresh} disabled={loading}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>
      {panels.length === 0 ? (
        loading ? (
          <p className="empty">加载中…</p>
        ) : (
          <PluginEmptyState onGoManage={onGoManage} />
        )
      ) : (
        <>
          <ul className="command-list">
            {panels.map((p) => (
              <li key={p.id} className="command-item">
                <div className="command-info">
                  <span className="command-title">{p.title}</span>
                  <span className="muted">{p.area} · {p.pluginId}</span>
                </div>
                <button className="btn primary" type="button" disabled={rendering} onClick={() => open(p)}>
                  {rendering && active === p.id ? '渲染中…' : '打开'}
                </button>
              </li>
            ))}
          </ul>
          {active && mountItem && (
            <div className="plugin-view">
              <div className="plugin-view-title">{mountItem.title}</div>
              <PluginUiMount
                pluginId={mountItem.pluginId}
                extType="panels"
                extId={mountItem.id}
                onNotify={onNotify}
              />
            </div>
          )}
          {active && !mountItem && (
            <div className="plugin-view">
              <div className="plugin-view-title">{panels.find((p) => p.id === active)?.title}</div>
              <div className="plugin-view-body" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function EditorPanel(props) {
  const { onNotify, onGoManage } = props;
  const [editors, setEditors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [html, setHtml] = useState('');
  const [mountItem, setMountItem] = useState(null);
  const [rendering, setRendering] = useState(false);

  const refresh = useCallback(async () => {
    const api = window.loAgent && window.loAgent.plugins;
    if (!api || !api.editors) {
      if (onNotify) onNotify('插件系统未就绪');
      setLoading(false);
      return;
    }
    const res = await api.editors.list();
    setLoading(false);
    if (res.ok) setEditors(res.editors || []);
    else if (onNotify) onNotify(`获取编辑器失败: ${res.error}`);
  }, [onNotify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const open = useCallback(
    async (editor) => {
      const api = window.loAgent && window.loAgent.plugins;
      if (!api || !api.editors) return;
      setActive(editor.id);
      setRendering(true);
      setHtml('');
      setMountItem(null);
      // 优先 mountEl UI（插件声明 ui）；否则回退 HTML 快照
      const ui = await hasUi(editor.pluginId);
      if (ui) {
        setMountItem(editor);
        setRendering(false);
        return;
      }
      const res = await api.editors.render(editor.id, {});
      setRendering(false);
      if (res.ok) {
        setHtml(res.editor.html || '');
      } else if (onNotify) {
        setActive(null);
        onNotify(`渲染失败: ${res.error}`);
      }
    },
    [onNotify],
  );

  return (
    <section className="panel-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>插件编辑器</h3>
        <button className="btn ghost" onClick={refresh} disabled={loading}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>
      {editors.length === 0 ? (
        loading ? (
          <p className="empty">加载中…</p>
        ) : (
          <PluginEmptyState onGoManage={onGoManage} />
        )
      ) : (
        <>
          <ul className="command-list">
            {editors.map((e) => (
              <li key={e.id} className="command-item">
                <div className="command-info">
                  <span className="command-title">{e.title}</span>
                  <span className="muted">{e.resourceType} · {e.pluginId}</span>
                </div>
                <button className="btn primary" type="button" disabled={rendering} onClick={() => open(e)}>
                  {rendering && active === e.id ? '渲染中…' : '打开'}
                </button>
              </li>
            ))}
          </ul>
          {active && mountItem && (
            <div className="plugin-view">
              <div className="plugin-view-title">{mountItem.title}</div>
              <PluginUiMount
                pluginId={mountItem.pluginId}
                extType="editors"
                extId={mountItem.id}
                onNotify={onNotify}
              />
            </div>
          )}
          {active && !mountItem && (
            <div className="plugin-view">
              <div className="plugin-view-title">{editors.find((e) => e.id === active)?.title}</div>
              <div className="plugin-view-body" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CommandPanel(props) {
  const { onNotify, onClose, onGoManage } = props;
  const [commands, setCommands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const api = window.loAgent && window.loAgent.plugins;
    if (!api) {
      if (onNotify) onNotify('插件系统未就绪');
      setLoading(false);
      return;
    }
    const res = await api.list();
    setLoading(false);
    if (res.ok) setCommands(res.commands || []);
    else if (onNotify) onNotify(`获取命令失败: ${res.error}`);
  }, [onNotify]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = useCallback(
    async (cmd) => {
      const api = window.loAgent && window.loAgent.plugins;
      if (!api) return;
      setBusy(true);
      const res = await api.execute(cmd.id, []);
      setBusy(false);
      if (onNotify) {
        onNotify(res.ok ? `已执行: ${cmd.title}` : `执行失败: ${res.error}`);
      }
      if (onClose) onClose();
    },
    [onNotify, onClose],
  );

  return (
    <section className="panel-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>已注册命令</h3>
        <button className="btn ghost" onClick={refresh} disabled={busy || loading}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>
      {commands.length === 0 ? (
        loading ? (
          <p className="empty">加载中…</p>
        ) : (
          <PluginEmptyState onGoManage={onGoManage} />
        )
      ) : (
        <ul className="command-list">
          {commands.map((c) => (
            <li key={c.id} className="command-item">
              <div className="command-info">
                <span className="command-title">{c.title}</span>
                <span className="muted">{c.pluginId}</span>
              </div>
              <button
                className="btn primary"
                type="button"
                disabled={busy}
                onClick={() => run(c)}
              >
                执行
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LoginPanel(props) {
  const { config, privateKeyPath, busy, setField, setPrivateKeyPath, onConfigure, onLogin, onLogout } = props;
  return (
    <>
      <section className="panel-card">
        <h2>仓库地址</h2>
        <div className="field-row">
          <label>
            协议
            <select value={config.protocol} onChange={setField('protocol')}>
              <option value="http">http</option>
              <option value="https">https</option>
            </select>
          </label>
          <label>
            主机
            <input value={config.host} onChange={setField('host')} placeholder="127.0.0.1" />
          </label>
          <label>
            端口
            <input
              type="number"
              value={config.port}
              onChange={setField('port')}
              placeholder="8765"
            />
          </label>
        </div>
        <button className="btn primary" onClick={onConfigure} disabled={busy}>
          {busy ? '处理中…' : '连接'}
        </button>
      </section>

      <section className="panel-card">
        <h2>登录 / 认证</h2>
        <div className="field-col">
          <label>
            SSH 私钥路径
            <input
              value={privateKeyPath}
              onChange={(e) => setPrivateKeyPath(e.target.value)}
              placeholder="~/.ssh/id_ed25519 (可选)"
            />
          </label>
        </div>
        <button className="btn primary" onClick={onLogin} disabled={busy}>
          登录
        </button>
        <button className="btn ghost" onClick={onLogout} disabled={busy}>
          登出
        </button>
      </section>
    </>
  );
}

function RelationPanel(props) {
  const { rid, notes } = props;
  const [rels, setRels] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const api = window.loAgent?.loCore;
    if (!api || !api.relations || !rid) return;
    setBusy(true);
    const res = await api.relations.list(rid);
    setBusy(false);
    if (res.ok) setRels(res.data);
  }, [rid]);

  useEffect(() => {
    setRels(null);
    refresh();
  }, [rid, refresh]);

  // 从 notes 列表解析对端资源名(名称或标题)
  const resolveName = (rid2) => {
    const found = (notes || []).find((n) => n.rid === rid2);
    if (found) return found.name || rid2;
    return rid2;
  };

  const renderRelation = (rel, dir) => {
    const otherRid = dir === 'outgoing' ? rel.to_rid : rel.from_rid;
    return (
      <div className="rel-item" key={rel.id}>
        <span className="name-badge">{rel.type || 'reference'}</span>
        <span className="rel-dir">{dir === 'outgoing' ? '→' : '←'}</span>
        <span className="rel-target" title={otherRid}>
          {resolveName(otherRid)}
        </span>
      </div>
    );
  };

  if (!rid) return null;

  return (
    <section className="panel-card rel-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>关联关系</h3>
        <button className="btn ghost" onClick={refresh} disabled={busy}>
          {busy ? '加载中…' : '刷新'}
        </button>
      </div>

      {rels ? (
        <>
          <div className="rel-group">
            <div className="rel-group-title">引用 ({rels.outgoing ? rels.outgoing.length : 0})</div>
            {rels.outgoing && rels.outgoing.length > 0 ? (
              rels.outgoing.map((r) => renderRelation(r, 'outgoing'))
            ) : (
              <div className="rel-empty">无</div>
            )}
          </div>
          <div className="rel-group">
            <div className="rel-group-title">被引用 ({rels.incoming ? rels.incoming.length : 0})</div>
            {rels.incoming && rels.incoming.length > 0 ? (
              rels.incoming.map((r) => renderRelation(r, 'incoming'))
            ) : (
              <div className="rel-empty">无</div>
            )}
          </div>
        </>
      ) : (
        <p className="empty">加载中…</p>
      )}
    </section>
  );
}

function FileSettingsPanel(props) {
  const { autoSave, onToggleAutoSave } = props;
  return (
    <div className="panel-card">
      <h2>文件设置</h2>
      <div className="field-row">
        <label>
          <span>自动保存</span>
          <input
            type="checkbox"
            checked={autoSave}
            onChange={(e) => onToggleAutoSave(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 4 }}
          />
        </label>
      </div>
      <p className="empty">
        开启后，停止输入 1 秒自动保存当前笔记（仅可编辑笔记，只读笔记不受影响）。
      </p>
    </div>
  );
}

function OperationHistory(props) {
  const { authenticated, onLogin, onNotify, onRefresh } = props;
  const [ops, setOps] = useState([]);
  const [busy, setBusy] = useState(false);
  const [undoing, setUndoing] = useState(null);

  const refresh = useCallback(async () => {
    const api = window.loAgent?.loCore;
    if (!api || !api.operations) return;
    setBusy(true);
    const res = await api.operations.list({ limit: 100 });
    setBusy(false);
    if (res.ok) setOps(res.data || []);
    else if (onNotify) onNotify(`获取操作历史失败: ${res.message}`);
  }, [onNotify]);

  useEffect(() => {
    if (authenticated) refresh();
  }, [authenticated, refresh]);

  const handleUndo = useCallback(
    async (op) => {
      const api = window.loAgent?.loCore;
      if (!api || !api.operations) return;
      const opId = op.operation_id || op.operationId;
      setUndoing(opId);
      const res = await api.operations.undo(opId);
      setUndoing(null);
      if (res.ok) {
        if (onNotify) onNotify('已撤销操作');
        refresh();
        // undo 是独立 Operation，不产生领域事件；手动刷新资源列表
        if (onRefresh) onRefresh();
      } else if (onNotify) {
        onNotify(`撤销失败: ${res.message}`);
      }
    },
    [refresh, onRefresh, onNotify],
  );

  if (!authenticated) {
    return (
      <div className="panel-card">
        <h2>操作历史</h2>
        <p className="empty">
          请先
          <button className="btn ghost" onClick={onLogin} style={{ marginLeft: 8 }}>
            登录
          </button>
          查看操作历史。
        </p>
      </div>
    );
  }

  return (
    <section className="panel-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>操作历史</h2>
        <button className="btn ghost" onClick={refresh} disabled={busy}>
          {busy ? '加载中…' : '刷新'}
        </button>
      </div>
      {ops.length === 0 ? (
        <p className="empty">暂无操作记录。</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>类型</th>
              <th>状态</th>
              <th>关联资源</th>
              <th>operationId</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ops.map((op) => {
              const after = op.after || {};
              const before = op.before || {};
              const rid =
                after.rid || before.rid || after.resource_rid || after.from_rid || '';
              const opId = op.operation_id || op.operationId;
              const statusLabel =
                op.status === 'success'
                  ? '成功'
                  : op.status === 'failed'
                    ? '失败'
                    : op.status === 'rolled_back'
                      ? '已撤销'
                      : op.status || '';
              return (
                <tr key={opId}>
                  <td>{formatTime(op.created)}</td>
                  <td>
                    <span className="name-badge">{op.type}</span>
                  </td>
                  <td>
                    <span className={`op-status op-status-${op.status || 'unknown'}`}>
                      {statusLabel}
                    </span>
                  </td>
                  <td className="muted">{rid || '—'}</td>
                  <td className="muted">{opId}</td>
                  <td>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={undoing === opId || op.status !== 'success'}
                      title={
                        op.status === 'success' ? '撤销此操作' : '仅成功状态可撤销'
                      }
                      onClick={() => handleUndo(op)}
                    >
                      {undoing === opId ? '撤销中…' : '撤销'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function WorkspacePanel(props) {
  const { status, notes, busy, onRefresh, onLogin } = props;
  return (
    <>
      <section className="panel-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>仓库状态</h2>
          <button className="btn ghost" onClick={onRefresh} disabled={busy}>
            {busy ? '刷新中…' : '刷新'}
          </button>
        </div>
        {status ? (
          <pre style={{ margin: '16px 0 0', fontSize: 13, overflow: 'auto' }}>
            {JSON.stringify(status, null, 2)}
          </pre>
        ) : (
          <p className="empty">
            尚未获取状态。请先
            <button className="btn ghost" onClick={onLogin} style={{ marginLeft: 8 }}>
              登录
            </button>
            。
          </p>
        )}
      </section>

      <section className="panel-card">
        <h2>资源列表</h2>
        {notes.length === 0 ? (
          <p className="empty">暂无资源。</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>标题</th>
                <th>类型</th>
                <th>rid</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n) => (
                <tr key={n.rid}>
                  <td>{n.name || ''}</td>
                  <td>
                    <span className="name-badge">{n.type}</span>
                  </td>
                  <td className="muted">{n.rid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function ResourceExplorer(props) {
  const { notes, busy, authenticated, onRefresh, onOpen, onNewNote, onImport, onContextMenu } = props;
  const [active, setActive] = useState(null);
  const [collapsedSet, setCollapsedSet] = useState(() => new Set());
  const fileRef = useRef(null);

  const toggleGroup = (type) => {
    setCollapsedSet((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const groups = useMemo(() => {
    const m = {};
    notes.forEach((n) => {
      const type = n.type || 'resource';
      (m[type] = m[type] || []).push(n);
    });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes]);

  return (
    <div className="sidebar-explore">
      <div className="explore-head">
        <span className="explore-title">资源</span>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          aria-hidden="true"
          onChange={(e) => {
            if (onImport) onImport(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          className="explore-refresh"
          type="button"
          title="导入文件"
          aria-label="导入文件"
          onClick={() => fileRef.current && fileRef.current.click()}
          disabled={!authenticated || busy}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M17 8l-5-5-5 5" />
            <path d="M12 3v12" />
          </svg>
        </button>
        <button
          className="explore-refresh"
          type="button"
          title="新建笔记"
          aria-label="新建笔记"
          onClick={onNewNote}
          disabled={!authenticated || busy}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button
          className="explore-refresh"
          type="button"
          title="刷新资源库"
          aria-label="刷新"
          onClick={onRefresh}
          disabled={busy}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>
      <nav className="explore-list">
        {groups.map(([type, items]) => {
          const collapsed = collapsedSet.has(type);
          return (
            <div className="explore-group" key={type}>
              <button
                type="button"
                className={`explore-group-title ${collapsed ? 'collapsed' : ''}`}
                onClick={() => toggleGroup(type)}
                aria-expanded={!collapsed}
                title={collapsed ? `展开 ${type}` : `折叠 ${type}`}
              >
                <span className="explore-group-toggle">{collapsed ? '+' : '−'}</span>
                <span className="explore-group-label">{type}</span>
                <span className="explore-group-count">{items.length}</span>
              </button>
              {!collapsed &&
                items.map((n) => (
                  <button
                    key={n.rid}
                    type="button"
                    className={`explore-item ${active === n.rid ? 'active' : ''}`}
                    onClick={() => {
                      setActive(n.rid);
                      if (onOpen) onOpen(n);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (onContextMenu) onContextMenu(n, e.clientX, e.clientY);
                    }}
                    title={n.rid}
                  >
                    <span className="explore-name">
                      {n.name || n.rid}
                    </span>
                  </button>
                ))}
            </div>
          );
        })}
        {!busy && groups.length === 0 && (
          <p className="empty">{authenticated ? '暂无资源' : '未登录，点击顶栏指示灯登录'}</p>
        )}
      </nav>
    </div>
  );
}

function NoteContextMenu(props) {
  const { menu, onClose, onUndo, onDelete, onToggleReadOnly, onReveal } = props;
  if (!menu) return null;
  return (
    <>
      <div
        className="ctx-overlay"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
        <button type="button" onClick={() => { onReveal(menu.rid); onClose(); }}>
          在系统资源管理器中打开
        </button>
        <button type="button" onClick={() => { onUndo(); onClose(); }}>
          撤销最近操作
        </button>
        <button type="button" onClick={() => { onDelete(menu.rid); onClose(); }}>
          删除
        </button>
        <button type="button" onClick={() => { onToggleReadOnly(menu.rid); onClose(); }}>
          {menu.readOnly ? '改为可编辑' : '设为只读'}
        </button>
      </div>
    </>
  );
}

function Modal(props) {
  const { title, onClose, children } = props;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
