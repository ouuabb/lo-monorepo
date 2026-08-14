/**
 * popup.js — 弹窗状态展示
 */

// 加载统计
chrome.runtime.sendMessage({ type: 'GET_STATS' }, (resp) => {
  if (!resp || !resp.ok) return;
  const s = resp.stats;
  document.getElementById('localCount').textContent = s.localCount || 0;
  document.getElementById('httpSuccess').textContent = s.httpSuccess || 0;
  document.getElementById('httpSkipped').textContent = s.httpSkipped || 0;
  document.getElementById('httpFail').textContent = s.httpFail || 0;
});

// 显示端点状态
chrome.storage.local.get(['endpoint', 'httpEnabled'], (cfg) => {
  const el = document.getElementById('endpointStatus');
  if (!cfg.httpEnabled) {
    el.textContent = 'HTTP 推送未启用';
    el.className = 'endpoint-status warn';
  } else if (!cfg.endpoint) {
    el.textContent = '未配置 lo 端点（请在设置中填写）';
    el.className = 'endpoint-status warn';
  } else {
    el.textContent = `端点: ${cfg.endpoint}`;
    el.className = 'endpoint-status ok';
  }
});

// 打开设置页
document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// 重试 HTTP 推送
document.getElementById('retryHttp').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RETRY_HTTP' }, () => {
    window.close();
  });
});
