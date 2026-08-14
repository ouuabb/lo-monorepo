/**
 * options.js — 配置页逻辑
 */

// 加载已保存的配置
chrome.storage.local.get([
  'sourceLang', 'targetLang', 'endpoint',
  'httpEnabled', 'localEnabled'
], (cfg) => {
  document.getElementById('sourceLang').value = cfg.sourceLang || 'auto';
  document.getElementById('targetLang').value = cfg.targetLang || 'zh';
  document.getElementById('endpoint').value = cfg.endpoint || '';
  document.getElementById('httpEnabled').checked = cfg.httpEnabled !== false;
  document.getElementById('localEnabled').checked = cfg.localEnabled !== false;
});

// 保存配置
document.getElementById('save').addEventListener('click', () => {
  const cfg = {
    sourceLang: document.getElementById('sourceLang').value,
    targetLang: document.getElementById('targetLang').value,
    endpoint: document.getElementById('endpoint').value.trim(),
    httpEnabled: document.getElementById('httpEnabled').checked,
    localEnabled: document.getElementById('localEnabled').checked,
  };
  chrome.storage.local.set(cfg, () => {
    const hint = document.getElementById('savedHint');
    hint.style.display = 'inline';
    setTimeout(() => { hint.style.display = 'none'; }, 1500);
  });
});

// 导出 records.json
document.getElementById('export').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'EXPORT_RECORDS' }, (resp) => {
    if (resp && resp.ok) {
      // 触发下载
      const blob = new Blob([resp.json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'records.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  });
});

// 重试 HTTP 推送
document.getElementById('retry').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RETRY_HTTP' }, (resp) => {
    if (resp && resp.ok) {
      alert('已触发重试，请查看 popup 统计');
    }
  });
});

// 清空本地记录
document.getElementById('clear').addEventListener('click', () => {
  if (confirm('确定清空所有本地翻译记录？此操作不可恢复。')) {
    chrome.runtime.sendMessage({ type: 'CLEAR_LOCAL' }, () => {
      alert('已清空');
    });
  }
});
