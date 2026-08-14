/**
 * demo-consumer 插件 —— 服务消费方闭环验证
 *
 * 链路：demo-hello（提供者）ctx.extensions.registerService →
 *       ExtensionRegistry → demo-consumer（消费者）ctx.extensions.getService(id)
 *       → 调用 api。
 *
 * 前置：demo-hello 已激活（其状态服务已注册）。若提供者未激活/被停用，
 *       getService 返回 null，本插件优雅降级（记录原因，不影响命令注册）。
 *
 * 边界：消费者只经 ctx.extensions（SDK 契约）取服务 api，不能直接触碰
 *       Host 注册表；不持有注册表 key，只按服务 ID 调用。
 */
const { AgentPlugin } = require('@lo/agent-plugins-sdk');

const STATUS_SERVICE_ID = 'demo-hello.status-service';

class DemoConsumerPlugin extends AgentPlugin {
  manifest() {
    return {
      id: 'demo-consumer',
      name: 'Demo Consumer',
      version: '0.1.0',
      main: 'index.cjs',
    };
  }

  /** 消费提供者服务：返回 { available, greeting?, status?, reason? } */
  async _consume(ctx) {
    const svc = ctx.extensions.getService(STATUS_SERVICE_ID);
    if (!svc) {
      return { available: false, reason: `服务不可用: ${STATUS_SERVICE_ID}` };
    }
    return {
      available: true,
      greeting: svc.getGreeting(),
      status: await svc.getStatus(),
    };
  }

  async activate(ctx) {
    const consumerResult = await this._consume(ctx);

    // 注册命令：命令面板可实时消费提供者服务
    ctx.extensions.registerCommands([
      {
        id: 'demo-consumer.consume',
        title: 'Demo: 消费状态服务',
        handler: async (args, cmdCtx) => {
          const result = await this._consume(cmdCtx);
          cmdCtx.logger.info(`[demo-consumer] 消费结果: ${JSON.stringify(result)}`);
          return result;
        },
      },
    ]);

    this._activationResult = consumerResult;
    ctx.logger.info(`[demo-consumer] 激活完成: ${JSON.stringify(this._activationResult)}`);
  }

  get result() {
    return this._activationResult || null;
  }

  async deactivate() {
    this._activationResult = null;
  }
}

module.exports = DemoConsumerPlugin;