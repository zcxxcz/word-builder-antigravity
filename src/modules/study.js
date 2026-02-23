/**
 * Study Page - Immersive learning experience
 * Step A: Meaning Recall → Step B: Spelling
 */
import { generateDailyTasks } from '../engine/taskGenerator.js';
import { StudySession } from '../engine/session.js';
import { getLevelName } from '../engine/srs.js';
import { speak } from '../services/tts.js';
import { navigateTo } from '../router.js';
import { showToast, pickRandomMeaning } from '../utils/helpers.js';
import { trackEvent } from '../services/analytics.js';

let session = null;

export async function renderStudy(container) {
  const mode = sessionStorage.getItem('studyMode') || 'all';
  sessionStorage.removeItem('studyMode');

  // Generate tasks
  const taskData = await generateDailyTasks({ mode });

  if (taskData.queue.length === 0) {
    container.innerHTML = `
      <div class="study-page">
        <div class="study-header">
          <button class="study-back" id="study-exit">← 返回</button>
          <span class="study-progress-text">0/0</span>
        </div>
        <div class="study-body">
          <div class="empty-state">
            <div class="empty-state-icon">🎉</div>
            <div class="empty-state-text">没有待学习的词了<br>明天再来吧！</div>
            <button class="btn btn-primary mt-24" id="back-home">返回首页</button>
          </div>
        </div>
      </div>
    `;
    container.querySelector('#study-exit').onclick = () => navigateTo('today');
    container.querySelector('#back-home').onclick = () => navigateTo('today');
    return;
  }

  trackEvent('start_session', { type: mode, count: taskData.queue.length });

  // Create session
  session = new StudySession(taskData);
  await session.init();

  // Render study UI shell
  container.innerHTML = `
    <div class="study-page" id="study-page">
      <div class="study-header">
        <button class="study-back" id="study-exit">← 退出</button>
        <span class="study-progress-text" id="progress-text">1/${taskData.queue.length}</span>
      </div>
      <div class="study-progress-bar">
        <div class="study-progress-fill" id="progress-fill" style="width:0%"></div>
      </div>
      <div class="study-body" id="study-body"></div>
    </div>
  `;

  container.querySelector('#study-exit').onclick = async () => {
    if (session.stats.totalWords > 0) {
      await session.saveSession();
    }
    navigateTo('today');
  };

  // Render first card
  renderCurrentCard();
}

function renderCurrentCard() {
  const item = session.getCurrentItem();

  if (!item) {
    // Session complete
    renderReport();
    return;
  }

  const body = document.getElementById('study-body');
  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');

  if (progressText) progressText.textContent = `${item.progress}/${item.total}`;
  if (progressFill) progressFill.style.width = `${(item.progress / item.total) * 100}%`;

  if (item.step === 'A') {
    renderStepA(body, item);
  } else {
    renderStepB(body, item);
  }
}

function renderStepA(body, item) {
  const word = item.word;
  const levelBadge = item.state?.level != null ?
    `<span class="word-level-badge level-${item.state.level}">L${item.state.level}</span>` : '';

  body.innerHTML = `
    <div class="study-card" id="step-a-card">
      <div style="text-align:center; margin-bottom:8px;">
        ${levelBadge}
        <span style="font-size:12px; color:var(--text-muted); margin-left:8px;">意思回想</span>
      </div>
      <div class="word-display">${escapeHtml(word.word)}</div>
      ${word.phonetic ? `<div class="phonetic-display">${escapeHtml(word.phonetic)}</div>` : ''}
      
      <button class="sound-btn" id="play-sound" title="播放发音">🔊</button>
      
      <div id="answer-area">
        <button class="reveal-btn" id="reveal-btn">👆 点击显示答案</button>
      </div>
    </div>
  `;

  // Play sound
  document.getElementById('play-sound').onclick = () => speak(word.word);

  // Reveal
  document.getElementById('reveal-btn').onclick = () => {
    trackEvent('show_answer', { word: word.word });

    const area = document.getElementById('answer-area');
    area.innerHTML = `
      <div class="meaning-display" style="animation:feedbackPop 0.3s ease;">${escapeHtml(word.meaningCn)}</div>
      ${word.example1 ? `<p style="font-size:14px; color:var(--text-secondary); text-align:center; margin-bottom:20px; font-style:italic;">"${escapeHtml(word.example1)}"</p>` : ''}
      <div class="eval-btns">
        <button class="eval-btn know" data-eval="know">
          <span class="eval-emoji">✅</span>
          <span class="eval-text">想对了</span>
        </button>
        <button class="eval-btn fuzzy" data-eval="fuzzy">
          <span class="eval-emoji">🤔</span>
          <span class="eval-text">模糊</span>
        </button>
        <button class="eval-btn forget" data-eval="dont_know">
          <span class="eval-emoji">❌</span>
          <span class="eval-text">没想出来</span>
        </button>
      </div>
    `;

    // Self-eval handlers
    area.querySelectorAll('.eval-btn').forEach(btn => {
      btn.onclick = async () => {
        await session.handleStepA(btn.dataset.eval);
        renderCurrentCard();
      };
    });
  };

  // Auto-play sound
  speak(word.word);
}

