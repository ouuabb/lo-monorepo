/**
 * demo-hello 插件 —— 最小可用闭环验证
 *
 * 链路：发现 → 加载 → 初始化 → 经 ctx.lo 调用 Core 能力 → 返回结果
 *
 * 插件只能经 ctx.lo（SDK 契约）调用 Host Adapter；Host 内部经 @lo/client 访问 lo Core。
 */
const { AgentPlugin } = require('@lo/agent-plugins-sdk');

class DemoHelloPlugin extends AgentPlugin {
  manifest() {
    return {
      id: 'demo-hello',
      name: 'Demo Hello',
      version: '0.1.0',
      main: 'index.cjs',
      config: {
        greeting: {
          type: 'string',
          default: 'Hello from demo plugin',
          description: '插件问候语',
        },
      },
    };
  }

  async activate(ctx) {
    const greeting = ctx.config('greeting', 'Hello from demo plugin');
    ctx.logger.info(`[demo-hello] ${greeting}`);

    // 经 ctx.lo（SDK 契约）调用 Host Adapter → LoCoreService → @lo/client → lo Core
    let status = null;
    try {
      const stats = await ctx.lo.health.stats();
      if (stats) {
        status = {
          totalResources: stats.totalResources,
          totalRelations: stats.totalRelations,
        };
      }
    } catch (e) {
      ctx.logger.warn(`[demo-hello] 获取状态失败: ${e.message}`);
    }

    // 注册可执行命令（命令执行 Runtime）
    // handler 签名：async (args, ctx) => result
    ctx.extensions.registerCommands([
      {
        id: 'demo-hello.hello',
        title: 'Demo: Hello',
        handler: async (args, cmdCtx) => {
          const who = args[0] || 'world';
          const cfg = cmdCtx.config('greeting', greeting);
          return { message: `${cfg}, ${who}!`, status };
        },
      },
      {
        // 写操作命令：需要 manifest.permissions.lo 声明 operations.write
        id: 'demo-hello.touch',
        title: 'Demo: Touch (write)',
        handler: async (args, cmdCtx) => {
          await cmdCtx.lo.operations.execute('resource.update', {
            rid: args[0],
            updates: { name: (args[1] || 'touched') + '-' + Date.now() },
          });
          return { message: 'touched', rid: args[0] };
        },
      },
    ]);

    // 注册可渲染视图（UI 挂载层：render 返回 HTML 快照）
    ctx.extensions.registerView([
      {
        id: 'demo-hello.status',
        title: 'Demo: 状态',
        type: 'panel',
        render: async (context, cmdCtx) => {
          const cfg = cmdCtx.config('greeting', greeting);
          const statusHtml = status
            ? `<li>资源: ${status.totalResources} · 关系: ${status.totalRelations}</li>`
            : '<li>状态不可用</li>';
          return `<div style="font-size:13px"><p><strong>${cfg}</strong></p><ul>${statusHtml}</ul></div>`;
        },
      },
    ]);

    // 注册可渲染面板（侧边栏/底部面板挂载层）
    ctx.extensions.registerPanel({
      id: 'demo-hello.side',
      title: 'Demo: 侧栏',
      area: 'sidebar',
      render: async (context, cmdCtx) =>
        `<div style="font-size:13px"><p><strong>${cmdCtx.config('greeting', greeting)}</strong></p>
         <p class="muted">侧栏面板 · 状态: ${status ? '可用' : '不可用'}</p></div>`,
    });

    // 注册可渲染编辑器（资源类型编辑 UI）
    ctx.extensions.registerEditor({
      id: 'demo-hello.editor',
      title: 'Demo: 笔记编辑器',
      resourceType: 'note',
      render: async (context, cmdCtx) =>
        `<div style="font-size:13px;padding:8px;border:1px dashed #ccc"><p><strong>${context.rid || '新笔记'}</strong></p>
         <p class="muted">编辑器快照（${cmdCtx.config('greeting', greeting)}）</p></div>`,
    });

    // 注册插件服务（供其他插件经 ctx.extensions.getService 消费）
    ctx.extensions.registerService([
      {
        id: 'demo-hello.status-service',
        title: 'Demo: 状态服务',
        version: '1.0.0',
        api: {
          getStatus: async () => status,
          getGreeting: () => greeting,
        },
      },
    ]);

    // 记录激活结果到插件上下文（供验证）
    this._activationResult = { greeting, status };

    ctx.logger.info(`[demo-hello] 激活完成: ${JSON.stringify(this._activationResult)}`);
  }

  get result() {
    return this._activationResult || null;
  }

  async deactivate() {
    this._activationResult = null;
  }
}

module.exports = DemoHelloPlugin;
