/**
 * Utility helpers
 */

/**
 * Show a toast notification
 */
export function showToast(message, type = 'info') {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

/**
 * Format date to display string
 */
export function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * Get greeting based on time of day
 */
export function getGreeting() {
    const h = new Date().getHours();
    if (h < 6) return '夜深了，注意休息 🌙';
    if (h < 12) return '早上好 ☀️';
    if (h < 14) return '中午好 🌞';
    if (h < 18) return '下午好 🌤️';
    if (h < 22) return '晚上好 🌙';
    return '夜深了，注意休息 🌙';
}

/**
 * Get today's date in Chinese format
 */
export function getTodayDisplay() {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const d = new Date();
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 星期${days[d.getDay()]}`;
}

/**
 * Randomly pick one meaning from semicolon-separated meanings
 */
export function pickRandomMeaning(meaningCn) {
    if (!meaningCn) return '';
    const parts = meaningCn.split(/[;；]/).map(s => s.trim()).filter(Boolean);
    return parts[Math.floor(Math.random() * parts.length)];
}

/**
 * Create HTML element from string
 */
export function createElement(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstChild;
}

/**
 * Debounce function
 */
export function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

/**
 * Simple confirm dialog
 */
export function confirmDialog(message) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
      <div class="modal-content" style="max-width:360px; margin:auto; border-radius:var(--radius-xl); text-align:center; padding:32px 24px;">
        <p style="font-size:16px; margin-bottom:24px; line-height:1.6;">${message}</p>
        <div class="btn-group" style="justify-content:center;">
          <button class="btn btn-secondary" id="confirm-cancel">取消</button>
          <button class="btn btn-danger" id="confirm-ok">确认</button>
        </div>
      </div>
    `;
        document.body.appendChild(overlay);

        overlay.querySelector('#confirm-cancel').onclick = () => { overlay.remove(); resolve(false); };
        overlay.querySelector('#confirm-ok').onclick = () => { overlay.remove(); resolve(true); };
    });
}
