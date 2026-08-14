/**
 * demo-hello ui —— 渲染端入口（mountEl UI，isolated world 执行）
 *
 * 自包含 ESM：不 import 任何包。宿主经 import(blob:) 加载本模块，
 * 在渲染进程 isolated world 中调用 render(mountEl, ctx) 挂载真实 DOM。
 * ctx 为插件作用域能力入口：ctx.lo / ctx.config / ctx.executeCommand / ctx.notify。
 */
export const views = {
  'demo-hello.status': {
    render: async (mountEl, ctx) => {
      const cfg = ctx.config('greeting', 'Hello from demo plugin');
      const title = document.createElement('p');
      title.innerHTML = `<strong>${escapeHtml(cfg)}</strong>`;
      const btn = document.createElement('button');
      btn.textContent = '获取状态 (ctx.lo.health.stats)';
      const out = document.createElement('p');
      out.className = 'out';
      out.textContent = '—';
      btn.addEventListener('click', async () => {
        out.textContent = '加载中…';
        try {
          const stats = await ctx.lo.health.stats();
          out.textContent = `资源: ${stats.totalResources} · 关系: ${stats.totalRelations}`;
        } catch (e) {
          out.textContent = `错误: ${e.message}`;
        }
      });
      mountEl.replaceChildren(title, btn, out);
      return () => mountEl.replaceChildren();
    },
  },
};

export const panels = {
  'demo-hello.side': {
    render: async (mountEl, ctx) => {
      const hello = document.createElement('button');
      hello.textContent = '执行 demo-hello.hello (ctx.executeCommand)';
      const out = document.createElement('p');
      out.className = 'out';
      out.textContent = '—';
      hello.addEventListener('click', async () => {
        out.textContent = '执行中…';
        try {
          const res = await ctx.executeCommand('demo-hello.hello', ['UI']);
          out.textContent = JSON.stringify(res && res.result ? res.result : res);
        } catch (e) {
          out.textContent = `错误: ${e.message}`;
        }
      });
      mountEl.replaceChildren(hello, out);
      return () => mountEl.replaceChildren();
    },
  },
};

export const editors = {
  'demo-hello.editor': {
    render: async (mountEl, ctx) => {
      const cfg = ctx.config('greeting', 'Hello from demo plugin');
      const note = document.createElement('p');
      note.innerHTML = `<strong>${escapeHtml(cfg)}</strong> — 编辑器快照（mountEl UI）`;
      const out = document.createElement('p');
      out.className = 'out';
      out.textContent = '本编辑器为渲染进程 isolated world 挂载的真实 DOM';
      mountEl.replaceChildren(note, out);
      return () => mountEl.replaceChildren();
    },
  },
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[ch];
  });
}
