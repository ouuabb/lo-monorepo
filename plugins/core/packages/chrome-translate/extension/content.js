/**
 * content.js — 划词翻译
 *
 * 交互流程：
 *   选中文字 → mouseup → 弹出翻译结果 → 发送给 background（双通道同步）
 *
 * 翻译 API：Lingva（免费、无需 key）
 *   GET https://lingva.ml/api/v1/{source}/{target}/{text}
 */

let popup = null;
let hideTimer = null;
// 自增请求序号，用于检测竞态：若 await 期间用户又触发新翻译，
// currentRequestId 会变化，旧请求的后续 DOM 更新应被放弃
let currentRequestId = 0;

// 选中文字后 mouseup 触发翻译
document.addEventListener('mouseup', (e) => {
  const selection = window.getSelection().toString().trim();
  if (!selection) {
    return;
  }
  // 忽略过长的选区（可能是整页复制）
  if (selection.length > 500) return;

  clearTimeout(hideTimer);
  // 延迟显示，避免选区还在变化
  setTimeout(() => showTranslatePopup(selection, e), 150);
});

// 接收右键菜单翻译请求
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TRANSLATE_SELECTION' && msg.text) {
    showTranslatePopup(msg.text, { pageX: window.innerWidth / 2, pageY: 100 });
  }
});

/**
 * 显示翻译弹窗
 *
 * 竞态防护：每次调用自增 requestId，await 后检查是否仍是当前请求。
 * 若用户在翻译/同步期间又选了新词，currentRequestId 会变化，
 * 旧请求放弃所有后续 DOM 更新，避免误更新新弹窗的 hint。
 */
async function showTranslatePopup(text, e) {
  const requestId = ++currentRequestId;

  ensurePopup();
  positionPopup(e);

  popup.innerHTML =
    '<div class="lo-tr-loading">翻译中...</div>';
  popup.style.display = 'block';

  try {
    const { sourceLang = 'auto', targetLang = 'zh' } =
      await chrome.storage.local.get(['sourceLang', 'targetLang']);

    const translation = await translateText(text, sourceLang, targetLang);

    // 翻译 API 返回前若用户已触发新翻译，放弃本次更新
    if (requestId !== currentRequestId) return;

    // 先渲染翻译结果 + 同步中提示（避免硬编码"已同步到 lo"）
    popup.innerHTML = `
      <div class="lo-tr-original">${escapeHtml(text)}</div>
      <div class="lo-tr-divider"></div>
      <div class="lo-tr-result">${escapeHtml(translation)}</div>
      <div class="lo-tr-hint lo-tr-hint-pending">同步中...</div>
    `;

    // 发送翻译记录给 background（双通道同步），等待真实同步结果
    const hint = await syncRecord({
      original: text,
      translation: translation,
      sourceLang: sourceLang,
      targetLang: targetLang,
      context: getContextSentence(text),
      url: location.href,
      pageTitle: document.title,
    });

    // syncRecord 返回前若用户已触发新翻译，放弃 hint 更新（避免误更新新弹窗）
    if (requestId !== currentRequestId) return;

    // 根据真实同步状态更新提示
    const hintEl = popup.querySelector('.lo-tr-hint');
    if (hintEl) {
      hintEl.textContent = hint.text;
      hintEl.className = `lo-tr-hint ${hint.className}`;
    }
  } catch (err) {
    // 翻译失败时也要检查竞态
    if (requestId !== currentRequestId) return;
    popup.innerHTML =
      `<div class="lo-tr-error">翻译失败: ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * 发送翻译记录给 background，等待并返回真实同步状态对应的提示文案
 *
 * 之前是 fire-and-forget，弹窗硬编码"已同步到 lo"，与真实同步状态脱钩。
 * 现在通过回调读取 background 返回的 status，区分：
 *   - synced=true              → 已同步到 lo
 *   - syncReason='no_endpoint' → 仅本地保存（未配置 lo 端点）
 *   - syncReason='disabled'    → 仅本地保存（HTTP 推送未启用）
 *   - 其他失败                 → 同步失败：xxx（已本地保存）
 */
function syncRecord(record) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'TRANSLATION_DONE', record }, (resp) => {
      // 扩展通信错误（如 background 未响应）
      if (chrome.runtime.lastError) {
        resolve({
          text: '同步失败：扩展通信错误（已本地保存）',
          className: 'lo-tr-hint-error',
        });
        return;
      }
      if (!resp || !resp.ok) {
        resolve({
          text: `同步失败：${(resp && resp.error) || '未知错误'}`,
          className: 'lo-tr-hint-error',
        });
        return;
      }
      const status = resp.status || {};
      if (status.synced) {
        resolve({ text: '已同步到 lo', className: 'lo-tr-hint-ok' });
      } else if (status.syncReason === 'no_endpoint') {
        resolve({
          text: '仅本地保存（未配置 lo 端点）',
          className: 'lo-tr-hint-warn',
        });
      } else if (status.syncReason === 'disabled') {
        resolve({
          text: '仅本地保存（HTTP 推送未启用）',
          className: 'lo-tr-hint-warn',
        });
      } else {
        const err = status.syncError || '未知原因';
        resolve({
          text: `同步失败：${err}（已本地保存）`,
          className: 'lo-tr-hint-error',
        });
      }
    });
  });
}

/**
 * 调用 Lingva 翻译 API
 */
async function translateText(text, source, target) {
  const src = source === 'auto' ? 'auto' : source;
  const url = `https://lingva.ml/api/v1/${src}/${target}/` +
    encodeURIComponent(text);

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.text || '';
}

/**
 * 获取选中词所在的句子（上下文）
 */
function getContextSentence(word) {
  const selection = window.getSelection();
  if (!selection.anchorNode) return '';

  const fullText = selection.anchorNode.textContent || '';
  const idx = fullText.indexOf(word);
  if (idx === -1) return '';

  // 取词前 30 字 + 词 + 词后 30 字
  const start = Math.max(0, idx - 30);
  const end = Math.min(fullText.length, idx + word.length + 30);
  return fullText.slice(start, end).trim();
}

// ── 弹窗管理 ──

function ensurePopup() {
  if (popup) return;
  popup = document.createElement('div');
  popup.id = 'lo-translate-popup';
  popup.className = 'lo-tr-popup';
  document.body.appendChild(popup);

  // 点击弹窗外部隐藏
  document.addEventListener('mousedown', (e) => {
    if (popup && popup.style.display === 'block' &&
        !popup.contains(e.target)) {
      hideTimer = setTimeout(() => {
        if (popup) popup.style.display = 'none';
      }, 200);
    }
  });
}

function positionPopup(e) {
  const x = e.pageX || (window.innerWidth / 2);
  const y = e.pageY || 100;
  popup.style.left = `${Math.min(x, window.innerWidth - 320)}px`;
  popup.style.top = `${y + 16}px`;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ── 测试导出（Chrome content script 环境无 module，不影响扩展加载）──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { syncRecord };
}
