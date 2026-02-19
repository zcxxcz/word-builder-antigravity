/**
 * Progress Page - Learning statistics and level distribution
 */
import db from '../db.js';

export async function renderProgress(container) {
    const words = await db.words.toArray();
    const states = await db.userWordState.toArray();
    const sessions = await db.sessions.toArray();

    const stateMap = new Map(states.map(s => [s.wordId, s]));

    // Calculate stats
    let totalLearned = 0;
    let mastered = 0;
    const levelDist = [0, 0, 0, 0];

    for (const word of words) {
        const state = stateMap.get(word.id);
        if (state && state.lastSeenAt) {
            totalLearned++;
            const level = state.level || 0;
            levelDist[level]++;
            if (level === 3) mastered++;
        }
    }

    // Week stats
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const weekSessions = sessions.filter(s => s.date >= weekAgoStr);
    const weekDays = new Set(weekSessions.map(s => s.date)).size;
    const weekWords = weekSessions.reduce((sum, s) => sum + (s.totalWords || 0), 0);
    const weekAvgAccuracy = weekSessions.length > 0
        ? Math.round(weekSessions.reduce((sum, s) => sum + (s.spellingAccuracy || 0), 0) / weekSessions.length)
        : 0;

    // Streak
    const streak = calculateStreak(sessions);

    const maxLevel = Math.max(...levelDist, 1);

    container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">学习进度</h1>
        <p class="page-subtitle">累计学习 ${totalLearned} 词，掌握 ${mastered} 词</p>
      </div>

      <div class="stat-grid">
        <div class="stat-item">
          <div class="stat-number">${totalLearned}</div>
          <div class="stat-label">已学词数</div>
        </div>
        <div class="stat-item">
          <div class="stat-number">${mastered}</div>
          <div class="stat-label">已掌握(L3)</div>
        </div>
        <div class="stat-item">
          <div class="stat-number">${words.length}</div>
          <div class="stat-label">总词数</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">📊 等级分布</span>
        </div>
        <div class="progress-chart">
          <div class="level-bar-group">
            <div class="level-bar-label">
              <span>L0 陌生</span>
              <span>${levelDist[0]}</span>
            </div>
            <div class="level-bar-track">
              <div class="level-bar-fill l0" style="width:${(levelDist[0] / maxLevel) * 100}%">
                ${levelDist[0] > 0 ? levelDist[0] : ''}
              </div>
            </div>
          </div>
          <div class="level-bar-group">
            <div class="level-bar-label">
              <span>L1 认识</span>
              <span>${levelDist[1]}</span>
            </div>
            <div class="level-bar-track">
              <div class="level-bar-fill l1" style="width:${(levelDist[1] / maxLevel) * 100}%">
                ${levelDist[1] > 0 ? levelDist[1] : ''}
              </div>
            </div>
          </div>
          <div class="level-bar-group">
            <div class="level-bar-label">
              <span>L2 熟练</span>
              <span>${levelDist[2]}</span>
            </div>
            <div class="level-bar-track">
              <div class="level-bar-fill l2" style="width:${(levelDist[2] / maxLevel) * 100}%">
                ${levelDist[2] > 0 ? levelDist[2] : ''}
              </div>
            </div>
          </div>
          <div class="level-bar-group">
            <div class="level-bar-label">
              <span>L3 掌握</span>
              <span>${levelDist[3]}</span>
            </div>
            <div class="level-bar-track">
              <div class="level-bar-fill l3" style="width:${(levelDist[3] / maxLevel) * 100}%">
                ${levelDist[3] > 0 ? levelDist[3] : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">📅 本周统计</span>
        </div>
        <div class="stat-grid" style="grid-template-columns:repeat(4,1fr);">
          <div class="stat-item">
            <div class="stat-number">${weekDays}</div>
            <div class="stat-label">学习天数</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">${weekWords}</div>
            <div class="stat-label">学习词数</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">${weekAvgAccuracy}%</div>
            <div class="stat-label">平均正确率</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">🔥${streak}</div>
            <div class="stat-label">连续打卡</div>
          </div>
        </div>
      </div>

      ${totalLearned === 0 ? `
        <div class="empty-state mt-24">
          <div class="empty-state-icon">📝</div>
          <div class="empty-state-text">还没有学习记录<br>去今日页开始学习吧！</div>
        </div>
      ` : ''}

      ${sessions.length > 0 ? `
        <div class="card">
          <div class="card-header">
            <span class="card-title">📋 最近学习记录</span>
          </div>
          ${sessions.slice(-5).reverse().map(s => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);">
              <div>
                <div style="font-size:14px;font-weight:500;">${s.date}</div>
                <div style="font-size:12px;color:var(--text-muted);">${s.totalWords || 0} 词 · ${Math.ceil((s.duration || 0) / 60)}min</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:14px;font-weight:600;color:var(--primary-light);">${s.spellingAccuracy || 0}%</div>
                <div style="font-size:11px;color:var(--text-muted);">正确率</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function calculateStreak(sessions) {
    if (sessions.length === 0) return 0;
    const dates = [...new Set(sessions.map(s => s.date))];
    dates.sort((a, b) => b.localeCompare(a));

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < dates.length; i++) {
        const expected = new Date(today);
        expected.setDate(expected.getDate() - i);
        const expectedStr = expected.toISOString().split('T')[0];
        if (dates[i] === expectedStr) {
            streak++;
        } else { break; }
    }
    return streak;
}
