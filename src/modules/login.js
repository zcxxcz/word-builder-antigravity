/**
 * Login / Register Page
 */
import { signIn, signUp, getUser } from '../services/auth.js';
import { fullSync } from '../services/sync.js';
import { navigateTo } from '../router.js';
import { showToast } from '../utils/helpers.js';

export async function renderLogin(container) {
  const user = getUser();

  // If already logged in, redirect
  if (user) {
    navigateTo('today');
    return;
  }

  let isRegisterMode = false;

  container.innerHTML = buildLoginHTML(isRegisterMode);
  bindEvents(container, () => isRegisterMode, (v) => {
    isRegisterMode = v;
    container.innerHTML = buildLoginHTML(isRegisterMode);
    bindEvents(container, () => isRegisterMode, arguments[2]);
  });
}

function buildLoginHTML(isRegister) {
  return `
    <div class="page login-page">
      <div class="login-container">
        <div class="login-logo">📖</div>
        <h1 class="login-title">初一背单词</h1>
        <p class="login-subtitle">${isRegister ? '创建新账号' : '登录以同步学习数据'}</p>

        <form id="auth-form" class="login-form">
          <div class="form-group">
            <label for="auth-email">邮箱</label>
            <input type="email" id="auth-email" placeholder="your@email.com" required autocomplete="email" />
          </div>

          <div class="form-group">
            <label for="auth-password">密码</label>
            <input type="password" id="auth-password" placeholder="${isRegister ? '设置密码（至少6位）' : '输入密码'}" required minlength="6" autocomplete="${isRegister ? 'new-password' : 'current-password'}" />
          </div>

          ${isRegister ? `
          <div class="form-group">
            <label for="auth-password-confirm">确认密码</label>
            <input type="password" id="auth-password-confirm" placeholder="再次输入密码" required minlength="6" autocomplete="new-password" />
          </div>
          ` : ''}

          <button type="submit" class="btn btn-primary btn-lg btn-full" id="auth-submit">
            ${isRegister ? '注册' : '登录'}
          </button>

          <div id="auth-error" class="login-error" style="display:none;"></div>
        </form>

        <div class="login-switch">
          ${isRegister
      ? '已有账号？<a href="#" id="switch-mode">去登录</a>'
      : '没有账号？<a href="#" id="switch-mode">注册</a>'}
        </div>

        <div class="login-skip">
          <a href="#" id="skip-login">跳过登录，仅本地使用</a>
        </div>
      </div>
    </div>
  `;
}

function bindEvents(container, getMode, setMode) {
  const form = container.querySelector('#auth-form');
  const errorEl = container.querySelector('#auth-error');
  const switchBtn = container.querySelector('#switch-mode');
  const skipBtn = container.querySelector('#skip-login');

  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = container.querySelector('#auth-email').value.trim();
    const password = container.querySelector('#auth-password').value;
    const submitBtn = container.querySelector('#auth-submit');
    const isRegister = getMode();

    // Validate
    if (isRegister) {
      const confirm = container.querySelector('#auth-password-confirm').value;
      if (password !== confirm) {
        showError(errorEl, '两次密码不一致');
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.textContent = isRegister ? '注册中...' : '登录中...';
    errorEl.style.display = 'none';

    try {
      if (isRegister) {
        const result = await signUp(email, password);
        // If Supabase returns a session (email confirm disabled), we're in
        if (result.session) {
          showToast('✅ 注册成功！', 'success');
        } else {
          // Email confirmation required — try auto sign in
          try {
            await signIn(email, password);
            showToast('✅ 注册成功！', 'success');
          } catch (signInErr) {
            // Email needs confirmation
            showError(errorEl, '注册成功！请检查邮箱完成验证后再登录。');
            submitBtn.disabled = false;
            submitBtn.textContent = '注册';
            return;
          }
        }
      } else {
        await signIn(email, password);
        showToast('✅ 登录成功！', 'success');
      }

      // Trigger full sync after login
      fullSync().catch(err => console.warn('Post-login sync failed:', err));

      // Navigate to main app
      navigateTo('today');
    } catch (err) {
      let msg = err.message || '操作失败';
      if (msg.includes('Invalid login')) msg = '邮箱或密码错误';
      if (msg.includes('Email not confirmed')) msg = '邮箱未验证，请检查收件箱完成验证';
      if (msg.includes('already registered') || msg.includes('already been registered')) msg = '该邮箱已注册，请直接登录';
      if (msg.includes('valid email')) msg = '请输入有效的邮箱地址';
      if (msg.includes('at least') || msg.includes('least 6')) msg = '密码至少需要6位';
      if (msg.includes('rate limit') || msg.includes('too many')) msg = '操作太频繁，请稍后再试';
      if (msg.includes('network') || msg.includes('fetch')) msg = '网络连接失败，请检查网络';
      showError(errorEl, msg);
      submitBtn.disabled = false;
      submitBtn.textContent = isRegister ? '注册' : '登录';
    }
  };

  if (switchBtn) {
    switchBtn.onclick = (e) => {
      e.preventDefault();
      setMode(!getMode());
    };
  }

  if (skipBtn) {
    skipBtn.onclick = (e) => {
      e.preventDefault();
      navigateTo('today');
    };
  }
}

function showError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}