function renderStepB(body, item) {
  const word = item.word;
  const meaning = pickRandomMeaning(word.meaningCn);

  body.innerHTML = `
    <div class="study-card" id="step-b-card">
      <div style="text-align:center; margin-bottom:8px;">
        <span style="font-size:12px; color:var(--text-muted);">拼写测试</span>
      </div>
      <div class="meaning-display">${escapeHtml(meaning)}</div>
      
      <button class="sound-btn" id="play-sound-b" title="播放发音">🔊</button>
      
      <div class="spelling-section" id="spelling-section">
        <div class="spelling-input-wrap">
          <input type="text" class="input input-lg" id="spelling-input" 
                 placeholder="请输入英文..." autocomplete="off" autocapitalize="off" 
                 autocorrect="off" spellcheck="false" />
          <button class="spelling-submit" id="spelling-submit">→</button>
        </div>
        <button class="skip-btn" id="skip-btn">跳过（按不会处理）</button>
      </div>
      <div id="feedback-area"></div>
    </div>
  `;

  const input = document.getElementById('spelling-input');
  const submitBtn = document.getElementById('spelling-submit');

  // Focus input
  setTimeout(() => input.focus(), 100);

  // Play sound
  document.getElementById('play-sound-b').onclick = () => speak(word.word);

  // Submit handler
  const handleSubmit = async () => {
    const answer = input.value.trim().toLowerCase();
    if (!answer) return;

    const correct = answer === word.word.toLowerCase();
    const result = await session.handleStepB(correct);

    if (correct) {
      renderCorrectFeedback(word);
    } else {
      renderWrongFeedback(word, result);
    }
  };

  submitBtn.addEventListener('click', handleSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmit();
  });

  // Skip
  document.getElementById('skip-btn').addEventListener('click', async () => {
    const result = await session.handleStepB(false);
    renderWrongFeedback(word, result);
  });
}

function renderCorrectFeedback(word) {
  const section = document.getElementById('spelling-section');
  const feedbackArea = document.getElementById('feedback-area');

  section.innerHTML = '';
  feedbackArea.innerHTML = `
    <div class="feedback feedback-correct">
      <div style="font-size:32px; margin-bottom:8px;">🎉</div>
      <div style="font-size:16px; font-weight:600;">正确！</div>
      <div class="feedback-correct-answer">${escapeHtml(word.word)}</div>
    </div>
    <button class="btn btn-primary btn-full mt-16" id="next-word">下一个 →</button>
  `;

  document.getElementById('next-word').onclick = () => {
    session.advance();
    renderCurrentCard();
  };

  // Auto-advance after 1.5s
  setTimeout(() => {
    const nextBtn = document.getElementById('next-word');
    if (nextBtn) {
      session.advance();
      renderCurrentCard();
    }
  }, 1500);
}

