/**
 * Wordlist Page - Browse, manage, and add words
 */
import db from '../db.js';
import { getWordsWithState } from '../db.js';
import { getLevelName } from '../engine/srs.js';
import { lookupWord } from '../services/dictionary.js';
import { generateWordContent } from '../services/deepseek.js';
import { speak } from '../services/tts.js';
import { parseCSV, validateCSV } from '../utils/csv.js';
import { showToast, createElement } from '../utils/helpers.js';

export async function renderWordlist(container) {
    const wordlists = await db.wordlists.toArray();
    const allWords = await db.words.toArray();
    const states = await db.userWordState.toArray();
    const stateMap = new Map(states.map(s => [s.wordId, s]));

    // Group words by wordlist, then by unit
    const grouped = {};
    for (const wl of wordlists) {
        const words = allWords.filter(w => w.wordlistId === wl.id);
        const unitMap = {};
        for (const w of words) {
            const unit = w.unit || '未分组';
            if (!unitMap[unit]) unitMap[unit] = [];
            unitMap[unit].push({ ...w, state: stateMap.get(w.id) });
        }
        grouped[wl.id] = { wordlist: wl, units: unitMap, count: words.length };
    }

    container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">词表</h1>
        <p class="page-subtitle">共 ${allWords.length} 个词</p>
      </div>

      <div class="btn-group mb-16">
        <button class="btn btn-primary btn-sm" id="add-word-btn">➕ 添加生词</button>
        <button class="btn btn-secondary btn-sm" id="import-csv-btn">📥 导入 CSV</button>
        <button class="btn btn-secondary btn-sm" id="create-list-btn">📁 新建词表</button>
      </div>

      <div id="wordlist-tree">
        ${Object.values(grouped).map(g => renderWordlistGroup(g)).join('')}
      </div>
    </div>
  `;

    // Tree toggle
    container.querySelectorAll('.wordlist-tree-header').forEach(header => {
        header.onclick = () => {
            header.classList.toggle('open');
            const children = header.nextElementSibling;
            if (children) children.classList.toggle('open');
        };
    });

    container.querySelectorAll('.unit-header').forEach(header => {
        header.onclick = (e) => {
            e.stopPropagation();
            header.classList.toggle('open');
            const children = header.nextElementSibling;
            if (children) children.classList.toggle('open');
        };
    });

    // Sound buttons
    container.querySelectorAll('.word-sound').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            speak(btn.dataset.word);
        };
    });

    // Add word
    container.querySelector('#add-word-btn').onclick = () => showAddWordModal(wordlists);

    // Import CSV
    container.querySelector('#import-csv-btn').onclick = () => showCSVImportModal(wordlists);

    // Create list
    container.querySelector('#create-list-btn').onclick = () => showCreateListModal();
}

function renderWordlistGroup(g) {
    const sourceLabel = g.wordlist.source === 'builtin' ? '📗 内置' : '📝 自定义';
    return `
    <div class="wordlist-tree-item">
      <div class="wordlist-tree-header">
        <span class="tree-label">${sourceLabel} ${escapeHtml(g.wordlist.name)}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="tree-count">${g.count} 词</span>
          <span class="tree-arrow">▶</span>
        </div>
      </div>
      <div class="wordlist-tree-children">
        ${Object.entries(g.units).map(([unit, words]) => `
          <div style="margin-bottom:4px;">
            <div class="unit-header" style="padding:8px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-radius:8px;background:var(--bg-elevated);margin-bottom:4px;">
              <span style="font-size:13px;font-weight:600;color:var(--text-secondary);">📖 ${escapeHtml(unit)}</span>
              <span style="font-size:12px;color:var(--text-muted);">${words.length} 词 ▶</span>
            </div>
            <div class="wordlist-tree-children">
              ${words.map(w => `
                <div class="word-row">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <button class="word-sound" data-word="${escapeHtml(w.word)}" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px;">🔊</button>
                    <span class="word-en">${escapeHtml(w.word)}</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:4px;">
                    <span class="word-cn">${escapeHtml(w.meaningCn)}</span>
                    ${w.state ? `<span class="word-level-badge level-${w.state.level}">L${w.state.level}</span>` : '<span class="word-level-badge level-0">--</span>'}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function showAddWordModal(wordlists) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">➕ 添加生词</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="form-group">
        <label class="form-label">英文单词</label>
        <div style="display:flex;gap:8px;">
          <input type="text" class="input" id="add-word-input" placeholder="输入英文单词..." autofocus />
          <button class="btn btn-primary" id="generate-btn">生成</button>
        </div>
      </div>
      <div id="generated-content" style="display:none;">
        <div class="form-group">
          <label class="form-label">中文释义</label>
          <input type="text" class="input" id="gen-meaning" />
        </div>
        <div class="form-group">
          <label class="form-label">音标</label>
          <input type="text" class="input" id="gen-phonetic" />
        </div>
        <div class="form-group">
          <label class="form-label">例句 1</label>
          <input type="text" class="input" id="gen-example1" />
        </div>
        <div class="form-group">
          <label class="form-label">例句 2</label>
          <input type="text" class="input" id="gen-example2" />
        </div>
        <div class="form-group">
          <label class="form-label">保存到词表</label>
          <select class="input" id="gen-wordlist">
            ${wordlists.map(wl => `<option value="${wl.id}">${escapeHtml(wl.name)}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-success btn-full" id="save-word-btn">💾 保存</button>
      </div>
      <div id="generating-spinner" style="display:none;">
        <div class="loading-spinner"></div>
        <p class="text-center text-muted">正在生成内容...</p>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);

    overlay.querySelector('#modal-close').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    // Generate
    overlay.querySelector('#generate-btn').onclick = async () => {
        const word = overlay.querySelector('#add-word-input').value.trim();
        if (!word) return;

        overlay.querySelector('#generating-spinner').style.display = 'block';
        overlay.querySelector('#generated-content').style.display = 'none';

        try {
            // Dictionary lookup
            const dictResult = await lookupWord(word);

            // DeepSeek generation
            const genResult = await generateWordContent(word, dictResult.definitions);

            overlay.querySelector('#gen-meaning').value = genResult.meaningCn;
            overlay.querySelector('#gen-phonetic').value = dictResult.phonetic;
            overlay.querySelector('#gen-example1').value = genResult.example1;
            overlay.querySelector('#gen-example2').value = genResult.example2;

            overlay.querySelector('#generating-spinner').style.display = 'none';
            overlay.querySelector('#generated-content').style.display = 'block';

            if (!dictResult.found) {
                showToast('未找到词典信息，请手动补充', 'warning');
            }
        } catch (err) {
            overlay.querySelector('#generating-spinner').style.display = 'none';
            showToast('生成失败：' + err.message, 'error');
        }
    };

    // Save
    overlay.querySelector('#save-word-btn').onclick = async () => {
        const word = overlay.querySelector('#add-word-input').value.trim();
        const meaningCn = overlay.querySelector('#gen-meaning').value.trim();
        const phonetic = overlay.querySelector('#gen-phonetic').value.trim();
        const example1 = overlay.querySelector('#gen-example1').value.trim();
        const example2 = overlay.querySelector('#gen-example2').value.trim();
        const wordlistId = parseInt(overlay.querySelector('#gen-wordlist').value);

        if (!word) { showToast('请输入英文单词', 'error'); return; }

        await db.words.add({
            wordlistId,
            word,
            meaningCn: meaningCn || word,
            unit: '自定义',
            phonetic,
            example1,
            example2,
            source: 'custom'
        });

        showToast('✅ 已保存！', 'success');
        overlay.remove();

        // Refresh page
        const container = document.getElementById('page-container');
        await renderWordlist(container);
    };
}

function showCSVImportModal(wordlists) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">📥 导入 CSV</h3>
        <button class="modal-close" id="csv-close">✕</button>
      </div>
      <div class="form-group">
        <label class="form-label">导入到词表</label>
        <select class="input" id="csv-wordlist">
          ${wordlists.filter(wl => wl.source !== 'builtin').map(wl => `<option value="${wl.id}">${escapeHtml(wl.name)}</option>`).join('')}
        </select>
        <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">需先创建自定义词表</p>
      </div>
      <div class="csv-dropzone" id="csv-dropzone">
        <div class="csv-dropzone-icon">📄</div>
        <div class="csv-dropzone-text">点击选择 CSV 文件<br>格式：word,meaning_cn,unit,example</div>
        <input type="file" accept=".csv" id="csv-file" style="display:none" />
      </div>
      <div id="csv-preview" style="display:none;"></div>
    </div>
  `;
    document.body.appendChild(overlay);

    overlay.querySelector('#csv-close').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    const dropzone = overlay.querySelector('#csv-dropzone');
    const fileInput = overlay.querySelector('#csv-file');

    dropzone.onclick = () => fileInput.click();

    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const text = await file.text();
        const rows = parseCSV(text);
        const validation = validateCSV(rows);

        if (!validation.valid) {
            showToast(validation.error, 'error');
            return;
        }

        // Show preview
        const preview = overlay.querySelector('#csv-preview');
        preview.style.display = 'block';
        preview.innerHTML = `
      <p style="font-size:13px;color:var(--text-secondary);margin:12px 0;">
        预览：共 ${rows.length} 个词
      </p>
      <div style="max-height:200px;overflow-y:auto;">
        <table class="csv-preview-table">
          <thead><tr><th>Word</th><th>中文</th><th>单元</th></tr></thead>
          <tbody>
            ${rows.slice(0, 10).map(r => `<tr><td>${escapeHtml(r.word)}</td><td>${escapeHtml(r.meaning_cn || '')}</td><td>${escapeHtml(r.unit || '')}</td></tr>`).join('')}
            ${rows.length > 10 ? `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);">...还有 ${rows.length - 10} 个词</td></tr>` : ''}
          </tbody>
        </table>
      </div>
      <button class="btn btn-success btn-full mt-16" id="confirm-import">✅ 确认导入 ${rows.length} 个词</button>
    `;

        preview.querySelector('#confirm-import').onclick = async () => {
            const wordlistId = parseInt(overlay.querySelector('#csv-wordlist').value);
            if (!wordlistId) {
                showToast('请先选择或创建词表', 'error');
                return;
            }

            const wordRows = rows.map(r => ({
                wordlistId,
                word: r.word,
                meaningCn: r.meaning_cn || r.meaningcn || '',
                unit: r.unit || '导入',
                phonetic: r.phonetic || '',
                example1: r.example || r.example1 || '',
                example2: r.example2 || '',
                source: 'csv_import'
            }));

            await db.words.bulkAdd(wordRows);
            showToast(`✅ 已导入 ${rows.length} 个词`, 'success');
            overlay.remove();

            const ctn = document.getElementById('page-container');
            await renderWordlist(ctn);
        };
    };
}

function showCreateListModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">📁 新建词表</h3>
        <button class="modal-close" id="list-close">✕</button>
      </div>
      <div class="form-group">
        <label class="form-label">词表名称</label>
        <input type="text" class="input" id="list-name" placeholder="例如：期末重点词" autofocus />
      </div>
      <button class="btn btn-primary btn-full" id="create-list-confirm">创建</button>
    </div>
  `;
    document.body.appendChild(overlay);

    overlay.querySelector('#list-close').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#create-list-confirm').onclick = async () => {
        const name = overlay.querySelector('#list-name').value.trim();
        if (!name) { showToast('请输入名称', 'error'); return; }

        await db.wordlists.add({
            name,
            source: 'custom',
            createdAt: new Date().toISOString()
        });

        showToast('✅ 词表已创建', 'success');
        overlay.remove();

        const ctn = document.getElementById('page-container');
        await renderWordlist(ctn);
    };
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
