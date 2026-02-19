/**
 * Settings Page - Configuration, data import/export
 */
import { getSetting, setSetting, exportAllData, importAllData, clearAllData, initDefaultSettings } from '../db.js';
import { showToast, confirmDialog } from '../utils/helpers.js';

export async function renderSettings(container) {
    const dailyNew = await getSetting('dailyNew');
    const reviewCap = await getSetting('reviewCap');
    const relapseCap = await getSetting('relapseCap');
    const ttsEnabled = await getSetting('ttsEnabled');

    container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">设置</h1>
        <p class="page-subtitle">个性化你的学习体验</p>
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
            <div class="settings-item-label" style="color:var(--danger);">🗑️ 清空全部数据</div>
            <div class="settings-item-desc">删除所有词表和学习记录</div>
          </div>
          <span style="color:var(--text-muted);">▶</span>
        </div>
      </div>

      <div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:12px;">
        <p>初一背单词 v1.0</p>
        <p style="margin-top:4px;">数据存储在本地浏览器中</p>
      </div>
    </div>
  `;

    // Settings change handlers
    const debounceSet = (id, key) => {
        const el = container.querySelector(id);
        el.onchange = async () => {
            const val = parseInt(el.value) || 10;
            await setSetting(key, val);
            showToast('✅ 已保存', 'success');
        };
    };

    debounceSet('#set-daily-new', 'dailyNew');
    debounceSet('#set-review-cap', 'reviewCap');
    debounceSet('#set-relapse-cap', 'relapseCap');

    container.querySelector('#set-tts').onchange = async (e) => {
        await setSetting('ttsEnabled', e.target.checked);
        showToast('✅ 已保存', 'success');
    };

    // Export
    container.querySelector('#export-data').onclick = async () => {
        const data = await exportAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `word-builder-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('✅ 数据已导出', 'success');
    };

    // Import
    container.querySelector('#import-data').onclick = async () => {
        const confirmed = await confirmDialog('导入将覆盖当前全部数据，确定继续？');
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
                await importAllData(data);
                showToast('✅ 数据已导入，正在刷新...', 'success');
                setTimeout(() => location.reload(), 1000);
            } catch (err) {
                showToast('导入失败：' + err.message, 'error');
            }
        };
        input.click();
    };

    // Clear
    container.querySelector('#clear-data').onclick = async () => {
        const confirmed1 = await confirmDialog('⚠️ 确定要清空全部数据？此操作不可恢复！');
        if (!confirmed1) return;
        const confirmed2 = await confirmDialog('⚠️ 最后确认：真的要删除所有词表和学习记录吗？');
        if (!confirmed2) return;

        await clearAllData();
        showToast('数据已清空，正在重新初始化...', 'success');
        setTimeout(() => location.reload(), 1000);
    };
}