function renderWrongFeedback(word, result) {
  const section = document.getElementById('spelling-section');
  const feedbackArea = document.getElementById('feedback-area');

  section.innerHTML = '';
  feedbackArea.innerHTML = `
    <div class="feedback feedback-wrong">
      <div style="font-size:32px; margin-bottom:8px;">😅</div>
      <div style="font-size:16px; font-weight:600;">再试一次</div>
      <div class="feedback-correct-answer" style="color:var(--danger);">${escapeHtml(word.word)}</div>
      <p style="font-size:13px; color:var(--text-secondary); margin-top:8px;">请输入正确拼写以继续</p>
    </div>
    <div class="spelling-input-wrap mt-16">
      <input type="text" class="input input-lg" id="correction-input" 
             placeholder="输入正确拼写..." autocomplete="off" autocapitalize="off"
             autocorrect="off" spellcheck="false" />
      <button class="spelling-submit" id="correction-submit">→</button>
    </div>
  `;

  const corrInput = document.getElementById('correction-input');
  const corrSubmit = document.getElementById('correction-submit');

  setTimeout(() => corrInput.focus(), 100);

  const handleCorrection = () => {
    const val = corrInput.value.trim().toLowerCase();
    if (val === word.word.toLowerCase()) {
      feedbackArea.innerHTML = `
        <div class="feedback feedback-correct">
          <div style="font-size:24px;">👍 记住了！</div>
          <div class="feedback-correct-answer">${escapeHtml(word.word)}</div>
        </div>
        <button class="btn btn-primary btn-full mt-16" id="next-word">下一个 →</button>
      `;
      document.getElementById('next-word').onclick = () => {
        session.advance();
        renderCurrentCard();
      };
    } else {
      corrInput.value = '';
      corrInput.style.borderColor = 'var(--danger)';
      corrInput.placeholder = '拼写不对，再试一次...';
      setTimeout(() => { corrInput.style.borderColor = ''; }, 800);
    }
  };

  corrSubmit.onclick = handleCorrection;
  corrInput.onkeydown = (e) => {
    if (e.key === 'Enter') handleCorrection();
  };
}

async function renderReport() {
  const report = session.getReport();
  await session.saveSession();

  const body = document.getElementById('study-body');
  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');

  if (progressText) progressText.textContent = '完成！';
  if (progressFill) progressFill.style.width = '100%';

  body.innerHTML = `
    <div class="study-card" style="text-align:center;">
      <div class="report-title" style="font-size:28px; margin-bottom:8px;">🎊 学习完成！</div>
      <div class="report-subtitle">今天又进步了一点</div>
      
      <div class="report-stats" style="margin-top:24px;">
        <div class="report-stat">
          <div class="report-stat-value">${report.totalWords}</div>
          <div class="report-stat-label">学习词数</div>
        </div>
        <div class="report-stat">
          <div class="report-stat-value">${report.spellingAccuracy}%</div>
          <div class="report-stat-label">拼写正确率</div>
        </div>
        <div class="report-stat">
          <div class="report-stat-value">${report.masteredNew}</div>
          <div class="report-stat-label">新掌握（L3）</div>
        </div>
        <div class="report-stat">
          <div class="report-stat-value">${Math.ceil((new Date() - new Date(report.startedAt)) / 60000)}min</div>
          <div class="report-stat-label">学习时长</div>
        </div>
      </div>

      ${report.hardestWord ? `
        <p class="text-muted mt-16" style="font-size:13px;">
          最难词：<strong style="color:var(--warning);">${report.hardestWord}</strong>（错${report.hardestWordErrors}次）
        </p>
      ` : ''}

      <div class="start-btn-wrap mt-24">
        <button class="btn btn-primary btn-lg btn-full" id="go-home">🏠 返回首页</button>
        <button class="btn btn-secondary btn-full" id="practice-errors">🔄 再练错词</button>
      </div>
    </div>
  `;

  document.getElementById('go-home').onclick = () => navigateTo('today');
  document.getElementById('practice-errors').onclick = () => {
    sessionStorage.setItem('studyMode', 'review');
    location.reload();
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
