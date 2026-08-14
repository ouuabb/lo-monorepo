/**
 * Chrome 划词翻译插件 — 入口
 *
 * 双通道同步：
 *   ① HTTP 端点（实时推送）：Chrome 扩展 POST → 立即写入
 *   ② ResourceProvider（文件发现）：读取导出文件 → 全量校验/补录
 *
 * 去重：基于 recordId（每条翻译记录的唯一 ID）
 */

const ChromeTranslatePlugin = require('./plugin.cjs');

module.exports = ChromeTranslatePlugin;
