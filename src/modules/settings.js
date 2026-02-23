/**
 * Settings Page - Configuration, account, data import/export
 */
import { getSetting, setSetting, exportAllData, importAllData, clearAllData, initDefaultSettings, getWordlists } from '../db.js';
import { showToast, confirmDialog } from '../utils/helpers.js';
import { getUser, signOut } from '../services/auth.js';
import { navigateTo } from '../router.js';

export async function renderSettings(container) {
  const dailyNew = await getSetting('dailyNewWords') || 10;
  const reviewCap = await getSetting('dailyReviewCap') || 50;
  const relapseCap = await getSetting('relapseCap') || 10;
  const ttsEnabled = await getSetting('ttsEnabled') !== false;
  const activeWordlistId = await getSetting('activeWordlistId');
  const wordlists = await getWordlists();
  const user = getUser();

  const wordlistOptions = wordlists.map(wl =>
    `<option value="${wl.id}" ${activeWordlistId === wl.id || activeWordlistId === wl.numericId ? 'selected' : ''}>${wl.name}</option>`
  ).join('');

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">设置</h1>
        <p class="page-subtitle">个性化你的学习体验</p>
      </div>

      <!-- Account Section -->
      <div class="settings-group">
        <div class="settings-group-title">账号</div>
        
        ${user ? `
        <div class="settings-item">
          <div>
            <div class="settings-item-label">📧 ${user.email}</div>
            <div class="settings-item-desc">已登录（数据实时云端保存）</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-logout">登出</button>
        </div>
        ` : `
        <div class="settings-item" style="cursor:pointer;" id="btn-login">
          <div>
            <div class="settings-item-label">🔐 你尚未登录</div>
            <div class="settings-item-desc">本应用需要登录才能使用</div>
          </div>
          <span style="color:var(--text-muted);">▶</span>
        </div>
        `}
      </div>

      <div class="settings-group">
        <div class="settings-group-title">学习参数</div>
        
        <div class="settings-item">
          <div>
            <div class="settings-item-label">每日新学量</div>
            <div class="settings-item-desc">每天学习多少个新词</div>
          </div>
          <input type="number" id="set-daily-new" value="${dailyNew}" min="1" max="50" />
        </div>

        <div class="settings-item">
          <div>
            <div class="settings-item-label">复习上限</div>
            <div class="settings-item-desc">每日最多复习多少词</div>
          </div>
          <input type="number" id="set-review-cap" value="${reviewCap}" min="5" max="100" />
        </div>

        <div class="settings-item">
          <div>
            <div class="settings-item-label">回流上限</div>
            <div class="settings-item-desc">当天错词最多回流多少</div>
          </div>
          <input type="number" id="set-relapse-cap" value="${relapseCap}" min="3" max="30" />
        </div>

        <div class="settings-item">
          <div>
            <div class="settings-item-label">当前学习词表</div>
            <div class="settings-item-desc">新词优先从此词表选取</div>
          </div>
          <select id="set-active-wordlist" style="background:var(--surface-2);color:var(--text-primary);border:1px solid var(--border);border-radius:var(--radius);padding:6px 10px;font-size:14px;min-width:120px;">
            <option value="" ${!activeWordlistId ? 'selected' : ''}>全部词表</option>
            ${wordlistOptions}
          </select>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-title">发音</div>
        
        <div class="settings-item">
          <div>
            <div class="settings-item-label">TTS 自动发音</div>
            <div class="settings-item-desc">学习时自动播放单词发音</div>
          </div>
          <label class="toggle">
            <input type="checkbox" id="set-tts" ${ttsEnabled ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-title">数据管理</div>
        
        <div class="settings-item" style="cursor:pointer;" id="export-data">
          <div>
            <div class="settings-item-label">📤 导出数据 (JSON)</div>
            <div class="settings-item-desc">备份全部学习数据</div>
          </div>
          <span style="color:var(--text-muted);">▶</span>
        </div>

        <div class="settings-item" style="cursor:pointer;" id="import-data">
          <div>
            <div class="settings-item-label">📥 导入数据 (JSON)</div>
            <div class="settings-item-desc">从备份恢复数据（覆盖当前）</div>
          </div>
          <span style="color:var(--text-muted);">▶</span>
        </div>

        <div class="settings-item" style="cursor:pointer;" id="clear-data">
          <div>
            <div class="settings-item-label" style="color:var(--danger);">🗑️ 清空全部账号数据</div>
            <div class="settings-item-desc">删除云端所有词表和学习记录</div>
          </div>
          <span style="color:var(--text-muted);">▶</span>
        </div>
      </div>

      <div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:12px;">
        <p>初一背单词 v2.0 (实时云端版)</p>
      </div>
    </div>
  `;

  // ─── Event Bindings ───

  // Account
  if (user) {
    container.querySelector('#btn-logout').onclick = async () => {
      const confirmed = await confirmDialog('确定要登出吗？');
      if (!confirmed) return;
      await signOut();
      showToast('已登出', 'info');
      navigateTo('login');
    };
  } else {
    const loginBtn = container.querySelector('#btn-login');
    if (loginBtn) {
      loginBtn.onclick = () => navigateTo('login');
    }
  }

  // Learning params
  const debounceSet = (id, key) => {
    const el = container.querySelector(id);
    el.onchange = async () => {
      const val = parseInt(el.value) || 10;
      await setSetting(key, val);
      showToast('✅ 已保存', 'success');
    };
  };

  debounceSet('#set-daily-new', 'dailyNewWords');
  debounceSet('#set-review-cap', 'dailyReviewCap');
  debounceSet('#set-relapse-cap', 'relapseCap');

  container.querySelector('#set-active-wordlist').onchange = async (e) => {
    const val = e.target.value || null;
    await setSetting('activeWordlistId', val);
    showToast('✅ 已切换学习词表', 'success');
  };

  container.querySelector('#set-tts').onchange = async (e) => {
    await setSetting('ttsEnabled', e.target.checked);
    showToast('✅ 已保存', 'success');
  };

  // Export
  container.querySelector('#export-data').onclick = async () => {
    showToast('正在准备导出数据...', 'info');
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `word-builder-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('✅ 数据已导出', 'success');
    } catch (err) {
      showToast('导出失败: ' + err.message, 'error');
    }
  };

  // Import
  container.querySelector('#import-data').onclick = async () => {
    const confirmed = await confirmDialog('导入将覆盖云端数据，确定继续？');
    if (!confirmed) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        showToast('正在导入数据...', 'info');
        await importAllData(data);
        showToast('✅ 数据已导入，重新加载中...', 'success');
        setTimeout(() => location.reload(), 1000);
      } catch (err) {
        showToast('导入失败：' + err.message, 'error');
      }
    };
    input.click();
  };

  // Clear
  container.querySelector('#clear-data').onclick = async () => {
    const confirmed1 = await confirmDialog('⚠️ 确定要清空云端全部数据？此操作不可恢复！');
    if (!confirmed1) return;
    const confirmed2 = await confirmDialog('⚠️ 最后确认：真的要删除所有词汇和学习记录吗？');
    if (!confirmed2) return;

    try {
      await clearAllData();
      showToast('数据已清空，正在重新加载...', 'success');
      setTimeout(() => location.reload(), 1000);
    } catch (err) {
      showToast('清理失败: ' + err.message, 'error');
    }
  };
}
