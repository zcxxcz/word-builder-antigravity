/**
 * Today Page - Task entry point
 */
import { getTodayStats } from '../engine/taskGenerator.js';
import { getGreeting, getTodayDisplay } from '../utils/helpers.js';
import { navigateTo } from '../router.js';
import db from '../db.js';

export async function renderToday(container) {
  const stats = await getTodayStats();

  // Check today's sessions for streak
  const today = new Date().toISOString().split('T')[0];
  const sessions = await db.sessions.where('date').equals(today).toArray();
  const todayCompleted = sessions.length > 0;

  // Calculate streak (simple: count consecutive days with sessions)
  const streak = await calculateStreak();

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">今日学习</h1>
        <p class="page-subtitle">${getTodayDisplay()}</p>
      </div>

      <div class="today-hero">
        <p class="today-greeting">${getGreeting()}</p>
        ${stats.activeListExhausted ? `
        <div style="background:var(--warning-bg, rgba(251,191,36,0.15));border:1px solid rgba(251,191,36,0.3);border-radius:var(--radius);padding:10px 14px;margin:8px 0;font-size:13px;color:var(--warning, #fbbf24);line-height:1.5;">
          📢 「${stats.activeListName}」的新词已学完！新词将从其他词表补充。
        </div>
        ` : ''}
        ${streak > 0 ? `<div class="today-streak">🔥 连续打卡 ${streak} 天</div>` : ''}
        
        <div class="stat-grid" style="margin-top:16px;">
          <div class="stat-item">
            <div class="stat-number">${stats.reviewCount}</div>
            <div class="stat-label">待复习</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">${stats.newCount}</div>
            <div class="stat-label">新学</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">~${stats.estimatedMinutes}min</div>
            <div class="stat-label">预计时长</div>
          </div>
        </div>

        <div class="start-btn-wrap">
          ${stats.reviewCount + stats.newCount > 0 ? `
            <button class="btn btn-primary btn-lg btn-full" id="start-all">
              🚀 开始学习 (${stats.reviewCount + stats.newCount} 词)
            </button>
            <div class="start-sub-btns">
              ${stats.reviewCount > 0 ? `<button class="btn btn-secondary" id="start-review">📝 只复习 (${stats.reviewCount})</button>` : ''}
              ${stats.newCount > 0 ? `<button class="btn btn-secondary" id="start-new">✨ 只新学 (${stats.newCount})</button>` : ''}
            </div>
          ` : `
            <div class="empty-state" style="padding:20px 0;">
              <div class="empty-state-icon">🎉</div>
              <div class="empty-state-text">今天的任务已完成！<br>明天再来吧</div>
            </div>
          `}
        </div>
      </div>

      ${todayCompleted ? await renderTodayReport(sessions) : ''}

      <div class="card">
        <div class="card-header">
          <span class="card-title">📊 总览</span>
        </div>
        <div class="stat-grid">
          <div class="stat-item">
            <div class="stat-number">${stats.totalLearned}</div>
            <div class="stat-label">已学</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">${stats.masteredCount}</div>
            <div class="stat-label">已掌握</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">${stats.totalWords}</div>
            <div class="stat-label">总词数</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Event listeners
  const startAll = container.querySelector('#start-all');
  const startReview = container.querySelector('#start-review');
  const startNew = container.querySelector('#start-new');

  if (startAll) startAll.onclick = () => startStudy('all');
  if (startReview) startReview.onclick = () => startStudy('review');
  if (startNew) startNew.onclick = () => startStudy('new');

  // "再练5分钟" button
  const practiceMore = container.querySelector('#practice-more');
  if (practiceMore) practiceMore.onclick = () => startStudy('review');
}

function startStudy(mode) {
  // Store mode in session storage for the study page to pick up
  sessionStorage.setItem('studyMode', mode);
  navigateTo('study');
}

async function renderTodayReport(sessions) {
  const latest = sessions[sessions.length - 1];
  return `
    <div class="report-card">
      <div class="report-title">✅ 今日已完成</div>
      <div class="report-subtitle">继续保持！</div>
      <div class="report-stats">
        <div class="report-stat">
          <div class="report-stat-value">${latest.totalWords || 0}</div>
          <div class="report-stat-label">学习词数</div>
        </div>
        <div class="report-stat">
          <div class="report-stat-value">${latest.spellingAccuracy || 0}%</div>
          <div class="report-stat-label">拼写正确率</div>
        </div>
        <div class="report-stat">
          <div class="report-stat-value">${latest.masteredNew || 0}</div>
          <div class="report-stat-label">新掌握</div>
        </div>
        <div class="report-stat">
          <div class="report-stat-value">${Math.ceil((latest.duration || 0) / 60)}min</div>
          <div class="report-stat-label">学习时长</div>
        </div>
      </div>
      ${latest.hardestWord ? `<p class="text-muted" style="font-size:13px;">最难词：<strong>${latest.hardestWord}</strong></p>` : ''}
      <button class="btn btn-secondary btn-sm mt-16" id="practice-more">🔄 再练5分钟（错词）</button>
    </div>
  `;
}

async function calculateStreak() {
  const sessions = await db.sessions.orderBy('date').reverse().toArray();
  if (sessions.length === 0) return 0;

  const dates = [...new Set(sessions.map(s => s.date))];
  dates.sort((a, b) => b.localeCompare(a)); // Newest first

  let streak = 0;
  const today = new Date();

  for (let i = 0; i < dates.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const expectedStr = expected.toISOString().split('T')[0];

    if (dates[i] === expectedStr) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}
