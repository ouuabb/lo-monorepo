/**
 * background.js — Service Worker
 *
 * 双通道同步核心：
 *   通道① HTTP 实时推送：翻译完成立即 POST 到 lo 插件端点
 *   通道② 本地兜底：每条记录写入 chrome.storage.local，可导出 records.json
 *
 * 防丢失策略：
 *   - 每条记录先写本地（通道②），再尝试 HTTP（通道①）
 *   - HTTP 失败不影响本地存储，数据不丢
 *   - lo 插件端通过 discover 全量校验补录本地遗漏
 *   - recordId 全局唯一，两通道都用它去重
 */

// ── 消息分发 ──

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TRANSLATION_DONE') {
    handleTranslationRecord(msg.record)
      .then(status => sendResponse({ ok: true, status }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // 异步响应
  }

  if (msg.type === 'GET_STATS') {
    getStats().then(stats => sendResponse({ ok: true, stats }));
    return true;
  }

  if (msg.type === 'EXPORT_RECORDS') {
    exportRecords().then(json => sendResponse({ ok: true, json }));
    return true;
  }

  if (msg.type === 'CLEAR_LOCAL') {
    chrome.storage.local.set({ records: [], stats: defaultStats() }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'RETRY_HTTP') {
    retryAllLocal();
    sendResponse({ ok: true });
    return false;
  }
});

// ── 核心逻辑 ──

/**
 * 处理一条翻译记录：先存本地，再推 HTTP
 *
 * 返回值语义明确区分两种状态：
 *   localSaved — 本地兜底存储是否成功（防丢失）
 *   synced     — lo 仓库是否真正同步成功（业务目标）
 *   syncReason — 未同步成功的原因：'disabled' | 'no_endpoint' | undefined
 *   syncError  — 网络/服务端错误信息（仅 synced=false 且非配置缺失时）
 */
async function handleTranslationRecord(record) {
  // 生成 recordId（去重唯一键）
  if (!record.recordId) {
    record.recordId = generateRecordId();
  }
  // 补全时间戳
  record.timestamp = record.timestamp || new Date().toISOString();

  // 通道②：先写本地（兜底，保证不丢）
  const localSaved = await saveToLocal(record);

  // 通道①：HTTP 实时推送（失败不阻塞）
  const httpResult = await pushViaHttp(record);

  return {
    localSaved: localSaved !== false,
    synced: httpResult.ok === true,
    syncReason: httpResult.reason,
    syncError: httpResult.error,
  };
}

/**
 * 通道②：写入 chrome.storage.local
 * @returns {Promise<boolean>} 始终返回 true（已存在视为已保存）；失败时抛错
 */
async function saveToLocal(record) {
  const { records = [] } = await chrome.storage.local.get('records');

  // 本地也去重（同一 recordId 不重复存）
  if (records.some(r => r.recordId === record.recordId)) {
    return true; // 已存在，视为已保存
  }

  records.push(record);
  await chrome.storage.local.set({ records });

  // 更新统计
  const stats = await getStats();
  stats.localCount = records.length;
  await chrome.storage.local.set({ stats });

  return true;
}

/**
 * 通道①：HTTP POST 到 lo 插件端点
 */
async function pushViaHttp(record) {
  const { endpoint, httpEnabled } = await chrome.storage.local.get([
    'endpoint', 'httpEnabled'
  ]);

  if (!httpEnabled) {
    return { ok: false, reason: 'disabled' };
  }
  if (!endpoint) {
    return { ok: false, reason: 'no_endpoint' };
  }

  try {
    const url = endpoint.replace(/\/$/, '') +
      '/api/plugins/chrome-translate/records';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });

    const data = await resp.json();

    // HTTP 层（状态码非 2xx）或业务层（data.ok !== true）任一失败都视为同步失败
    // 避免 lo 服务返回 500/400 时仍误报 synced=true
    if (!resp.ok || !data.ok) {
      const stats = await getStats();
      stats.httpFail = (stats.httpFail || 0) + 1;
      stats.lastHttpError = data.error || `HTTP ${resp.status}`;
      await chrome.storage.local.set({ stats });
      return { ok: false, error: data.error || `HTTP ${resp.status}` };
    }

    // 成功：更新统计
    const stats = await getStats();
    stats.httpSuccess = (stats.httpSuccess || 0) + (data.created || 0);
    stats.httpSkipped = (stats.httpSkipped || 0) + (data.skipped || 0);
    stats.lastHttpAt = new Date().toISOString();
    await chrome.storage.local.set({ stats });

    return { ok: true, data };
  } catch (e) {
    // HTTP 失败不影响本地存储，数据已兜底
    const stats = await getStats();
    stats.httpFail = (stats.httpFail || 0) + 1;
    stats.lastHttpError = e.message;
    await chrome.storage.local.set({ stats });
    return { ok: false, error: e.message };
  }
}

/**
 * 重试推送所有本地记录（HTTP 恢复后手动触发）
 */
async function retryAllLocal() {
  const { records = [] } = await chrome.storage.local.get('records');
  for (const record of records) {
    await pushViaHttp(record);
  }
}

/**
 * 导出本地所有记录为 JSON（供 lo 插件 discover 校验补录）
 */
async function exportRecords() {
  const { records = [] } = await chrome.storage.local.get('records');
  return JSON.stringify(records, null, 2);
}

// ── 工具函数 ──

function generateRecordId() {
  return 'tr_' + Date.now().toString(36) + '_' +
    Math.random().toString(36).slice(2, 8);
}

function defaultStats() {
  return {
    localCount: 0,
    httpSuccess: 0,
    httpSkipped: 0,
    httpFail: 0,
    lastHttpAt: null,
    lastHttpError: null,
  };
}

async function getStats() {
  const { stats } = await chrome.storage.local.get('stats');
  return stats || defaultStats();
}

// ── 右键菜单：划词翻译 ──

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lo-translate',
    title: '用 lo 翻译 "%s"',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'lo-translate' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'TRANSLATE_SELECTION',
      text: info.selectionText,
    });
  }
});

// ── 测试导出（Chrome service worker 环境无 module，不影响扩展加载）──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleTranslationRecord,
    pushViaHttp,
    saveToLocal,
  };
}
